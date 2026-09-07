"use client";

import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";

export default function SubmitButton({ children, disabled = false, primary = false }: {
  children: React.ReactNode; disabled?: boolean; primary?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations("preparation");
  return <button type="submit" disabled={disabled || pending} aria-busy={pending}
    className={buttonClasses({ variant: primary ? "primary" : "secondary" })}>
    {pending ? t("saving") : children}
  </button>;
}
