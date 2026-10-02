"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";

const SharingPosterEditor = dynamic(
  () => import("@/components/sharing-posters/SharingPosterEditor"),
  { ssr: false, loading: () => <EditorSkeleton /> }
);

function EditorSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)]">
      <div className="h-96 animate-pulse rounded-xl bg-surface" />
      <div className="aspect-[4/5] max-h-[70dvh] animate-pulse rounded-xl bg-control lg:order-2" />
    </div>
  );
}

interface Draft {
  name: string;
  composition: SharingPosterComposition;
  photos: SharingPosterResolvedPhoto[];
}

/** Restores the visitor's draft from this browser before the editor mounts, or starts a new one. */
export default function PublicSharingPosterLoader() {
  const t = useTranslations("sharingPosters");
  const locale = useLocale();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let cancelled = false;
    const name = t("localDefaultName");
    // The composition code loads with the editor, not with the page.
    void Promise.all([import("@/lib/sharingPoster"), import("@/components/sharing-posters/localSharingPoster")]).then(
      async ([{ defaultSharingPosterComposition }, { readLocalPosterDraft }]) => {
        const fresh = defaultSharingPosterComposition(locale, "");
        // Without IndexedDB (a private window, say) the editor still works; it just cannot keep a draft.
        const stored = await readLocalPosterDraft(fresh).catch(() => null);
        if (!cancelled) setDraft(stored ? { ...stored, name: stored.name || name } : { name, composition: fresh, photos: [] });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [locale, t]);

  if (!draft) return <EditorSkeleton />;
  return (
    <SharingPosterEditor
      mode="public"
      project={{ id: "local", name: draft.name, revision: 0, composition: draft.composition, ownerName: "" }}
      initialPhotos={draft.photos}
      events={[]}
    />
  );
}
