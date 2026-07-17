"use client";

import { useTranslations } from "next-intl";

export interface SocialLinkValue {
  key: number;
  platform: string;
  url: string;
}

let keySeq = 0;
export function emptySocialLink(initial?: { platform: string; url: string }): SocialLinkValue {
  return {
    key: keySeq++,
    platform: initial?.platform ?? "",
    url: initial?.url ?? ""
  };
}

const inputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";
const platformInputCls =
  `${inputCls} w-full`;
const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11";

/** Repeatable platform-name + URL editor for a credit's social links. */
export default function SocialLinksEditor({
  links,
  onChange
}: {
  links: SocialLinkValue[];
  onChange: (links: SocialLinkValue[]) => void;
}) {
  const t = useTranslations("adminEvents");

  return (
    <div className="flex flex-col gap-3 sm:pl-2">
      {links.map((link) => (
        <div key={link.key} className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {t("socialPlatformPlaceholder")}
            <input
              value={link.platform}
              onChange={(e) =>
                onChange(
                  links.map((l) =>
                    l.key === link.key ? { ...l, platform: e.target.value } : l
                  )
                )
              }
              maxLength={60}
              className={platformInputCls}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
            {t("socialUrlPlaceholder")}
            <input
              value={link.url}
              onChange={(e) =>
                onChange(
                  links.map((l) =>
                    l.key === link.key ? { ...l, url: e.target.value } : l
                  )
                )
              }
              maxLength={500}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            aria-label={t("removeSocialLinkAria")}
            onClick={() => onChange(links.filter((l) => l.key !== link.key))}
            className={btnCls}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...links, emptySocialLink()])}
        className={`${btnCls} self-start`}
      >
        + {t("addSocialLink")}
      </button>
    </div>
  );
}
