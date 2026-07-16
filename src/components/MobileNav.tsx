"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import ContactUsButton, { type ContactUsLabels } from "@/components/ContactUsButton";

export interface MobileNavLabels {
  gallery: string;
  booking: string;
  admin: string;
  menu: string;
  toggleTheme: string;
  contact: string;
}

export default function MobileNav({
  labels,
  showBooking = true,
  showContact = false,
  contact
}: {
  labels: MobileNavLabels;
  showBooking?: boolean;
  showContact?: boolean;
  contact?: { title: string; url: string; qrUrl: string; labels: ContactUsLabels };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onClickAway);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClickAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkClass =
    "rounded-lg px-3 py-2 text-fg-muted transition hover:bg-fg/5 hover:text-fg";

  return (
    <div ref={rootRef} className="relative sm:hidden">
      <button
        type="button"
        aria-label={labels.menu}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-fg-muted transition hover:border-fg-faint hover:text-fg"
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
        <div className="absolute right-0 top-full z-50 mt-2 flex w-48 flex-col gap-1 rounded-xl border border-fg/10 bg-page/95 p-2 text-sm shadow-2xl backdrop-blur-xl">
          <Link href="/gallery" onClick={() => setOpen(false)} className={linkClass}>
            {labels.gallery}
          </Link>
          {showBooking && (
            <Link href="/booking" onClick={() => setOpen(false)} className={linkClass}>
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
          <Link href="/admin" onClick={() => setOpen(false)} className={linkClass}>
            {labels.admin}
          </Link>
          <div className="mt-1 flex items-center justify-between border-t border-fg/10 px-3 pt-2">
            <LanguageSwitcher />
            <ThemeToggle label={labels.toggleTheme} />
          </div>
        </div>
      )}
    </div>
  );
}
