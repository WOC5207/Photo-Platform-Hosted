"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeEquipmentPhoto } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import StatusMessage from "@/components/ui/StatusMessage";

export async function uploadEquipmentPhoto(equipmentId: string, file: File) {
  const body = new FormData();
  body.append("equipmentId", equipmentId);
  body.append("file", file);
  const response = await fetch("/api/admin/equipment-image", { method: "POST", body });
  const result = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;
  if (!response.ok || !result?.url) throw new Error(result?.error || "unknown");
  return result.url;
}

export default function EquipmentPhotoUploader({ equipmentId, currentUrl, name }: {
  equipmentId: string;
  currentUrl: string;
  name: string;
}) {
  const t = useTranslations("equipment");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!objectUrlRef.current) setDisplayUrl(currentUrl);
  }, [currentUrl]);
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  async function choose(file?: File) {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setDisplayUrl(objectUrlRef.current);
    setBusy(true);
    setStatus("idle");
    try {
      const url = await uploadEquipmentPhoto(equipmentId, file);
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setDisplayUrl(url);
      setStatus("saved");
      router.refresh();
    } catch (cause) {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      setDisplayUrl(currentUrl);
      setError(cause instanceof Error ? cause.message : "unknown");
      setStatus("error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const errorMessage = error === "tooLarge"
    ? t("photoTooLarge")
    : error === "quotaExceeded" ? t("photoQuotaExceeded") : t("photoUploadError");

  return <div className="flex flex-col gap-3" aria-busy={busy}>
    {displayUrl ? <div className="flex flex-wrap items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={displayUrl} alt={t("photoAlt", { name })} className={`ui-image-frame aspect-[4/3] w-40 rounded-lg object-cover ${busy ? "opacity-60" : ""}`} />
      <form action={removeEquipmentPhoto} onSubmit={(event) => {
        if (!confirm(t("removePhotoConfirm", { name }))) event.preventDefault();
      }}>
        <input type="hidden" name="id" value={equipmentId} />
        <button type="submit" disabled={busy} className="min-h-10 rounded-lg border border-danger-border px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50 max-sm:min-h-11">
          {t("removePhoto")}
        </button>
      </form>
    </div> : <p className="text-sm text-fg-subtle">{t("noPhoto")}</p>}
    <label className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg border border-dashed border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted hover:border-accent hover:text-accent focus-within:ring-2 focus-within:ring-accent/40">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff" disabled={busy} onChange={(event) => choose(event.target.files?.[0])} className="sr-only" />
      {busy ? t("photoUploading") : displayUrl ? t("replacePhoto") : t("uploadPhoto")}
    </label>
    {status === "saved" && <StatusMessage kind="success">{t("photoSaved")}</StatusMessage>}
    {status === "error" && <StatusMessage kind="error">{errorMessage}</StatusMessage>}
  </div>;
}
