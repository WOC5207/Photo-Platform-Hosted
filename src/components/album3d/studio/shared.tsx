"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import styles from "../ArchiveSite.module.css";
import { metaLabel } from "../booking/shared";

/** Pieces shared by the 3D Dashboard's screens. */

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** The days from the first to the last, as the event form's calendar sends them. */
export function daysBetween(first: string, last: string): string[] {
  if (!first) return [];
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = last ? Date.parse(`${last}T00:00:00Z`) : start;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const days: string[] = [];
  for (let t = start; t <= end && days.length < 60; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

/** The meta line, title and callout rule every Dashboard panel opens with. */
export function StudioHeading({ trail, title, children }: { trail: string; title: string; children?: ReactNode }) {
  const t = useTranslations("album3d");
  return (
    <>
      <p className={metaLabel}>
        {t("studioTitle")} <span aria-hidden="true" className="mx-2">／</span> {trail}
      </p>
      <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.25rem]">
        {title}
      </h1>
      {children}
      <div aria-hidden="true" className={styles.calloutRule} />
    </>
  );
}

/** The same page on the classic dashboard, for whatever this screen can't do yet. */
export function ClassicLink({ href, label }: { href: string; label?: string }) {
  const t = useTranslations("album3d");
  return (
    <p className="mt-5 text-xs text-fg-muted">
      <Link href={href} className="underline-offset-4 hover:text-fg hover:underline">
        {label ?? t("studioClassic")} ↗
      </Link>
    </p>
  );
}

/** A status line under a form: saved, or what went wrong. */
export function FormNote({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`text-sm ${tone === "error" ? "text-danger" : "text-success"}`}>
      {children}
    </p>
  );
}
