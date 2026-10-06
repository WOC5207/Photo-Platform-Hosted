"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveEquipmentContact } from "@/app/[locale]/dashboard/(protected)/equipment/contact/actions";
import { BookingPanel, fieldClass, primaryClass, useScene } from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import type { StudioGearContact } from "./types";

const METHODS = ["", "phone", "email", "wechat", "other"] as const;

/**
 * The contact details every equipment QR page shows. The easel holds a
 * preview of what someone who scans a label sees, following the form.
 */
export default function ContactScreen({ name, contact }: { name: string; contact: StudioGearContact }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const ts = useTranslations("equipmentScan");
  const scene = useScene("poster");
  const [method, setMethod] = useState(contact.method);
  const [label, setLabel] = useState(contact.label);
  const [value, setValue] = useState(contact.value);
  const [state, action, pending] = useActionState(saveEquipmentContact, { message: "" });

  useEffect(() => {
    if (!scene) return;
    const canvas = scene.setPoster("gear-contact", 0.62, 1200);
    const c = canvas.getContext("2d");
    if (c) {
      const { width: w, height: h } = canvas;
      const u = w / 100;
      const sans = '"Avenir Next", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      c.fillStyle = "#f7f4ef";
      c.fillRect(0, 0, w, h);
      // A phone's screen: the QR page's header, the owner, then the contact block.
      c.fillStyle = "rgba(28,26,22,0.5)";
      c.font = `600 ${3.6 * u}px ${mono}`;
      c.fillText(te("scanPageEyebrow").toUpperCase(), 8 * u, 14 * u);
      c.fillStyle = scene.accent();
      c.fillRect(8 * u, 18 * u, 14 * u, 1.2 * u);
      c.fillStyle = "#1c1a16";
      c.font = `500 ${4.4 * u}px ${sans}`;
      c.fillText(te("belongsTo"), 8 * u, 30 * u);
      c.font = `800 ${9 * u}px ${sans}`;
      c.fillText(name.toUpperCase().slice(0, 18), 8 * u, 42 * u);
      c.fillStyle = "rgba(28,26,22,0.12)";
      c.fillRect(8 * u, 52 * u, w - 16 * u, 0.4 * u);
      const shown = value.trim() && method;
      c.fillStyle = shown ? "#1c1a16" : "rgba(28,26,22,0.45)";
      c.font = `700 ${5.2 * u}px ${sans}`;
      c.fillText(shown ? (method === "other" ? label || ts("customLabel") : ts(method)) : ts("none"), 8 * u, 64 * u);
      if (shown) {
        c.font = `500 ${4.6 * u}px ${mono}`;
        c.fillStyle = "rgba(28,26,22,0.7)";
        c.fillText(value.trim().slice(0, 30), 8 * u, 74 * u);
        c.strokeStyle = "#1c1a16";
        c.lineWidth = 0.5 * u;
        c.fillStyle = "#1c1a16";
        c.font = `600 ${3.8 * u}px ${sans}`;
        const button = method === "phone" || method === "email" ? ts("contact") : ts("copy");
        c.strokeRect(8 * u, 82 * u, Math.min(w - 16 * u, c.measureText(button).width + 6 * u), 11 * u);
        c.fillText(button, 11 * u, 89 * u);
      }
      c.fillStyle = "rgba(28,26,22,0.45)";
      c.font = `400 ${3.2 * u}px ${sans}`;
      // The page's closing hint, wrapped to the card (by word, or by character
      // for text without spaces), at most three lines.
      const lines: string[] = [];
      let line = "";
      for (const part of te("scanPageHint").match(/\S+\s*|\s+/g) ?? []) {
        for (const piece of c.measureText(part).width > w - 16 * u ? [...part] : [part]) {
          if (line && c.measureText(line + piece).width > w - 16 * u) {
            lines.push(line.trimEnd());
            line = piece.trimStart();
          } else line += piece;
        }
      }
      if (line) lines.push(line.trimEnd());
      lines.slice(0, 3).forEach((text, i, shown) => c.fillText(text, 8 * u, h - (6 + (shown.length - 1 - i) * 4.4) * u));
    }
    scene.refresh();
  }, [scene, name, method, label, value, te, ts]);

  const labelClass = "grid gap-1 text-sm font-semibold text-fg-muted";
  return (
    <BookingPanel>
      <StudioHeading trail={t("studioEquipment")} title={ts("contactTitle")} />
      <p className="mt-4 text-sm text-fg-muted">{ts("contactHint")}</p>
      {/* Submitted by hand: a form action resets the form afterwards, which
          left the controlled method select showing "Not set". */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
        aria-busy={pending}
        className="mt-6 grid gap-4"
      >
        <label className={labelClass}>
          {ts("method")}
          <select name="equipmentContactMethod" value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {ts(m || "none")}
              </option>
            ))}
          </select>
        </label>
        {method === "other" && (
          <label className={labelClass}>
            {ts("customLabel")}
            <input name="equipmentContactLabel" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} className={fieldClass} />
          </label>
        )}
        <label className={labelClass}>
          {ts("contactValue")}
          <input name="equipmentContactValue" maxLength={250} value={value} onChange={(e) => setValue(e.target.value)} className={fieldClass} />
        </label>
        {state.message && !pending && <FormNote tone={state.message === "saved" ? "ok" : "error"}>{ts(state.message)}</FormNote>}
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? ts("working") : ts("save")}
          <span aria-hidden="true" className="text-lg">→</span>
        </button>
      </form>
    </BookingPanel>
  );
}
