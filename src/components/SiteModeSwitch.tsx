"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { classicTwin, siteModeCookie, threeDTwin, type SiteMode } from "@/lib/siteMode";

/** Remember the visitor's site and open the matching page on it. */
export function useLeaveFor() {
  const router = useRouter();
  const pathname = usePathname();
  return (mode: SiteMode, path?: string) => {
    document.cookie = siteModeCookie(mode);
    router.push(path ?? (mode === "3d" ? threeDTwin(pathname) : classicTwin(pathname)));
  };
}

/**
 * The switch between the classic site and the new one, beside the account in
 * each site's header. On the classic site it opens the new site's twin of the
 * page; inside the new site it reads as already on and takes the visitor to
 * the classic twin of the current screen.
 */
export default function SiteModeSwitch({
  current,
  compact = false,
  className = ""
}: {
  current: SiteMode;
  /** On phones only the switch shows; its label is still read out. */
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("album3d");
  const leaveFor = useLeaveFor();
  const on = current === "3d";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => leaveFor(on ? "classic" : "3d")}
      className={`group inline-flex min-h-10 items-center gap-2.5 px-2 text-sm ${compact ? "max-sm:px-0" : ""} font-semibold text-fg-muted transition hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${className}`}
    >
      <span className={compact ? "max-sm:sr-only" : undefined}>{t("siteSwitch")}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 ${
          on ? "border-fg bg-fg" : "border-border-strong bg-control"
        }`}
      >
        <span
          className={`absolute left-0.5 h-[1.125rem] w-[1.125rem] rounded-full transition-transform duration-150 motion-reduce:transition-none ${
            on ? "translate-x-5 bg-page" : "translate-x-0 bg-fg-subtle"
          }`}
        />
      </span>
    </button>
  );
}
