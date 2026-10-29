"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "@/hooks/usePresence";

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  open,
  onClose,
  label,
  children,
  panelClassName = "",
  overlayClassName = ""
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  panelClassName?: string;
  overlayClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  // The dialog fades and sinks on its way out (see .dialog-overlay in
  // globals.css), still showing what it held while open.
  const { present, leaving } = usePresence(open);
  const shown = useRef(children);
  if (open) shown.current = children;

  if (!present) return null;

  // Management workspaces provide a portal root inside their theme scope.
  // Public pages and unthemed screens continue to portal directly to body.
  const portalRoot =
    document.querySelector<HTMLElement>("[data-dialog-portal-root]") ??
    document.body;

  return createPortal(
    <div
      className={`dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${overlayClassName}`}
      data-leaving={leaving || undefined}
      inert={leaving}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`dialog-panel max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-raised shadow-2xl outline-none ${panelClassName}`}
      >
        {shown.current}
      </div>
    </div>,
    portalRoot
  );
}
