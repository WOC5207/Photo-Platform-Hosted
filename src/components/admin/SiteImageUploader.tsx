"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeSiteImage } from "@/app/[locale]/dashboard/(protected)/settings/actions";
import StatusMessage from "@/components/ui/StatusMessage";

type Kind = "background" | "logo" | "contactQrEn" | "contactQrZh";

const LABELS: Record<
  Kind,
  { section: string; hint: string; upload: string; remove: string; none: string; error: string }
> = {
  background: {
    section: "backgroundImageSection",
    hint: "backgroundImageHint",
    upload: "uploadBackground",
    remove: "removeBackground",
    none: "noBackground",
    error: "uploadBackgroundError"
  },
  logo: {
    section: "logoSection",
    hint: "logoHint",
    upload: "uploadLogo",
    remove: "removeLogo",
    none: "noLogo",
    error: "uploadLogoError"
  },
  contactQrEn: {
    section: "contactQrEnSection",
    hint: "contactQrEnHint",
    upload: "uploadContactQrEn",
    remove: "removeContactQrEn",
    none: "noContactQrEn",
    error: "uploadContactQrEnError"
  },
  contactQrZh: {
    section: "contactQrZhSection",
    hint: "contactQrZhHint",
    upload: "uploadContactQrZh",
    remove: "removeContactQrZh",
    none: "noContactQrZh",
    error: "uploadContactQrZhError"
  }
};

export default function SiteImageUploader({
  kind,
  currentUrl
}: {
  kind: Kind;
  currentUrl: string;
}) {
  const t = useTranslations("adminSite");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayUrl, setDisplayUrl] = useState(currentUrl);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "saved" | "error"
  >("idle");
  const [errorCode, setErrorCode] = useState("");
  const L = LABELS[kind];

  useEffect(() => {
    if (!objectUrlRef.current) setDisplayUrl(currentUrl);
  }, [currentUrl]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  function releaseObjectUrl() {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;

    releaseObjectUrl();
    objectUrlRef.current = URL.createObjectURL(file);
    setDisplayUrl(objectUrlRef.current);
    setBusy(true);
    setStatus("uploading");
    setErrorCode("");

    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", file);
      const res = await fetch("/api/admin/site-image", {
        method: "POST",
        body
      });
      const result = (await res.json().catch(() => null)) as {
        error?: unknown;
        url?: unknown;
      } | null;

      if (!res.ok || typeof result?.url !== "string") {
        releaseObjectUrl();
        setDisplayUrl(currentUrl);
        setErrorCode(
          typeof result?.error === "string" ? result.error : "unknown"
        );
        setStatus("error");
        return;
      }

      releaseObjectUrl();
      setDisplayUrl(result.url);
      setStatus("saved");
      router.refresh();
    } catch {
      releaseObjectUrl();
      setDisplayUrl(currentUrl);
      setErrorCode("unknown");
      setStatus("error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const errorMessage =
    errorCode === "tooLarge"
      ? t("uploadImageTooLarge")
      : errorCode === "quotaExceeded"
        ? t("uploadImageQuotaExceeded")
        : t(L.error);

  const previewCls =
    kind === "logo"
      ? "h-16 w-auto max-w-[12rem] rounded-lg border border-border bg-page object-contain p-2"
      : kind === "contactQrEn" || kind === "contactQrZh"
        ? "h-32 w-32 rounded-lg border border-border bg-page object-contain p-2"
        : "h-32 w-56 rounded-lg border border-border object-cover";

  return (
    <section
      className="flex flex-col gap-3 border-t border-border pt-6"
      aria-busy={busy}
    >
      <h2 className="text-lg font-semibold">{t(L.section)}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t(L.hint)}</p>

      {displayUrl ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={t("siteImagePreviewAlt")}
            className={`${previewCls} transition-opacity ${busy ? "opacity-70" : "opacity-100"}`}
          />
          <form
            action={removeSiteImage.bind(null, kind)}
            onSubmit={(event) => {
              if (!confirm(t("confirmRemoveImage"))) event.preventDefault();
            }}
          >
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-10 items-center rounded-lg border border-danger-border px-3 py-2 text-sm font-semibold text-danger transition hover:border-danger hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-11"
            >
              {t(L.remove)}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-fg-subtle">{t(L.none)}</p>
      )}

      <label
        className={`flex min-h-11 w-fit items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm font-medium transition focus-within:ring-2 focus-within:ring-accent/40 ${
          busy
            ? "cursor-wait border-accent bg-accent-surface text-fg"
            : "cursor-pointer border-border-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="sr-only"
        />
        <span>{busy ? t("uploadImageProcessing") : `+ ${t(L.upload)}`}</span>
      </label>

      {status === "saved" && (
        <StatusMessage kind="success">{t("uploadImageSaved")}</StatusMessage>
      )}
      {status === "error" && (
        <StatusMessage kind="error">{errorMessage}</StatusMessage>
      )}
    </section>
  );
}
