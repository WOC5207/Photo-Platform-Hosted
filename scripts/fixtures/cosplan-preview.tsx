import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import CosplanSlotEditor from "../../src/components/admin/CosplanSlotEditor";
import CosplanEditor from "../../src/components/cosplan/CosplanEditor";
import en from "../../messages/en.json";

type PreviewWindow = Window & {
  previewLabels: Record<string, string>;
  previewTemplate: {
    id: string; assetToken: string; layoutVersion: number; imageUrl: string;
    width: number; height: number; foregroundUrl: null; foregroundToken: null;
    slots: import("../../src/lib/cosplanTypes").CosplanSlot[];
  };
};
const preview = window as unknown as PreviewWindow;
document.documentElement.classList.add("light");

function App() {
  const [view, setView] = useState<"admin" | "cosplayer">("admin");
  const [template, setTemplate] = useState(preview.previewTemplate);
  const [sampleStatus, setSampleStatus] = useState("");
  async function openView(next: "admin" | "cosplayer") {
    const response = await fetch("/preview/template");
    if (response.ok) setTemplate(await response.json());
    setView(next);
  }
  async function addSampleCharacter() {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/jpeg,image/png,image/webp"]');
    if (!input) return setSampleStatus("Choose the poster first, then add the sample character.");
    const canvas = document.createElement("canvas");
    canvas.width = 220; canvas.height = 520;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#e8a688";
    context.beginPath(); context.ellipse(110, 105, 65, 80, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#22add4";
    context.fillRect(50, 185, 120, 330);
    context.fillStyle = "#143359";
    context.font = "bold 26px Arial";
    context.fillText("MIKU", 66, 340);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No image")), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "Hatsune Miku.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setSampleStatus("");
  }
  return <NextIntlClientProvider locale="en" messages={en}>
    <div className="min-h-screen bg-page p-5 text-fg">
      <header className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div><p className="font-meta text-xs uppercase tracking-[0.16em] text-accent-text">Cosplan local preview</p><h1 className="font-display text-2xl font-semibold">Character name slots</h1></div>
        <nav className="flex gap-2" aria-label="Preview views"><button className="rounded-lg border border-border px-4 py-2" onClick={() => void openView("admin")}>Admin setup</button><button className="rounded-lg border border-border px-4 py-2" onClick={() => void openView("cosplayer")}>Cosplayer view</button></nav>
      </header>
      <main className="mx-auto max-w-7xl">
        {view === "admin" ? <><p className="mb-4 text-sm text-fg-subtle">Select a photo slot, enable its linked character-name field, position the box, and save. Switch to Cosplayer view to try it.</p><CosplanSlotEditor key={`admin-${template.layoutVersion}`} template={template} labels={preview.previewLabels as React.ComponentProps<typeof CosplanSlotEditor>["labels"]} /></>
          : <><div className="mb-4 flex flex-wrap items-center gap-3"><p className="text-sm text-fg-subtle">Choose the sample poster, add a character, then choose a photo slot.</p><button className="rounded-lg bg-accent px-4 py-2 font-semibold text-white" onClick={() => void addSampleCharacter()}>Add sample character</button><span role="status" className="text-sm">{sampleStatus}</span></div><CosplanEditor key={`cosplayer-${template.layoutVersion}`} templates={[{ ...template, title: "Lineup sample", titleEn: "Lineup sample", titleZh: "示例海报" }]} /></>}
      </main>
    </div>
  </NextIntlClientProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
