"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function ModerationReviewImage({
  src,
  alt
}: {
  src: string;
  alt: string;
}) {
  const t = useTranslations("adminModeration");
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`aspect-[4/3] w-full object-cover transition ${
          revealed ? "" : "scale-105 blur-xl"
        }`}
      />
      {!revealed && (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/45 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        >
          {t("reveal")}
        </button>
      )}
    </div>
  );
}
