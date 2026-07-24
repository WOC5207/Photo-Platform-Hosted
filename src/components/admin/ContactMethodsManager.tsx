"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addContactMethod,
  deleteContactMethod,
  moveContactMethod,
  updateContactMethod,
  type ContactMethodState
} from "@/app/[locale]/dashboard/(protected)/settings/actions";

export interface AdminContactMethod {
  id: string;
  labelEn: string;
  labelZh: string;
}

const inputCls =
  "min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";
const btnCls =
  "min-h-10 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export default function ContactMethodsManager({
  methods
}: {
  methods: AdminContactMethod[];
}) {
  const t = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    ContactMethodState,
    FormData
  >(addContactMethod, {});

  return (
    <section
      id="contact-methods"
      className="scroll-mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:scroll-mt-24"
    >
      <h2 className="text-lg font-semibold">{t("contactMethodsSection")}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t("contactMethodsHint")}</p>

      {methods.length > 0 && (
        <ul className="flex flex-col gap-2">
          {methods.map((method, i) => (
            <li
              key={method.id}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <form
                action={updateContactMethod}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input type="hidden" name="id" value={method.id} />
                <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                  <span>{t("contactMethodLabelEn")}</span>
                  <input
                    name="labelEn"
                    defaultValue={method.labelEn}
                    maxLength={60}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                  <span>{t("contactMethodLabelZh")}</span>
                  <input
                    name="labelZh"
                    defaultValue={method.labelZh}
                    maxLength={60}
                    className={inputCls}
                  />
                </label>
                <button type="submit" className={`${btnCls} sm:col-span-3 sm:w-fit`}>
                  {tc("save")}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={moveContactMethod}>
                  <input type="hidden" name="id" value={method.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={i === 0} className={btnCls}>
                    ← {t("moveUp")}
                  </button>
                </form>
                <form action={moveContactMethod}>
                  <input type="hidden" name="id" value={method.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === methods.length - 1}
                    className={btnCls}
                  >
                    {t("moveDown")} →
                  </button>
                </form>
                <form
                  action={deleteContactMethod}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmDeleteContactMethod")))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={method.id} />
                  <button
                    type="submit"
                    className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
                  >
                    {tc("delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {methods.length === 0 && (
        <p className="text-sm text-fg-subtle">{t("noContactMethods")}</p>
      )}

      <form
        action={formAction}
        className="grid gap-2 rounded-xl border border-dashed border-border-strong p-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span>{t("contactMethodLabelEn")}</span>
          <input name="labelEn" maxLength={60} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span>{t("contactMethodLabelZh")}</span>
          <input name="labelZh" maxLength={60} className={inputCls} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`${btnCls} sm:col-span-3 sm:w-fit`}
        >
          + {t("addContactMethod")}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {t("contactMethodValidationError")}
        </p>
      )}
    </section>
  );
}
