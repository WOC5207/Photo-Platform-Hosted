"use client";
import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import { scanEquipment } from "@/app/[locale]/dashboard/(protected)/preparation/scanner-actions";

type Item = Extract<Awaited<ReturnType<typeof scanEquipment>>, { item: unknown }>["item"];
const statusKey = { SIGNED_OUT: "quickStatusSignedOut", IN_INVENTORY: "statusInInventory", BROKEN: "statusBroken", MAINTENANCE: "statusMaintenance", OTHER: "statusOther" } as const;

export default function EquipmentScanner({ checklistId }: { checklistId: string }) {
  const t = useTranslations("equipmentScan");
  const te = useTranslations("equipment");
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [value, setValue] = useState("");
  const [matchedCode, setMatchedCode] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function stop() { generation.current++; scanner.current?.destroy(); scanner.current = null; setRunning(false); }
  useEffect(() => () => { generation.current++; scanner.current?.destroy(); }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  async function resolve(code: string, operation = "lookup") {
    if (locked.current) return;
    locked.current = true;
    stop();
    const request = generation.current;
    setBusy(true); setError(""); setSaved(false);
    if (operation === "lookup") setItem(null);
    try {
      const result = await scanEquipment(checklistId, code, operation);
      if (generation.current !== request) return;
      if (result.error) setError(t(result.error));
      else if (result.item) { setItem(result.item); setValue(code); setMatchedCode(code); setSaved(operation !== "lookup"); if (operation !== "lookup") router.refresh(); }
    } catch { if (generation.current === request) setError(t("failed")); }
    finally { locked.current = false; setBusy(false); }
  }

  async function start() {
    stop(); setError(""); setItem(null); setSaved(false); setBusy(true);
    const request = generation.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("camera");
      const { default: Scanner } = await import("qr-scanner");
      if (generation.current !== request || !video.current) return;
      const instance = new Scanner(video.current, result => { void resolve(result.data); }, { preferredCamera: "environment", returnDetailedScanResult: true });
      scanner.current = instance;
      await instance.start();
      if (generation.current !== request) { instance.destroy(); return; }
      setRunning(true);
      const available = await Scanner.listCameras(true);
      if (generation.current === request) setCameras(available);
    } catch { if (generation.current === request) { stop(); setError(t("cameraError")); } }
    finally { setBusy(false); }
  }

  async function scanFile(file?: File) {
    if (!file) return;
    stop(); setItem(null); setSaved(false); setError(""); setBusy(true);
    const request = generation.current;
    try {
      const { default: Scanner } = await import("qr-scanner");
      const result = await Scanner.scanImage(file, { returnDetailedScanResult: true });
      if (generation.current === request) await resolve(result.data);
    } catch { if (generation.current === request) setError(t("imageError")); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-4">
    <Button className="self-start" aria-expanded={open} onClick={() => { stop(); setOpen(!open); }}>{open ? t("close") : t("scan")}</Button>
    {open && <section aria-label={t("scan")} className="rounded-xl border border-border bg-control p-4 flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t("hint")}</p>
      <video ref={video} muted playsInline className={`w-full max-h-72 rounded-lg bg-page ${running ? "" : "hidden"}`} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={running ? stop : start}>{running ? t("stop") : t("start")}</Button>
        {running && cameras.length > 1 && <select aria-label={t("camera")} className={controlClasses} onChange={async e => { try { await scanner.current?.setCamera(e.target.value); } catch { stop(); setError(t("cameraError")); } }} defaultValue="">
          <option value="" disabled>{t("camera")}</option>
          {cameras.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
        </select>}
      </div>
      <label className="text-sm font-semibold flex flex-col gap-2">{t("image")}
        <input type="file" accept="image/*" disabled={busy} className={controlClasses} onChange={e => { void scanFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void resolve(value); }}>
        <label htmlFor={`qr-link-${checklistId}`} className="text-sm font-semibold">{t("paste")}</label>
        <input id={`qr-link-${checklistId}`} value={value} onChange={e => setValue(e.target.value)} maxLength={2048} required className={controlClasses} />
        <Button type="submit" disabled={busy || !value.trim()}>{t("find")}</Button>
      </form>
      {busy && <p role="status" className="text-sm">{t("working")}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {item && <div className="rounded-lg bg-surface p-4 flex flex-col gap-3">
        <h3 className="font-semibold break-words">{item.name}</h3>
        <p className="text-sm text-fg-subtle">{item.category}</p>
        {item.photo && <img src={item.photo} alt={item.name} className="max-h-48 w-full object-contain rounded-lg" />}
        {item.serialNumber && <p className="text-sm break-words">{te("serialShort")}: {item.serialNumber}</p>}
        <p className="text-sm">{te("inventoryStatus")}: {te(statusKey[item.status])}</p>
        {!item.included ? <><p className="text-sm">{t("notIncluded")}</p><Button disabled={busy} onClick={() => resolve(matchedCode, "add")}>{t("add")}</Button></> :
          <div className="flex flex-wrap gap-2">{(["SIGNED_OUT", "IN_INVENTORY", "BROKEN"] as const).map(status => <Button key={status} disabled={busy || item.status === status} aria-pressed={item.status === status} onClick={() => resolve(matchedCode, status)}>{te(statusKey[status])}</Button>)}</div>}
        {saved && <p role="status" className="text-sm text-success">{t("saved")}</p>}
        <Button disabled={busy} onClick={() => { stop(); setItem(null); setValue(""); setSaved(false); setError(""); }}>{t("another")}</Button>
      </div>}
      <Link href="/dashboard/equipment/contact" className={buttonClasses({ variant: "ghost", className: "self-start" })}>{t("contactTitle")}</Link>
    </section>}
  </div>;
}
