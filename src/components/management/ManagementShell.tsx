"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

export type ManagementWorkspace = "site" | "platform";

export type ManagementIcon =
  | "overview"
  | "gallery"
  | "bookings"
  | "credits"
  | "settings"
  | "storage"
  | "accounts"
  | "invites"
  | "tiers"
  | "health"
  | "moderation"
  | "notifications";

export interface ManagementNavItem {
  href: string;
  label: string;
  icon: ManagementIcon;
  exact?: boolean;
  activePrefixes?: string[];
}

export interface ManagementShellLabels {
  workspaceSite: string;
  workspacePlatform: string;
  account: string;
  viewSite: string;
  directory: string;
  language: string;
  theme: string;
  logout: string;
  menu: string;
  close: string;
}

interface ManagementShellProps {
  children: ReactNode;
  workspace: ManagementWorkspace;
  navigation: ManagementNavItem[];
  labels: ManagementShellLabels;
  username: string;
  displayName: string;
  siteTitle: string;
  logoUrl?: string;
  publicSiteHref: string;
  isAdmin: boolean;
  logoutAction: () => Promise<void>;
}

function routeIsActive(pathname: string, item: ManagementNavItem): boolean {
  if (
    item.activePrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return true;
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavigationIcon({ name }: { name: ManagementIcon }) {
  const paths: Record<ManagementIcon, ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    gallery: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 4 4 2-2 5 5" />
      </>
    ),
    bookings: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="m8 15 2 2 5-5" />
      </>
    ),
    credits: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M3 21a6 6 0 0 1 12 0M17 11h4M19 9v4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    storage: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
      </>
    ),
    accounts: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    invites: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6M18 2v6M15 5h6" />
      </>
    ),
    tiers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    health: (
      <>
        <path d="M3 12h4l2-7 4 14 2-7h6" />
        <path d="M21 6v15H3V3h12" />
      </>
    ),
    moderation: (
      <>
        <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    notifications: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    )
  };

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function WorkspaceSwitch({
  workspace,
  labels,
  onNavigate
}: {
  workspace: ManagementWorkspace;
  labels: ManagementShellLabels;
  onNavigate?: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-control p-1 text-xs">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        aria-current={workspace === "site" ? "page" : undefined}
        className={`flex min-h-11 items-center justify-center rounded-md px-2 font-semibold transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-9 ${
          workspace === "site"
            ? "bg-raised text-fg"
            : "text-fg-subtle hover:bg-raised/60 hover:text-fg"
        }`}
      >
        {labels.workspaceSite}
      </Link>
      <Link
        href="/admin"
        onClick={onNavigate}
        aria-current={workspace === "platform" ? "page" : undefined}
        className={`flex min-h-11 items-center justify-center rounded-md px-2 font-semibold transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-9 ${
          workspace === "platform"
            ? "bg-raised text-fg"
            : "text-fg-subtle hover:bg-raised/60 hover:text-fg"
        }`}
      >
        {labels.workspacePlatform}
      </Link>
    </div>
  );
}

function ManagementNavigation({
  navigation,
  pathname,
  onNavigate
}: {
  navigation: ManagementNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {navigation.map((item) => {
        const active = routeIsActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:min-h-10 ${
              active
                ? "bg-accent-surface text-accent-strong before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu({
  labels,
  username,
  displayName,
  publicSiteHref,
  logoutAction,
  compact = false
}: Pick<
  ManagementShellProps,
  | "labels"
  | "username"
  | "displayName"
  | "publicSiteHref"
  | "logoutAction"
> & { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const profileIsActive =
    pathname === "/dashboard/settings" &&
    searchParams.get("section") === "profile";
  const initial = (displayName || username).trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
      ?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${compact ? "" : "w-full"}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        aria-label={compact ? labels.account : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center rounded-lg border border-border bg-raised text-left transition-[border-color,background-color] hover:border-accent/30 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          compact
            ? "h-11 w-11 justify-center"
            : "min-h-12 w-full gap-3 px-3 py-2"
        }`}
      >
        <span className="font-meta flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-surface text-xs font-semibold text-accent-strong">
          {initial}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">
                {displayName || username}
              </span>
              <span className="block truncate text-xs text-fg-subtle">
                @{username}
              </span>
            </span>
            <svg
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-fg-subtle transition ${open ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="dialog"
          aria-label={labels.account}
          className={`z-50 w-72 rounded-xl border border-border-strong bg-raised p-2 shadow-[0_18px_48px_rgb(0_0_0/0.16)] ${
            compact
              ? "fixed right-4 top-16"
              : "absolute bottom-[calc(100%+0.5rem)] left-0"
          }`}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{displayName || username}</p>
            <p className="truncate text-xs text-fg-subtle">@{username}</p>
          </div>
          <div className="my-1 border-t border-border" />
          <Link
            href="/dashboard/settings?section=profile"
            onClick={() => setOpen(false)}
            aria-current={profileIsActive ? "page" : undefined}
            className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {labels.account}
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href={publicSiteHref}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {labels.viewSite}
            <span aria-hidden="true">↗</span>
          </Link>
          {/* Back to the platform root — the directory of every photographer
              hosted here (what pinhaoshe.ca serves). "/" resolves to the
              locale-prefixed directory home. */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-accent-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {labels.directory}
            <span aria-hidden="true">↗</span>
          </Link>
          <div className="my-1 border-t border-border" />
          <div className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm">
            <span className="text-fg-muted">{labels.language}</span>
            <LanguageSwitcher />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm">
            <span className="text-fg-muted">{labels.theme}</span>
            <ThemeToggle label={labels.theme} />
          </div>
          <div className="my-1 border-t border-border" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-medium text-danger transition hover:bg-danger-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              {labels.logout}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Brand({
  logoUrl,
  siteTitle,
  href,
  compact = false
}: Pick<ManagementShellProps, "logoUrl" | "siteTitle"> & {
  href: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={siteTitle}
      className={`flex min-h-11 min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        compact ? "justify-center" : ""
      }`}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 max-w-28 shrink-0 object-contain" />
      ) : (
        <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-base font-semibold text-white dark:text-page">
          {siteTitle.trim().charAt(0).toUpperCase() || "P"}
        </span>
      )}
      <span className={`font-display truncate font-semibold tracking-[-0.02em] ${compact ? "text-base" : "text-lg"}`}>
        {siteTitle}
      </span>
    </Link>
  );
}

export default function ManagementShell({
  children,
  workspace,
  navigation,
  labels,
  username,
  displayName,
  siteTitle,
  logoUrl,
  publicSiteHref,
  isAdmin,
  logoutAction
}: ManagementShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();
  const workspaceHome = workspace === "platform" ? "/admin" : "/dashboard";

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 64rem)");
    function closeAtDesktop(event: MediaQueryListEvent) {
      if (event.matches) setDrawerOpen(false);
    }
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => desktopQuery.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-page p-4 lg:flex">
        <div className="px-2 py-2">
          <Brand logoUrl={logoUrl} siteTitle={siteTitle} href={workspaceHome} />
        </div>
        {isAdmin && (
          <div className="mt-4">
            <WorkspaceSwitch workspace={workspace} labels={labels} />
          </div>
        )}
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <ManagementNavigation navigation={navigation} pathname={pathname} />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <ProfileMenu
            labels={labels}
            username={username}
            displayName={displayName}
            publicSiteHref={publicSiteHref}
            logoutAction={logoutAction}
          />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-page/92 px-4 backdrop-blur-xl lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={labels.menu}
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-raised text-fg-muted transition hover:border-accent/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <Brand
              logoUrl={logoUrl}
              siteTitle={siteTitle}
              href={workspaceHome}
              compact
            />
          </div>
          <ProfileMenu
            compact
            labels={labels}
            username={username}
            displayName={displayName}
            publicSiteHref={publicSiteHref}
            logoutAction={logoutAction}
          />
        </header>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label={labels.close}
              onClick={closeDrawer}
              className="absolute inset-0 bg-black/55"
            />
            <div
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label={labels.menu}
              className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-border bg-page p-4 shadow-[0_24px_80px_rgb(0_0_0/0.28)]"
            >
              <div className="flex items-center justify-between gap-3 px-2 py-1">
                <Brand
                  logoUrl={logoUrl}
                  siteTitle={siteTitle}
                  href={workspaceHome}
                />
                <button
                  ref={closeButtonRef}
                  type="button"
                  aria-label={labels.close}
                  onClick={closeDrawer}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              {isAdmin && (
                <div className="mt-4">
                  <WorkspaceSwitch
                    workspace={workspace}
                    labels={labels}
                    onNavigate={closeDrawer}
                  />
                </div>
              )}
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
                <ManagementNavigation
                  navigation={navigation}
                  pathname={pathname}
                  onNavigate={closeDrawer}
                />
              </div>
              <div className="mt-4 border-t border-border px-2 pt-4">
                <p className="truncate text-sm font-semibold">{displayName || username}</p>
                <p className="truncate text-xs text-fg-subtle">@{username}</p>
              </div>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
