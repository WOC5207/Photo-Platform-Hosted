"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setUiStyle } from "@/app/[locale]/dashboard/(protected)/settings/actions";
import { resolveUiStyle, type UiStyle } from "@/lib/themeColor";

/**
 * The owner's switch between the classic interface and the archive design
 * language. It saves the moment it is flipped and refreshes the page, so the
 * new look shows straight away on the dashboard and on the public site.
 */
export default function UiStyleSwitch({ initial }: { initial: string }) {
  const t = useTranslations("adminSite");
  const router = useRouter();
  const [style, setStyle] = useState<UiStyle>(resolveUiStyle(initial));
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const archive = style === "ARCHIVE";

  function toggle() {
    const previous = style;
    const next: UiStyle = archive ? "CLASSIC" : "ARCHIVE";
    setStyle(next);
    setFailed(false);
    startTransition(async () => {
      const result = await setUiStyle(next);
      if ("error" in result) {
        setStyle(previous);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="ui-style-label" className="text-sm font-semibold text-fg">
            {t("uiStyleSwitch")}
          </p>
          <p id="ui-style-hint" className="ui-pretty mt-1 max-w-2xl text-xs leading-relaxed text-fg-subtle">
            {t("uiStyleHint")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={archive}
          aria-labelledby="ui-style-label"
          aria-describedby="ui-style-hint"
          disabled={pending}
          onClick={toggle}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-wait disabled:opacity-60 ${
            archive ? "border-fg bg-fg" : "border-border-strong bg-control"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-1 h-6 w-6 rounded-full shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
              archive ? "translate-x-6 bg-page" : "translate-x-0 bg-fg-subtle"
            }`}
          />
        </button>
      </div>
      <p role="status" className="font-meta text-[0.6875rem] tracking-[0.12em] text-fg-subtle">
        {failed ? (
          <span className="text-danger">{t("uiStyleError")}</span>
        ) : archive ? (
          t("uiStyleArchiveOn")
        ) : (
          t("uiStyleClassicOn")
        )}
      </p>
    </div>
  );
}
