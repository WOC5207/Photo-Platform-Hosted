"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import ContactUsButton, { type ContactUsLabels } from "@/components/ContactUsButton";

export interface MobileNavLabels {
  gallery: string;
  booking: string;
  account: string;
  menu: string;
  toggleTheme: string;
  contact: string;
}

export default function MobileNav({
  basePath,
  accountHref,
  labels,
  showBooking = true,
  showContact = false,
  contact
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  /** Login for visitors; the signed-in photographer's dashboard otherwise. */
  accountHref: "/login" | "/dashboard";
  labels: MobileNavLabels;
  showBooking?: boolean;
  showContact?: boolean;
  contact?: { title: string; url: string; qrUrl: string; labels: ContactUsLabels };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("click", onClickAway);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClickAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkClass =
    "flex min-h-11 items-center rounded-lg px-3 py-2 text-fg-muted transition hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <div ref={rootRef} className="relative shrink-0 sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={labels.menu}
        aria-expanded={open}
        aria-controls="public-mobile-navigation"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-strong text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <nav
          id="public-mobile-navigation"
          aria-label={labels.menu}
          className="absolute right-0 top-full z-50 mt-2 flex w-52 flex-col gap-1 rounded-xl border border-border bg-raised/95 p-2 text-sm shadow-xl backdrop-blur-xl"
        >
          <Link href={`${basePath}/gallery`} onClick={() => setOpen(false)} className={linkClass}>
            {labels.gallery}
          </Link>
          {showBooking && (
            <Link href={`${basePath}/booking`} onClick={() => setOpen(false)} className={linkClass}>
              {labels.booking}
            </Link>
          )}
          {showContact && contact && (
            <ContactUsButton
              title={contact.title}
              url={contact.url}
              qrUrl={contact.qrUrl}
              labels={contact.labels}
              className={`${linkClass} text-left`}
            />
          )}
          <Link href={accountHref} onClick={() => setOpen(false)} className={linkClass}>
            {labels.account}
          </Link>
          <div className="mt-1 flex items-center justify-between border-t border-fg/10 px-3 pt-2">
            <LanguageSwitcher />
            <ThemeToggle label={labels.toggleTheme} />
          </div>
        </nav>
      )}
    </div>
  );
}
