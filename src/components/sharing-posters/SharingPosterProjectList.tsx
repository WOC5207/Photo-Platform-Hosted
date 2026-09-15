"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";

export interface SharingPosterProjectSummary {
  id: string;
  name: string;
  photoCount: number;
  ratioLabel: string;
  updatedLabel: string;
}

export function NewSharingPosterButton({ label }: { label?: string }) {
  const t = useTranslations("sharingPosters");
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <Button
        variant="primary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            const response = await fetch("/api/dashboard/sharing-posters", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale })
            });
            if (!response.ok) throw new Error("create_failed");
            const project = (await response.json()) as { id: string };
            router.push(`/dashboard/sharing-posters/${project.id}`);
          } catch {
            setError(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? t("creating") : label ?? t("newPoster")}
      </Button>
      {error && <span role="alert" className="text-xs text-danger">{t("projectActionError")}</span>}
    </span>
  );
}

export default function SharingPosterProjectList({ projects }: { projects: SharingPosterProjectSummary[] }) {
  const t = useTranslations("sharingPosters");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function duplicate(id: string) {
    setBusyId(id);
    setError(false);
    try {
      const source = projects.find((project) => project.id === id);
      const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(id)}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: source ? `${source.name} — ${t("copySuffix")}` : undefined })
      });
      if (!response.ok) throw new Error("duplicate_failed");
      const copy = (await response.json()) as { id: string };
      router.push(`/dashboard/sharing-posters/${copy.id}`);
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("deleteConfirm", { name }))) return;
    setBusyId(id);
    setError(false);
    try {
      const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-12 text-center">
        <span aria-hidden="true" className="font-meta text-xs tracking-[0.18em] text-accent">01—09</span>
        <h2 className="font-display mt-3 text-2xl font-semibold tracking-[-0.025em]">{t("emptyTitle")}</h2>
        <p className="ui-pretty mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-subtle">{t("emptyDescription")}</p>
        <div className="mt-5 flex justify-center"><NewSharingPosterButton /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger">{t("projectActionError")}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, index) => (
          <li key={project.id} className="flex min-h-56 flex-col rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="font-meta text-[0.6875rem] tracking-[0.16em] text-accent">{String(index + 1).padStart(2, "0")}</span>
              <span className="font-meta text-[0.6875rem] text-fg-subtle">{project.ratioLabel}</span>
            </div>
            <h2 className="font-display mt-4 text-xl font-semibold tracking-[-0.02em]">{project.name}</h2>
            <p className="mt-2 text-sm text-fg-subtle">{t("projectMeta", { count: project.photoCount, updated: project.updatedLabel })}</p>
            <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
              <Link href={`/dashboard/sharing-posters/${project.id}`} className={buttonClasses({ variant: "primary", size: "compact" })}>{t("open")}</Link>
              <Button size="compact" disabled={busyId === project.id} onClick={() => void duplicate(project.id)}>{t("duplicate")}</Button>
              <Button size="compact" variant="danger" disabled={busyId === project.id} onClick={() => void remove(project.id, project.name)}>{t("delete")}</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
