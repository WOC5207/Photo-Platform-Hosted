"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type Labels = {
  titleEn: string;
  titleZh: string;
  width: string;
  height: string;
  image: string;
  create: string;
  replace: string;
  working: string;
  success: string;
  error: string;
  dimensionsHint: string;
};

export default function CosplanTemplateUpload({
  labels,
  template
}: {
  labels: Labels;
  template?: { id: string; titleEn: string; titleZh: string; width: number; height: number };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    const response = await fetch("/api/admin/cosplan-templates", { method: "POST", body: new FormData(event.currentTarget) }).catch(() => null);
    if (!response?.ok) {
      setStatus("error");
      return;
    }
    setStatus("success");
    if (!template) formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {template && <input type="hidden" name="templateId" value={template.id} />}
      <Field label={labels.titleEn} htmlFor={`cosplan-title-en-${template?.id ?? "new"}`} required>
        <Input id={`cosplan-title-en-${template?.id ?? "new"}`} name="titleEn" defaultValue={template?.titleEn} maxLength={120} required />
      </Field>
      <Field label={labels.titleZh} htmlFor={`cosplan-title-zh-${template?.id ?? "new"}`} required>
        <Input id={`cosplan-title-zh-${template?.id ?? "new"}`} name="titleZh" defaultValue={template?.titleZh} maxLength={120} required />
      </Field>
      <Field label={labels.width} htmlFor={`cosplan-width-${template?.id ?? "new"}`} hint={labels.dimensionsHint} required>
        <Input id={`cosplan-width-${template?.id ?? "new"}`} name="width" type="number" min={320} max={4096} defaultValue={template?.width ?? 1080} required />
      </Field>
      <Field label={labels.height} htmlFor={`cosplan-height-${template?.id ?? "new"}`} required>
        <Input id={`cosplan-height-${template?.id ?? "new"}`} name="height" type="number" min={320} max={4096} defaultValue={template?.height ?? 1350} required />
      </Field>
      <Field label={labels.image} htmlFor={`cosplan-image-${template?.id ?? "new"}`} required className="sm:col-span-2">
        <Input id={`cosplan-image-${template?.id ?? "new"}`} name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant={template ? "secondary" : "primary"} disabled={status === "working"}>
          {status === "working" ? labels.working : template ? labels.replace : labels.create}
        </Button>
        <p role="status" className={`text-sm ${status === "error" ? "text-danger" : "text-fg-subtle"}`}>
          {status === "success" ? labels.success : status === "error" ? labels.error : ""}
        </p>
      </div>
    </form>
  );
}
