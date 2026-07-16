"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addPersonalLink,
  deletePersonalLink,
  movePersonalLink,
  updatePersonalLink,
  type PersonalLinkState
} from "@/app/[locale]/admin/(protected)/settings/actions";

export interface AdminPersonalLink {
  id: string;
  labelEn: string;
  labelZh: string;
  url: string;
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-subtle";
const btnCls =
  "rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-40";

export default function PersonalLinksManager({
  links
}: {
  links: AdminPersonalLink[];
}) {
  const t = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    PersonalLinkState,
    FormData
  >(addPersonalLink, {});

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{t("personalLinksSection")}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t("personalLinksHint")}</p>

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link, i) => (
            <li
              key={link.id}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <form
                action={updatePersonalLink}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <input type="hidden" name="id" value={link.id} />
                <input
                  name="labelEn"
                  defaultValue={link.labelEn}
                  placeholder={t("personalLinkLabelEn")}
                  maxLength={200}
                  className={inputCls}
                />
                <input
                  name="labelZh"
                  defaultValue={link.labelZh}
                  placeholder={t("personalLinkLabelZh")}
                  maxLength={200}
                  className={inputCls}
                />
                <input
                  name="url"
                  defaultValue={link.url}
                  placeholder={t("personalLinkUrl")}
                  maxLength={500}
                  className={inputCls}
                />
                <button type="submit" className={`${btnCls} sm:col-span-4 sm:w-fit`}>
                  {tc("save")}
                </button>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={movePersonalLink}>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={i === 0} className={btnCls}>
                    ← {t("moveUp")}
                  </button>
                </form>
                <form action={movePersonalLink}>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === links.length - 1}
                    className={btnCls}
                  >
                    {t("moveDown")} →
                  </button>
                </form>
                <form
                  action={deletePersonalLink}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmDeletePersonalLink")))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={link.id} />
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
      {links.length === 0 && (
        <p className="text-sm text-fg-subtle">{t("noPersonalLinks")}</p>
      )}

      <form
        action={formAction}
        className="grid gap-2 rounded-xl border border-dashed border-border-strong p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <input
          name="labelEn"
          placeholder={t("personalLinkLabelEn")}
          maxLength={200}
          className={inputCls}
        />
        <input
          name="labelZh"
          placeholder={t("personalLinkLabelZh")}
          maxLength={200}
          className={inputCls}
        />
        <input
          name="url"
          placeholder={t("personalLinkUrl")}
          maxLength={500}
          className={inputCls}
        />
        <button
          type="submit"
          disabled={pending}
          className={`${btnCls} sm:col-span-4 sm:w-fit`}
        >
          + {t("addPersonalLink")}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-danger">{t("personalLinkValidationError")}</p>
      )}
    </section>
  );
}
