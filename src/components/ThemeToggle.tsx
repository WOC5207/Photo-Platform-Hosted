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
    setTheme(effectiveTheme());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange() {
      if (!localStorage.getItem("theme")) setTheme(systemTheme());
    }
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label || "Toggle light/dark theme"}
      title={label || "Toggle light/dark theme"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-fg-subtle transition hover:border-border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-lg:h-11 max-lg:w-11"
    >
      {theme === null ? null : theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
