"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Button, { buttonClasses } from "@/components/ui/Button";

export default function EquipmentContact({ method, label, value }: { method: string; label: string; value: string }) {
  const t = useTranslations("equipmentScan");
  const [message, setMessage] = useState("");
  const href = method === "phone" ? `tel:${value.replace(/[ ()-]/g, "")}` : method === "email" ? `mailto:${encodeURIComponent(value)}` : null;
  return <section className="mt-6 flex flex-col gap-3">
    <h2 className="font-semibold">{method === "other" ? label : t(method)}</h2>
    <p className="break-words text-fg-muted">{value}</p>
    {href ? <a href={href} className={buttonClasses({ className: "self-start" })}>{t("contact")}</a> :
      <Button className="self-start" onClick={async () => { try { await navigator.clipboard.writeText(value); setMessage(t("copied")); } catch { setMessage(t("copyError")); } }}>{t("copy")}</Button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
