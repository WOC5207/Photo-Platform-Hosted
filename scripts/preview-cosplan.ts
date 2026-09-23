/** Local, sample-only Cosplan preview; runs without a database or account. */
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { parseCosplanSlots } from "../src/lib/cosplanTypes";
import en from "../messages/en.json";

async function main() {
  const source = await readFile("src/app/[locale]/admin/(protected)/cosplan/page.tsx", "utf8");
  const slotLabelsSource = source.match(/const slotLabels = \{([\s\S]*?)\n  \};/)?.[1];
  if (!slotLabelsSource) throw new Error("Could not read Cosplan admin labels");
  const labels: Record<string, string> = {};
  for (const [, key, message] of slotLabelsSource.matchAll(/(\w+): t\("([^\"]+)"\)/g)) labels[key] = en.adminCosplan[message as keyof typeof en.adminCosplan];
  const bundle = await build({ entryPoints: ["scripts/fixtures/cosplan-preview.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "preview-router", setup(builder) {
    builder.onResolve({ filter: /^@\/i18n\/navigation$/ }, () => ({ path: "preview-router", namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, () => ({ contents: "export const useRouter = () => ({ refresh() {} });", loader: "js" }));
  } }] });
  const styles = (await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
  const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#143359"/><path d="M0 100L800 0M0 500L800 390M0 900L800 790" stroke="#225782" stroke-width="80" opacity=".5"/><text x="400" y="85" fill="white" text-anchor="middle" font-family="Arial" font-size="48" font-weight="bold">COSPLAY LINEUP</text><g fill="white"><rect x="40" y="220" width="220" height="580"/><rect x="290" y="220" width="220" height="580"/><rect x="540" y="220" width="220" height="580"/></g><g fill="#0c1a2a"><rect x="40" y="800" width="220" height="58"/><rect x="290" y="800" width="220" height="58"/><rect x="540" y="800" width="220" height="58"/></g><g fill="white" font-family="Arial" font-size="22" font-weight="bold" text-anchor="middle"><text x="150" y="205">FRIDAY</text><text x="400" y="205">SATURDAY</text><text x="650" y="205">SUNDAY</text></g></svg>`;
  let layoutVersion = 1;
  let slots = parseCosplanSlots([40, 290, 540].map((x, index) => ({ id: `slot-${index + 1}`, nameEn: ["Friday", "Saturday", "Sunday"][index], nameZh: ["周五", "周六", "周日"][index], x, y: 220, width: 220, height: 580, ...(index === 0 ? { nameText: { x: 40, y: 800, width: 220, height: 48, fontSize: 28, fill: "#ffffff", align: "center", bold: false } } : {}) })), 800, 1000);
  const template = () => ({ id: "preview", assetToken: "preview", layoutVersion, imageUrl: "/poster.svg", width: 800, height: 1000, foregroundUrl: null, foregroundToken: null, slots });
  const server = createServer(async (request, response) => {
    const url = request.url ?? "/";
    if (url === "/app.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].contents); return; }
    if (url === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(styles); return; }
    if (url === "/poster.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end(poster); return; }
    if (url === "/preview/template") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(template())); return; }
    if (url === "/api/admin/cosplan-templates/preview/layout" && request.method === "POST") {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const incoming = JSON.parse(Buffer.concat(chunks).toString()) as { slots: unknown };
        const parsed = parseCosplanSlots(incoming.slots, 800, 1000);
        if (!Array.isArray(incoming.slots) || parsed.length !== incoming.slots.length) throw new Error("invalidSlots");
        slots = parsed; layoutVersion += 1;
        response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ slots, layoutVersion }));
      } catch { response.writeHead(400); response.end(); }
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.previewLabels=${JSON.stringify(labels)};window.previewTemplate=${JSON.stringify(template())}</script><script src="/app.js"></script></body></html>`);
  });
  server.listen(3001, "127.0.0.1", () => console.log("Cosplan preview: http://127.0.0.1:3001"));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
