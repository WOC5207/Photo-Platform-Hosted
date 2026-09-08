"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import { saveEquipmentContact } from "@/app/[locale]/dashboard/(protected)/equipment/contact/actions";

export default function EquipmentContactForm({ initial }: { initial: { equipmentContactMethod: string; equipmentContactLabel: string; equipmentContactValue: string } }) {
  const t = useTranslations("equipmentScan");
  const [method, setMethod] = useState(initial.equipmentContactMethod);
  const [state, action, pending] = useActionState(saveEquipmentContact, { message: "" });
  return <form action={action} className="ui-panel max-w-2xl p-6 flex flex-col gap-4">
    <p className="text-sm text-fg-muted">{t("contactHint")}</p>
    <label className="flex flex-col gap-2 text-sm font-semibold">{t("method")}
      <select name="equipmentContactMethod" value={method} onChange={e => setMethod(e.target.value)} className={controlClasses}>
        {["", "phone", "email", "wechat", "other"].map(m => <option key={m} value={m}>{t(m || "none")}</option>)}
      </select>
    </label>
    {method === "other" && <label className="flex flex-col gap-2 text-sm font-semibold">{t("customLabel")}<input name="equipmentContactLabel" maxLength={80} defaultValue={initial.equipmentContactLabel} className={controlClasses} /></label>}
    <label className="flex flex-col gap-2 text-sm font-semibold">{t("contactValue")}<input name="equipmentContactValue" maxLength={250} defaultValue={initial.equipmentContactValue} className={controlClasses} /></label>
    <Button type="submit" variant="primary" disabled={pending} className="self-start">{pending ? t("working") : t("save")}</Button>
    {state.message && <p role={state.message === "saved" ? "status" : "alert"}>{t(state.message)}</p>}
  </form>;
}
