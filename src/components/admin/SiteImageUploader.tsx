"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeSiteImage } from "@/app/[locale]/admin/(protected)/settings/actions";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const L = LABELS[kind];

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(false);
    try {
      const body = new FormData();
      body.append("kind", kind);
      body.append("file", file);
      const res = await fetch("/api/admin/site-image", {
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

  const previewCls =
    kind === "logo"
      ? "h-16 w-auto max-w-[12rem] rounded-lg border border-border bg-page object-contain p-2"
      : kind === "contactQrEn" || kind === "contactQrZh"
        ? "h-32 w-32 rounded-lg border border-border bg-page object-contain p-2"
        : "h-32 w-56 rounded-lg border border-border object-cover";

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{t(L.section)}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t(L.hint)}</p>

      {currentUrl ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt="" className={previewCls} />
          <form action={removeSiteImage.bind(null, kind)}>
            <button
              type="submit"
              className="rounded-lg border border-danger-border px-3 py-1.5 text-sm text-danger transition hover:border-danger hover:text-danger-strong"
            >
              {t(L.remove)}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-fg-subtle">{t(L.none)}</p>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-fg-muted transition hover:border-fg-subtle hover:text-fg">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
        />
        <span>{busy ? "…" : `+ ${t(L.upload)}`}</span>
      </label>

      {error && <p className="text-sm text-danger">{t(L.error)}</p>}
    </section>
  );
}
