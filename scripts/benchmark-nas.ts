type Sample = { url: string; durationMs: number; ok: boolean; status: number };

const baseUrl = (process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const concurrency = Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY ?? 10));
const rounds = Math.max(1, Number(process.env.BENCHMARK_ROUNDS ?? 5));
const owner = process.env.BENCHMARK_OWNER;
const eventSlug = process.env.BENCHMARK_EVENT_SLUG;
const bookingToken = process.env.BENCHMARK_BOOKING_TOKEN;
const equipmentToken = process.env.BENCHMARK_EQUIPMENT_TOKEN;
const mediaPath = process.env.BENCHMARK_MEDIA_PATH;
const cookie = process.env.BENCHMARK_SESSION_COOKIE;

const paths = [
  "/en",
  ...(owner ? [`/en/u/${encodeURIComponent(owner)}`] : []),
  ...(owner && eventSlug
    ? [`/en/u/${encodeURIComponent(owner)}/gallery/${encodeURIComponent(eventSlug)}`]
    : []),
  ...(bookingToken ? [`/en/book/${encodeURIComponent(bookingToken)}`] : []),
  ...(equipmentToken ? [`/en/equipment/${encodeURIComponent(equipmentToken)}`] : []),
  ...(cookie
    ? [
        "/en/dashboard",
        "/en/dashboard/events",
        "/en/dashboard/equipment",
        "/en/dashboard/equipment/qr-labels"
      ]
    : [])
];

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

async function request(path: string): Promise<Sample> {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : undefined
    });
    await response.arrayBuffer();
    return { url: path, durationMs: performance.now() - started, ok: response.ok || response.status === 307, status: response.status };
  } catch {
    return { url: path, durationMs: performance.now() - started, ok: false, status: 0 };
  }
}

async function main() {
  const cold = await Promise.all(paths.map(request));
  const coldP95 = percentile(cold.map((sample) => sample.durationMs), 0.95);
  for (const path of paths) await request(path);
  const work = Array.from({ length: rounds * concurrency }, (_, index) => paths[index % paths.length]);
  const samples: Sample[] = [];
  for (let offset = 0; offset < work.length; offset += concurrency) {
    samples.push(...(await Promise.all(work.slice(offset, offset + concurrency).map(request))));
  }
  const durations = samples.map((sample) => sample.durationMs);
  const failures = samples.filter((sample) => !sample.ok);
  const result = {
    baseUrl,
    concurrency,
    requests: samples.length,
    coldP95Ms: Math.round(coldP95),
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations)),
    errorRate: failures.length / Math.max(1, samples.length),
    failures: failures.slice(0, 10).map(({ url, status }) => ({ url, status }))
  };

  let metadata304P95Ms: number | null = null;
  if (mediaPath) {
    const mediaUrl = `${baseUrl}${mediaPath.startsWith("/") ? mediaPath : `/${mediaPath}`}`;
    const first = await fetch(mediaUrl);
    await first.arrayBuffer();
    const etag = first.headers.get("etag");
    if (!first.ok || !etag) throw new Error("BENCHMARK_MEDIA_PATH did not return an ETag-enabled public image.");
    const conditional = await Promise.all(
      Array.from({ length: Math.max(10, concurrency) }, async () => {
        const started = performance.now();
        const response = await fetch(mediaUrl, { headers: { "If-None-Match": etag } });
        await response.arrayBuffer();
        return { durationMs: performance.now() - started, status: response.status };
      })
    );
    metadata304P95Ms = Math.round(percentile(conditional.map((sample) => sample.durationMs), 0.95));
    if (conditional.some((sample) => sample.status !== 304)) {
      throw new Error("A conditional public-image request did not return 304.");
    }
    Object.assign(result, { metadata304P95Ms });
  }
  console.log(JSON.stringify(result, null, 2));
  if (
    result.p95Ms > 750 ||
    result.coldP95Ms > 1500 ||
    result.errorRate >= 0.01 ||
    (metadata304P95Ms !== null && metadata304P95Ms > 250)
  ) process.exitCode = 1;
}

void main();
