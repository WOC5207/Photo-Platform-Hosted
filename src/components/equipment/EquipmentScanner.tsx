"use client";

import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import {
  scanEquipment,
  type ScanProgress,
  type ScanSessionMode
} from "@/app/[locale]/dashboard/(protected)/preparation/scanner-actions";

type ScannedItem = {
  id: string;
  name: string;
  serialNumber: string;
  photo: string | null;
  category: string;
  status: "SIGNED_OUT" | "IN_INVENTORY" | "MAINTENANCE" | "BROKEN" | "OTHER";
  eventState: "PLANNED" | "AT_EVENT" | "RETURNED" | "BROKEN" | null;
  included: boolean;
};

type ScanFeedback = {
  key: number;
  kind: "success" | "duplicate" | "error";
  message: string;
  item?: ScannedItem;
};

const MODES: ScanSessionMode[] = ["ARRIVAL", "RETURN", "REPORT_BROKEN"];

export default function EquipmentScanner({
  checklistId,
  initialProgress
}: {
  checklistId: string;
  initialProgress: ScanProgress;
}) {
  const t = useTranslations("equipmentScan");
  const te = useTranslations("equipment");
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const modeRef = useRef<ScanSessionMode>("ARRIVAL");
  const recentlyScanned = useRef(new Map<string, number>());
  const feedbackKey = useRef(0);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [mode, setModeState] = useState<ScanSessionMode>("ARRIVAL");
  const [value, setValue] = useState("");
  const [progress, setProgress] = useState(initialProgress);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [history, setHistory] = useState<ScanFeedback[]>([]);
  const hasUpdates = useRef(false);

  useEffect(() => {
    setProgress(initialProgress);
  }, [
    initialProgress.total,
    initialProgress.planned,
    initialProgress.atEvent,
    initialProgress.returned,
    initialProgress.broken
  ]);

  function stopCamera() {
    generation.current += 1;
    scanner.current?.destroy();
    scanner.current = null;
    setRunning(false);
  }

  function closeScanner() {
    stopCamera();
    setOpen(false);
    if (hasUpdates.current) {
      hasUpdates.current = false;
      router.refresh();
    }
  }

  useEffect(() => () => {
    generation.current += 1;
    scanner.current?.destroy();
  }, []);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  function setMode(nextMode: ScanSessionMode) {
    modeRef.current = nextMode;
    setModeState(nextMode);
    setFeedback(null);
  }

  function pulse(kind: ScanFeedback["kind"]) {
    if (!("vibrate" in navigator)) return;
    if (kind === "success") navigator.vibrate(60);
    else if (kind === "duplicate") navigator.vibrate([35, 45, 35]);
    else navigator.vibrate([90, 60, 90]);
  }

  async function processCode(code: string) {
    const normalized = code.trim();
    if (!normalized || locked.current) return;
    const now = Date.now();
    const recent = recentlyScanned.current.get(normalized);
    if (recent && now - recent < 2200) return;

    locked.current = true;
    recentlyScanned.current.set(normalized, now);
    const requestGeneration = generation.current;
    const operation = modeRef.current;
    setBusy(true);
    setFeedback(null);

    try {
      const result = await scanEquipment(checklistId, normalized, operation);
      if (generation.current !== requestGeneration) return;
      if (result.error) {
        const next = { key: ++feedbackKey.current, kind: "error" as const, message: t(result.error) };
        setFeedback(next);
        setHistory((current) => [next, ...current].slice(0, 4));
        pulse("error");
        return;
      }

      const kind = result.duplicate ? "duplicate" as const : "success" as const;
      const message = result.duplicate
        ? t("alreadyProcessed", { name: result.item.name })
        : result.added
          ? t("addedAndProcessed", { name: result.item.name })
          : t("processed", { name: result.item.name });
      const next = { key: ++feedbackKey.current, kind, message, item: result.item as ScannedItem };
      setProgress(result.progress);
      setFeedback(next);
      setHistory((current) => [next, ...current].slice(0, 4));
      hasUpdates.current ||= !result.duplicate;
      pulse(kind);
    } catch {
      if (generation.current === requestGeneration) {
        const next = { key: ++feedbackKey.current, kind: "error" as const, message: t("failed") };
        setFeedback(next);
        setHistory((current) => [next, ...current].slice(0, 4));
        pulse("error");
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function start() {
    stopCamera();
    setFeedback(null);
    setBusy(true);
    const requestGeneration = generation.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("camera");
      const { default: Scanner } = await import("qr-scanner");
      if (generation.current !== requestGeneration || !video.current) return;
      const preview = video.current;
      preview.muted = true;
      preview.defaultMuted = true;
      preview.autoplay = true;
      preview.setAttribute("playsinline", "");
      // Older iOS WebKit versions still consult the prefixed attribute.
      preview.setAttribute("webkit-playsinline", "");
      const instance = new Scanner(
        preview,
        (result) => { void processCode(result.data); },
        { preferredCamera: "environment", returnDetailedScanResult: true, highlightScanRegion: true }
      );
      scanner.current = instance;
      await instance.start();
      if (generation.current !== requestGeneration) {
        instance.destroy();
        return;
      }
      setRunning(true);
      const available = await Scanner.listCameras(true);
      if (generation.current === requestGeneration) setCameras(available);
    } catch {
      if (generation.current === requestGeneration) {
        stopCamera();
        setFeedback({ key: ++feedbackKey.current, kind: "error", message: t("cameraError") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function scanFile(file?: File) {
    if (!file) return;
    setFeedback(null);
    setBusy(true);
    const requestGeneration = generation.current;
    try {
      const { default: Scanner } = await import("qr-scanner");
      const result = await Scanner.scanImage(file, { returnDetailedScanResult: true });
      if (generation.current === requestGeneration) await processCode(result.data);
    } catch {
      if (generation.current === requestGeneration) {
        setFeedback({ key: ++feedbackKey.current, kind: "error", message: t("imageError") });
      }
    } finally {
      setBusy(false);
    }
  }

  const processed = mode === "ARRIVAL"
    ? progress.atEvent + progress.returned + progress.broken
    : mode === "RETURN"
      ? progress.returned + progress.broken
      : progress.broken;
  const progressLabel = mode === "ARRIVAL"
    ? t("arrivalProgress")
    : mode === "RETURN"
      ? t("returnProgress")
      : t("brokenProgress");
  const feedbackClass = feedback?.kind === "error"
    ? "border-danger-border bg-danger-surface text-danger-strong"
    : feedback?.kind === "duplicate"
      ? "border-warning-border bg-warning-surface text-warning"
      : "border-success-border bg-success-surface text-success-strong";

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="primary"
        className="self-start"
        aria-expanded={open}
        disabled={busy}
        onClick={() => open ? closeScanner() : setOpen(true)}
      >
        {open ? t("close") : t("scan")}
      </Button>

      {open && (
        <section aria-label={t("scan")} className="flex flex-col gap-4 rounded-xl border border-border bg-control p-4">
          <div>
            <p className="font-meta text-[0.6875rem] font-semibold tracking-[0.14em] text-accent">{t("sessionMarker")}</p>
            <h3 className="mt-1 font-display text-xl font-semibold">{t("sessionTitle")}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t("sessionHint")}</p>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="group" aria-label={t("chooseMode")}>
            {MODES.map((choice) => (
              <Button
                key={choice}
                variant={mode === choice ? (choice === "REPORT_BROKEN" ? "danger" : "primary") : "ghost"}
                className="w-full px-2"
                aria-pressed={mode === choice}
                disabled={busy}
                onClick={() => setMode(choice)}
              >
                {choice === "ARRIVAL" ? t("arrival") : choice === "RETURN" ? t("packUp") : t("reportBroken")}
              </Button>
            ))}
          </div>
          <p className="text-sm font-semibold text-fg-muted">
            {mode === "ARRIVAL" ? t("arrivalHint") : mode === "RETURN" ? t("packUpHint") : t("reportBrokenHint")}
          </p>

          <div className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fg-muted">{progressLabel}</span>
              <strong className="font-meta tabular-nums">{processed} / {progress.total}</strong>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={progressLabel}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={processed}
            >
              <div
                className={`h-full rounded-full ${mode === "REPORT_BROKEN" ? "bg-danger" : "bg-accent"}`}
                style={{ width: `${progress.total ? Math.min(100, (processed / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-page">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-hidden="true"
              className="absolute inset-0 h-full w-full bg-black object-cover"
            />
            {!running && (
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="max-w-md text-sm text-fg-muted">{t("cameraReady")}</p>
                <Button variant="primary" disabled={busy} onClick={start}>{t("start")}</Button>
              </div>
            )}
          </div>

          {running && (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="px-1 text-xs font-semibold text-fg-muted">{busy ? t("working") : t("cameraRunning")}</span>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                {cameras.length > 1 && (
                  <select
                    aria-label={t("camera")}
                    className={`${controlClasses} min-w-0 sm:w-auto`}
                    onChange={async (event) => {
                      try {
                        await scanner.current?.setCamera(event.target.value);
                      } catch {
                        stopCamera();
                        setFeedback({ key: ++feedbackKey.current, kind: "error", message: t("cameraError") });
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>{t("camera")}</option>
                    {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.label || camera.id}</option>)}
                  </select>
                )}
                <Button size="compact" className="w-full sm:w-auto" disabled={busy} onClick={stopCamera}>{t("stop")}</Button>
              </div>
            </div>
          )}

          {feedback && (
            <div
              key={feedback.key}
              role={feedback.kind === "error" ? "alert" : "status"}
              className={`rounded-xl border p-4 ${feedbackClass}`}
            >
              <p className="font-semibold">{feedback.message}</p>
              {feedback.item && (
                <p className="mt-1 text-sm opacity-80">
                  {feedback.item.category}
                  {feedback.item.serialNumber ? ` · ${te("serialShort")} ${feedback.item.serialNumber}` : ""}
                </p>
              )}
              <p className="mt-2 text-xs opacity-80">{t("keepScanning")}</p>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold">{t("recentScans")}</h4>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-3">
                {history.map((entry) => (
                  <li key={entry.key} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 break-words">{entry.message}</span>
                    <span className={`shrink-0 font-meta text-[0.6875rem] font-semibold uppercase tracking-wide ${entry.kind === "error" ? "text-danger" : entry.kind === "duplicate" ? "text-warning" : "text-success"}`}>
                      {entry.kind === "error" ? t("failedShort") : entry.kind === "duplicate" ? t("duplicateShort") : t("syncedShort")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded-xl border border-border bg-surface p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{t("otherWays")}</summary>
            <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
              <label className="flex flex-col gap-2 text-sm font-semibold">
                {t("image")}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  className={controlClasses}
                  onChange={(event) => {
                    void scanFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void processCode(value);
                }}
              >
                <label htmlFor={`qr-link-${checklistId}`} className="text-sm font-semibold">{t("paste")}</label>
                <input id={`qr-link-${checklistId}`} value={value} onChange={(event) => setValue(event.target.value)} maxLength={2048} required className={controlClasses} />
                <Button type="submit" disabled={busy || !value.trim()}>{t("processLink")}</Button>
              </form>
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Link href="/dashboard/equipment/contact" className={buttonClasses({ variant: "ghost" })}>{t("contactTitle")}</Link>
            <Button disabled={busy} onClick={closeScanner}>{t("finishSession")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
