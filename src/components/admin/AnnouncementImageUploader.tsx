"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeAnnouncementImage } from "@/app/[locale]/admin/(protected)/settings/actions";

/** Compact image upload/remove control for one Announcement row's optional image. */
export default function AnnouncementImageUploader({
  announcementId,
  currentUrl
}: {
  announcementId: string;
  currentUrl: string;
}) {
  const t = useTranslations("adminSite");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(false);
    try {
      const body = new FormData();
      body.append("announcementId", announcementId);
      body.append("file", file);
      const res = await fetch("/api/admin/announcement-image", {
        method: "POST",
        body
      });
      if (!res.ok) setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {currentUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt=""
            className="h-16 w-16 rounded-lg border border-border object-cover"
          />
          <form action={removeAnnouncementImage}>
            <input type="hidden" name="id" value={announcementId} />
            <button
              type="submit"
              className="rounded-md border border-danger-border px-2 py-1 text-xs text-danger transition hover:border-danger hover:text-danger-strong"
            >
              {t("removeAnnouncementImage")}
            </button>
          </form>
        </>
      ) : (
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-1.5 text-xs text-fg-muted transition hover:border-fg-subtle hover:text-fg">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
          <span>{busy ? "…" : `+ ${t("addAnnouncementImage")}`}</span>
        </label>
      )}
      {error && <p className="text-xs text-danger">{t("uploadAnnouncementImageError")}</p>}
    </div>
  );
}
