"use client";

import { useEffect, useState } from "react";
import { lessMotion } from "@/lib/motion";

/**
 * Keeps something that closes on screen for its way out: `present` stays
 * true for `exitMs` after `open` turns false (RhineLabUI's 200 ms exit, see
 * --motion-exit), with `leaving` true meanwhile, so it can fade and sink
 * before it goes. With less motion it goes at once.
 */
export function usePresence(open: boolean, exitMs = 200): { present: boolean; leaving: boolean } {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), lessMotion() ? 0 : exitMs);
    return () => window.clearTimeout(timer);
  }, [open, present, exitMs]);
  return { present: open || present, leaving: !open && present };
}
