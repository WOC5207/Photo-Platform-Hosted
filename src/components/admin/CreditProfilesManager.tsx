"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  addCreditProfile,
  updateCreditProfile,
  deleteCreditProfile,
  type CreditProfileState
} from "@/app/[locale]/admin/(protected)/credits/actions";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "./SocialLinksEditor";

export interface AdminCreditProfile {
  id: string;
  creditName: string;
  socialLinks: { platform: string; url: string }[];
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-subtle";
const btnCls =
  "rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-40";

function CreditProfileRow({
  profile,
  creditTerm
}: {
  profile: AdminCreditProfile;
  creditTerm: string;
}) {
  const t = useTranslations("adminCredits");
  const tc = useTranslations("common");
  const [links, setLinks] = useState<SocialLinkValue[]>(() =>
    profile.socialLinks.map((s) => emptySocialLink(s))
  );
  const socialLinksJson = JSON.stringify(
    links.map((l) => ({ platform: l.platform, url: l.url }))
  );

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <form action={updateCreditProfile} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={profile.id} />
        <input type="hidden" name="socialLinksJson" value={socialLinksJson} />
        <input
          name="creditName"
          defaultValue={profile.creditName}
          placeholder={t("creditNamePlaceholder", { term: creditTerm })}
          maxLength={200}
          className={inputCls}
        />
        <SocialLinksEditor links={links} onChange={setLinks} />
        <div className="flex gap-2">
          <button type="submit" className={btnCls}>
            {tc("save")}
          </button>
        </div>
      </form>
      <form
        action={deleteCreditProfile}
        onSubmit={(e) => {
          if (!confirm(t("confirmDelete"))) e.preventDefault();
        }}
        className="mt-2"
      >
        <input type="hidden" name="id" value={profile.id} />
        <button
          type="submit"
          className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
        >
          {tc("delete")}
        </button>
      </form>
    </li>
  );
}

export default function CreditProfilesManager({
  creditProfiles,
  creditTerm
}: {
  creditProfiles: AdminCreditProfile[];
  creditTerm: string;
}) {
  const t = useTranslations("adminCredits");
  const [state, formAction, pending] = useActionState<CreditProfileState, FormData>(
    addCreditProfile,
    {}
  );

  return (
    <div className="flex flex-col gap-4">
      {creditProfiles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {creditProfiles.map((c) => (
            <CreditProfileRow key={c.id} profile={c} creditTerm={creditTerm} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-subtle">{t("noCreditProfiles", { term: creditTerm })}</p>
      )}

      <form
        action={formAction}
        className="flex flex-wrap gap-2 rounded-xl border border-dashed border-border-strong p-3"
      >
        <input
          name="creditName"
          placeholder={t("creditNamePlaceholder", { term: creditTerm })}
          maxLength={200}
          className={`${inputCls} flex-1`}
        />
        <button type="submit" disabled={pending} className={btnCls}>
          + {t("addCreditProfile", { term: creditTerm })}
        </button>
      </form>
      {state.error === "validation" && (
        <p className="text-xs text-danger">{t("validationError")}</p>
      )}
      {state.error === "duplicate" && (
        <p className="text-xs text-danger">{t("duplicateError")}</p>
      )}
    </div>
  );
}
