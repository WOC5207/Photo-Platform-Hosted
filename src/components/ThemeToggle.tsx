"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function effectiveTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return systemTheme();
}

/**
 * Sun/moon button that toggles the site theme. Defaults to following the
 * visitor's OS preference (see the inline init script in the root layout);
 * clicking here saves an explicit override to localStorage that sticks
 * regardless of future OS changes.
 */
export default function ThemeToggle({ label }: { label: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const syncTheme = () => setTheme(effectiveTheme());
    syncTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Desktop and mobile controls can be mounted together. Reflect changes
    // made by either control instead of keeping a stale local pressed state.
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener("change", syncTheme);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncTheme);
    };
  }, []);

  function toggle() {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === null ? undefined : theme === "dark"}
      aria-label={label || "Toggle light/dark theme"}
      title={label || "Toggle light/dark theme"}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-raised text-fg-muted transition-colors hover:border-accent hover:text-accent"
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {theme === "dark" ? <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2m-3-9-1.5 1.5M5.5 18.5 4 20m16 0-1.5-1.5M5.5 5.5 4 4" />
        </> : <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
      </svg>
    </button>
  );
}
