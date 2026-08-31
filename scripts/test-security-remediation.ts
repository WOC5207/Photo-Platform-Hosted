import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clientIp } from "../src/lib/clientIp";
import {
  quarantineUserFiles,
  removeQuarantinedUserFiles,
  restoreQuarantinedUserFiles,
  userDir
} from "../src/lib/images";
import {
  MultipartUploadError,
  parseSingleImageMultipart
} from "../src/lib/multipartUpload";
import {
  HOME_PHOTO_WEIGHT_FALLBACK,
  homePhotoWeightScale,
  normalizeHomePhotoWeight
} from "../src/lib/homePhotoWeight";
import {
  isSafeExternalHttpUrl,
  safeExternalHttpUrl
} from "../src/lib/externalUrl";
import { isTrustedMutationOrigin } from "../src/lib/requestSecurity";
import { rateLimit } from "../src/lib/rate-limit";
import { passwordFitsHashLimit } from "../src/lib/password";

function multipartRequest(files: Array<[string, Uint8Array]>, fields = true) {
  const form = new FormData();
  if (fields) {
    form.set("eventId", "event-1");
    form.set("storagePreset", "balanced");
  }
  for (const [name, bytes] of files) {
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    form.append("file", new Blob([body], { type: "image/jpeg" }), name);
  }
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

async function expectUploadError(
  request: Request,
  expected: MultipartUploadError["code"]
) {
  await assert.rejects(
    parseSingleImageMultipart(request),
    (error) => error instanceof MultipartUploadError && error.code === expected
  );
}

async function main() {
  assert.equal(isSafeExternalHttpUrl("https://example.com/profile"), true);
  assert.equal(isSafeExternalHttpUrl("http://localhost:3000/profile"), true);
  assert.equal(isSafeExternalHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalHttpUrl("data:text/html,unsafe"), false);
  assert.equal(isSafeExternalHttpUrl("https://user:pass@example.com"), false);
  assert.equal(safeExternalHttpUrl(" javascript:alert(1) "), "");
  assert.equal(passwordFitsHashLimit("a".repeat(72)), true);
  assert.equal(passwordFitsHashLimit("a".repeat(73)), false);
  assert.equal(passwordFitsHashLimit("密".repeat(24)), true);
  assert.equal(passwordFitsHashLimit("密".repeat(25)), false);

  process.env.APP_BASE_URL = "https://photos.example.test";
  const internalUrl = "http://app:3000/api/admin/photos";
  assert.equal(
    isTrustedMutationOrigin(
      new Request(internalUrl, {
        method: "POST",
        headers: { origin: "https://photos.example.test" }
      })
    ),
    true
  );
  assert.equal(
    isTrustedMutationOrigin(
      new Request(internalUrl, {
        method: "POST",
        headers: { origin: "https://tenant.example.test" }
      })
    ),
    false
  );
  assert.equal(
    isTrustedMutationOrigin(
      new Request(internalUrl, {
        method: "POST",
        headers: { "sec-fetch-site": "same-site" }
      })
    ),
    false
  );
  console.log("PASS  external URLs and cookie-auth mutations reject unsafe origins");

  assert.equal(normalizeHomePhotoWeight(Number.NaN), HOME_PHOTO_WEIGHT_FALLBACK);
  assert.equal(normalizeHomePhotoWeight(-10), 1);
  assert.equal(normalizeHomePhotoWeight(99), 5);
  assert.ok(homePhotoWeightScale(1) < homePhotoWeightScale(3));
  assert.ok(homePhotoWeightScale(3) < homePhotoWeightScale(5));
  console.log("PASS  homepage photo weights normalize and scale from 1-5");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "photo-security-"));
  process.env.PHOTOS_DIR = root;
  process.env.UPLOAD_MAX_MB = "0.001";
  process.env.TRUSTED_PROXY_HOPS = "1";

  try {
    assert.equal(
      clientIp(new Headers({ "x-forwarded-for": "spoofed, 198.51.100.7" })),
      "198.51.100.7",
      "the trusted proxy hop must win over a caller-controlled leftmost value"
    );
    process.env.TRUSTED_PROXY_HOPS = "2";
    assert.equal(
      clientIp(
        new Headers({
          "x-forwarded-for": "192.0.2.8, 203.0.113.4, 198.51.100.7"
        })
      ),
      "203.0.113.4"
    );
    process.env.TRUSTED_PROXY_HOPS = "1";
    assert.equal(
      clientIp(new Headers({ "x-forwarded-for": "not-an-ip" })),
      "unknown"
    );

    assert.equal(rateLimit("security-test", { limit: 1, windowMs: 60_000 }), true);
    assert.equal(rateLimit("security-test", { limit: 1, windowMs: 60_000 }), false);

    for (const invalid of ["", ".", "..", "../victim", "..\\victim", "a/b"]) {
      assert.throws(() => userDir(invalid), /Invalid storage owner id|escaped/);
    }
    const contained = userDir("owner-1");
    assert.equal(path.dirname(contained), path.join(path.resolve(root), "u"));
    await fs.mkdir(contained, { recursive: true });
    await fs.writeFile(path.join(contained, "keep.txt"), "recoverable");
    const quarantined = await quarantineUserFiles("owner-1");
    assert.ok(quarantined);
    assert.equal(await fs.stat(contained).then(() => true).catch(() => false), false);
    await restoreQuarantinedUserFiles("owner-1", quarantined);
    assert.equal(await fs.readFile(path.join(contained, "keep.txt"), "utf8"), "recoverable");
    const quarantinedAgain = await quarantineUserFiles("owner-1");
    await removeQuarantinedUserFiles(quarantinedAgain);
    assert.equal(
      quarantinedAgain
        ? await fs.stat(quarantinedAgain).then(() => true).catch(() => false)
        : true,
      false
    );

    const bytes = new Uint8Array(256).fill(7);
    const parsed = await parseSingleImageMultipart(
      multipartRequest([["small.jpg", bytes]])
    );
    assert.equal(parsed.file.name, "small.jpg");
    assert.equal(parsed.file.type, "image/jpeg");
    assert.equal(parsed.file.size, bytes.byteLength);
    assert.deepEqual(new Uint8Array(await fs.readFile(parsed.file.path)), bytes);
    assert.equal(parsed.fields.get("storagePreset"), "balanced");
    const parsedTempDir = path.dirname(parsed.file.path);
    await parsed.cleanup();
    assert.equal(await fs.stat(parsedTempDir).then(() => true).catch(() => false), false);

    const declared = multipartRequest([["small.jpg", bytes]]);
    const declaredHeaders = new Headers(declared.headers);
    declaredHeaders.set("content-length", String(2 * 1024 * 1024));
    await expectUploadError(
      new Request(declared.url, {
        method: "POST",
        headers: declaredHeaders,
        body: declared.body,
        duplex: "half"
      } as RequestInit),
      "tooLarge"
    );

    await expectUploadError(
      multipartRequest([["large.jpg", new Uint8Array(2048).fill(9)]]),
      "tooLarge"
    );
    await expectUploadError(
      multipartRequest([
        ["one.jpg", new Uint8Array(100)],
        ["two.jpg", new Uint8Array(100)]
      ]),
      "tooManyFiles"
    );

    const uploadTempRoot = path.join(root, ".upload-tmp");
    const leftovers = await fs.readdir(uploadTempRoot).catch(() => [] as string[]);
    assert.deepEqual(leftovers, [], "failed uploads must not leave temporary files");
    console.log("PASS  streaming upload limits, cleanup, proxy trust and path containment");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
