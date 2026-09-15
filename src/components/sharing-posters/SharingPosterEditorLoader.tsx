"use client";

import dynamic from "next/dynamic";
import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";

const SharingPosterEditor = dynamic(
  () => import("@/components/sharing-posters/SharingPosterEditor"),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden="true" className="grid gap-5 lg:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)]">
        <div className="h-96 animate-pulse rounded-xl bg-surface" />
        <div className="aspect-[4/5] max-h-[70dvh] animate-pulse rounded-xl bg-control lg:order-2" />
      </div>
    )
  }
);

export default function SharingPosterEditorLoader(props: {
  project: { id: string; name: string; revision: number; composition: SharingPosterComposition };
  initialPhotos: SharingPosterResolvedPhoto[];
  events: { id: string; title: string }[];
}) {
  return <SharingPosterEditor {...props} />;
}
