"use client";

import { useEffect, useRef } from "react";

const activeDrafts = new Map<symbol, string>();
let listening = false;

function currentMessage(): string | undefined {
  return activeDrafts.values().next().value;
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (activeDrafts.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
}

function interceptNavigation(event: MouseEvent) {
  if (
    activeDrafts.size === 0 ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (
    !link ||
    link.target === "_blank" ||
    link.hasAttribute("download")
  ) {
    return;
  }

  const next = new URL(link.href);
  const current = new URL(window.location.href);
  if (
    next.pathname === current.pathname &&
    next.search === current.search &&
    next.hash === current.hash
  ) {
    return;
  }
  if (
    next.pathname === current.pathname &&
    next.search === current.search &&
    next.hash &&
    next.hash !== current.hash
  ) {
    return;
  }

  const message = currentMessage();
  if (message && !window.confirm(message)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function syncListeners() {
  if (activeDrafts.size > 0 && !listening) {
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptNavigation, true);
    listening = true;
  } else if (activeDrafts.size === 0 && listening) {
    window.removeEventListener("beforeunload", beforeUnload);
    document.removeEventListener("click", interceptNavigation, true);
    listening = false;
  }
}

/**
 * Protect a client-side draft from accidental link navigation or tab close.
 * A shared registry means pages with several editable photo cards prompt once.
 */
export function useUnsavedChanges(dirty: boolean, message: string) {
  const token = useRef(Symbol("unsaved-draft"));

  useEffect(() => {
    const id = token.current;
    if (dirty) activeDrafts.set(id, message);
    else activeDrafts.delete(id);
    syncListeners();

    return () => {
      activeDrafts.delete(id);
      syncListeners();
    };
  }, [dirty, message]);
}
