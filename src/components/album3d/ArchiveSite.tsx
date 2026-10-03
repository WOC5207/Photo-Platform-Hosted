"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import EmptyState from "@/components/ui/EmptyState";
import SiteModeSwitch, { useLeaveFor } from "@/components/SiteModeSwitch";
import { classicTwin, parentScreen, parseScreen, screenPath, type Screen } from "@/lib/siteMode";
import { GameMenu, Hints, MENU_SCREENS, Rolling, pad, wrap, type MenuItem } from "./hud";
import { AlbumPhotosContext } from "./AlbumPhotosFeed";
import styles from "./ArchiveSite.module.css";
import { fileCode, tableColumns, type AlbumPhotos, type ArchiveColumn, type ArchiveFile } from "./types";
import type { ArchiveEngine, EngineMove, EnginePalette } from "./engine";

export type { ArchiveColumn, ArchiveFile, ArchivePrint } from "./types";

type EngineStatus = "loading" | "ready" | "unsupported";
type Mode = "archive" | "detail" | "study" | "table" | "photo";
type MotionPreference = "system" | "reduced" | "full";
type ThemePreference = "system" | "light" | "dark";

const MOTION_KEY = "album3d-motion";

// The photo screens load with their own chunk, only when visited.
// The search overlay loads the first time it opens.
const ArchiveIndex = dynamic(() => import("./ArchiveIndex"));
const TableScreen = dynamic(() => import("./PhotoScreens").then((m) => m.TableScreen));
const PhotoScreen = dynamic(() => import("./PhotoScreens").then((m) => m.PhotoScreen));
const StudyScreen = dynamic(() => import("./StudyScreen"));

function readMotion(): MotionPreference {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    return saved === "reduced" || saved === "full" ? saved : "system";
  } catch {
    return "system";
  }
}

function prefersReduced(preference: MotionPreference): boolean {
  if (preference !== "system") return preference === "reduced";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** Applies a theme the way ThemeToggle and the root layout's script do. */
function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // The choice still applies for this visit.
  }
  if (theme !== "system") root.classList.add(theme);
}

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Resolves any CSS colour (hex, rgb, oklch…) to its RGB channels. */
function resolveColor(ctx: CanvasRenderingContext2D, value: string, fallback: string) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = fallback;
  ctx.fillStyle = value.trim() || fallback;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return { css: `rgb(${r}, ${g}, ${b})`, luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
}

function readPalette(element: HTMLElement): EnginePalette {
  const style = getComputedStyle(element);
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const token = (name: string, fallback: string) => resolveColor(ctx, style.getPropertyValue(name), fallback);
  const page = token("--color-page", "#ece8e0");
  return {
    page: page.css,
    surface: token("--color-surface", "#f4f1ea").css,
    raised: token("--color-raised", "#faf8f3").css,
    control: token("--color-control", "#e4dfd5").css,
    fg: token("--color-fg", "#1f1b16").css,
    subtle: token("--color-fg-subtle", "#7a7064").css,
    accent: token("--color-accent", "#b98b4e").css,
    dark: page.luminance < 0.45,
    fontMeta: style.getPropertyValue("--font-meta").trim() || "monospace",
    fontSans: style.getPropertyValue("--font-sans").trim() || "sans-serif"
  };
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea"));
}

/**
 * The 3D site: the platform's albums as a three.js archive (see engine.ts),
 * laid out after RhineLabUI and driven like a game menu.
 *
 * It lives in the /3d layout, so the scene survives every move between
 * screens, and each screen has its own address (see lib/siteMode): a title
 * menu, photographer select, one photographer's menu, album select, the album
 * file and its 360° study. Every control on the canvas has a real button or
 * link in the overlay, so keyboard and screen reader visitors get the same
 * archive without needing the 3D view at all.
 */
export default function ArchiveSite({
  files,
  columns,
  children
}: {
  files: ArchiveFile[];
  columns: ArchiveColumn[];
  children?: ReactNode;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const leaveFor = useLeaveFor();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArchiveEngine | null>(null);

  // ---------------------------------------------------------------- screen --
  const screen: Screen = parseScreen(pathname) ?? { kind: "title" };
  const columnIndex = "username" in screen ? columns.findIndex((c) => c.username === screen.username) : -1;
  const inAlbum = screen.kind === "album" || screen.kind === "table" || screen.kind === "photo";
  const fileIndex =
    inAlbum && columnIndex >= 0
      ? (columns[columnIndex].fileIndexes.find((i) => files[i]?.slug === screen.slug) ?? -1)
      : -1;
  const [album, setAlbum] = useState<AlbumPhotos | null>(null);
  const albumHere = album && "slug" in screen && album.username === screen.username && album.slug === screen.slug ? album : null;
  const photoIndex = screen.kind === "photo" && albumHere ? albumHere.photos.findIndex((p) => p.id === screen.photoId) : -1;
  const missing =
    ("username" in screen && columnIndex < 0) ||
    (inAlbum && fileIndex < 0) ||
    (screen.kind === "photo" && albumHere !== null && photoIndex < 0);
  const mode: Mode = missing
    ? "archive"
    : screen.kind === "album"
      ? screen.study
        ? "study"
        : "detail"
      : screen.kind === "table" || screen.kind === "photo"
        ? screen.kind
        : "archive";
  const overview = missing || MENU_SCREENS.includes(screen.kind);
  const carouselScreen = !missing && (screen.kind === "photographers" || screen.kind === "photographer");

  const [status, setStatus] = useState<EngineStatus>("loading");
  const [selected, setSelected] = useState(() => {
    if (fileIndex >= 0) return fileIndex;
    if (columnIndex >= 0) return columns[columnIndex].fileIndexes[0] ?? 0;
    return 0;
  });
  const [menuFocus, setMenuFocus] = useState(0);
  const [exploded, setExploded] = useState(false);
  const [clear, setClear] = useState(true);
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexUsed, setIndexUsed] = useState(false);
  useEffect(() => {
    if (indexOpen) setIndexUsed(true);
  }, [indexOpen]);
  const [touch, setTouch] = useState(false);
  const [tableFocus, setTableFocus] = useState(0);
  const [motion, setMotion] = useState<MotionPreference>("system");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [gamepad, setGamepad] = useState(false);
  const locale = useLocale();
  // The controller code loads once a controller connects.
  useEffect(() => {
    if (typeof navigator.getGamepads !== "function") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const load = () => {
      window.removeEventListener("gamepadconnected", load);
      import("./gamepad").then(({ watchGamepads }) => {
        if (!cancelled) stop = watchGamepads(setGamepad);
      });
    };
    if (Array.from(navigator.getGamepads()).some((p) => p?.connected)) load();
    else window.addEventListener("gamepadconnected", load);
    return () => {
      cancelled = true;
      window.removeEventListener("gamepadconnected", load);
      stop?.();
    };
  }, []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const file = files[selected];
  const column = file ? columns[file.column] : undefined;
  const slot = column ? Math.max(0, column.fileIndexes.indexOf(selected)) : 0;
  const ready = status === "ready";
  const here = columnIndex >= 0 ? columns[columnIndex] : undefined;

  // The address picks the file: an album opens it, a photographer moves to
  // their lane unless the selection is already in it.
  useEffect(() => {
    if (fileIndex >= 0) setSelected(fileIndex);
    else if (columnIndex >= 0 && files[selectedRef.current]?.column !== columnIndex) {
      setSelected(columns[columnIndex].fileIndexes[0] ?? 0);
    }
    setMenuFocus(screen.kind === "photographers" && columnIndex < 0 ? (files[selectedRef.current]?.column ?? 0) : 0);
    if (screen.kind === "album" && screen.study) setExploded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // A photo's address puts the light table's focus on it, so Esc lands there.
  useEffect(() => {
    if (photoIndex >= 0) setTableFocus(photoIndex);
  }, [photoIndex]);
  useEffect(() => {
    if (!albumHere) setTableFocus(0);
  }, [albumHere]);

  useEffect(() => {
    setMotion(readMotion());
    setTheme(readTheme());
  }, []);

  // Moving between photographers in album select rewrites the address, so a
  // shared link always names the photographer on screen.
  useEffect(() => {
    if (screen.kind !== "albumSelect" || !column || column.username === screen.username) return;
    router.replace(screenPath({ kind: "albumSelect", username: column.username }), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Esc walks back up the screens; a step back to where the visitor came
  // from uses the browser's history so Forward still works.
  const trail = useRef<string[]>([]);
  useEffect(() => {
    const steps = trail.current;
    if (steps.length >= 2 && steps[steps.length - 2] === pathname) steps.pop();
    else if (steps[steps.length - 1] !== pathname) steps.push(pathname);
  }, [pathname]);

  const go = useCallback(
    (next: Screen) => router.push(screenPath(next), { scroll: false }),
    [router]
  );

  const back = useCallback(() => {
    const parent = missing ? { kind: "title" as const } : parentScreen(screen);
    if (!parent) return;
    const target = screenPath(parent);
    const steps = trail.current;
    if (steps.length >= 2 && steps[steps.length - 2] === target) router.back();
    else router.push(target, { scroll: false });
  }, [missing, screen, router]);

  // ------------------------------------------------------------- selection --
  /** Select a file; the same file again still moves to the picked card. */
  const choose = useCallback((index: number) => {
    if (index === selectedRef.current) engineRef.current?.select(index);
    else setSelected(index);
  }, []);

  const step = useCallback(
    (axis: EngineMove["axis"], direction: EngineMove["direction"]) => {
      const engine = engineRef.current;
      // The scene knows which card sits next to the selected one on its
      // endless grid; without it, walk the photographer lists instead.
      if (engine) {
        choose(engine.neighbour({ axis, direction }));
        return;
      }
      const current = files[selectedRef.current];
      if (!current) return;
      const from = columns[current.column].fileIndexes;
      const at = from.indexOf(selectedRef.current);
      if (axis === "file") choose(from[wrap(at + direction, from.length)]);
      else {
        const to = columns[wrap(current.column + direction, columns.length)].fileIndexes;
        choose(to[Math.min(at, to.length - 1)]);
      }
    },
    [files, columns, choose]
  );

  const openDetail = useCallback(
    (index: number) => {
      const target = files[index];
      if (!target) return;
      choose(index);
      go({ kind: "album", username: columns[target.column].username, slug: target.slug, study: false });
    },
    [files, columns, choose, go]
  );

  /** Photographer select: the focused name brings its lane into view. */
  const focusPhotographer = useCallback(
    (index: number) => {
      setMenuFocus(index);
      const first = columns[index]?.fileIndexes[0];
      if (first !== undefined) choose(first);
    },
    [columns, choose]
  );

  const switchPhotographer = useCallback(
    (direction: 1 | -1) => {
      if (columnIndex < 0 || columns.length < 2) return;
      const next = columns[wrap(columnIndex + direction, columns.length)];
      router.replace(screenPath({ kind: "photographer", username: next.username }), { scroll: false });
    },
    [columnIndex, columns, router]
  );

  /** A photographer card in the carousel: focus it, or open it once focused. */
  const onCard = useCallback(
    (index: number, open: boolean) => {
      const target = wrap(index, columns.length);
      const card = columns[target];
      if (!card) return;
      if (screen.kind === "photographer") {
        if (open && target === columnIndex) go({ kind: "albumSelect", username: card.username });
        else if (target !== columnIndex) router.replace(screenPath({ kind: "photographer", username: card.username }), { scroll: false });
        return;
      }
      focusPhotographer(target);
      if (open) go({ kind: "photographer", username: card.username });
    },
    [columns, screen.kind, columnIndex, go, router, focusPhotographer]
  );

  /** A print on the light table: focus it, or open its photo screen. */
  const onPrint = useCallback(
    (index: number, open: boolean) => {
      if (!albumHere || albumHere.photos.length === 0 || !("slug" in screen)) return;
      const target = Math.max(0, Math.min(albumHere.photos.length - 1, index));
      setTableFocus(target);
      if (open) go({ kind: "photo", username: screen.username, slug: screen.slug, photoId: albumHere.photos[target].id });
    },
    [albumHere, screen, go]
  );

  /** ← → on the photo screen walk the album without stacking history. */
  const stepPhoto = useCallback(
    (direction: 1 | -1) => {
      if (!albumHere || screen.kind !== "photo") return;
      const next = albumHere.photos[photoIndex + direction];
      if (!next) return;
      router.replace(screenPath({ ...screen, photoId: next.id }), { scroll: false });
    },
    [albumHere, screen, photoIndex, router]
  );

  // Latest callbacks for the engine, which is created once.
  const handlers = useRef({ step, openDetail, choose, onCard, onPrint });
  useEffect(() => {
    handlers.current = { step, openDetail, choose, onCard, onPrint };
  }, [step, openDetail, choose, onCard, onPrint]);

  // ----------------------------------------------------------------- engine --
  // Create the engine once; three.js loads only after the overlay is up.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || files.length === 0) return;
    if (!webglAvailable()) {
      setStatus("unsupported");
      return;
    }
    let disposed = false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);

    import("./engine")
      .then(({ createArchiveEngine }) => {
        if (disposed) return;
        const engine = createArchiveEngine(canvas, {
          files: files.map((f) => ({
            number: f.number,
            column: f.column,
            title: f.title,
            owner: columns[f.column]?.name ?? "",
            prints: f.prints
          })),
          columns: columns.map((c) => c.fileIndexes),
          palette: readPalette(root),
          reducedMotion: prefersReduced(readMotion()),
          lowPower: coarse || window.innerWidth < 768,
          archiveLabel: t("archiveLabel"),
          onPick: (index) => handlers.current.choose(index),
          onOpen: (index) => handlers.current.openDetail(index),
          onStep: (move) => handlers.current.step(move.axis, move.direction),
          cards: columns.map((c) => {
            const cover = files[c.fileIndexes[0]]?.prints[0];
            return {
              name: c.name,
              username: c.username,
              meta: t("rosterSub", { albums: c.fileIndexes.length, photos: c.photoCount }),
              cover: cover ? { thumb: cover.thumb, med: cover.med } : null
            };
          }),
          onCard: (index, open) => handlers.current.onCard(index, open),
          onPrint: (index, open) => handlers.current.onPrint(index, open)
        });
        engineRef.current = engine;
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("unsupported");
      });

    // Follow the theme toggle and the admin's public palette.
    const syncPalette = () => {
      // The theme class lands before the new custom properties apply.
      requestAnimationFrame(() => engineRef.current?.setPalette(readPalette(root)));
    };
    const observer = new MutationObserver(syncPalette);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", syncPalette);

    return () => {
      disposed = true;
      scheme.removeEventListener("change", syncPalette);
      observer.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // The archive is fixed for the life of the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) engineRef.current?.select(selected);
  }, [selected, ready]);

  // Which stage the scene shows: the carousel for photographers, the light
  // table for an album's photos, the study, or the archive field.
  const carouselFocus = screen.kind === "photographer" ? columnIndex : menuFocus;
  const tableKey = albumHere ? `${albumHere.username}/${albumHere.slug}` : "";
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    if (carouselScreen) {
      engine.showCarousel(Math.max(0, carouselFocus), screen.kind === "photographer");
      return;
    }
    if ((mode === "table" || mode === "photo") && albumHere) {
      engine.showTable(tableKey, albumHere.photos, mode === "photo" ? Math.max(0, photoIndex) : tableFocus, mode === "photo");
      return;
    }
    if (mode === "table" || mode === "photo") return;
    if (mode === "study") {
      engine.openStudy(selectedRef.current);
      return;
    }
    engine.showField();
    engine.setOverview(overview);
    engine.setDetail(mode === "detail");
    // albumHere changes only with tableKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, overview, ready, carouselScreen, carouselFocus, screen.kind, tableKey, tableFocus, photoIndex]);

  useEffect(() => {
    if (ready) engineRef.current?.setReducedMotion(prefersReduced(motion));
  }, [motion, ready]);

  useEffect(() => {
    if (ready && mode === "study") engineRef.current?.setExploded(exploded);
  }, [exploded, mode, ready]);

  useEffect(() => {
    if (ready) engineRef.current?.setClear(clear);
  }, [clear, ready]);

  // ------------------------------------------------------------------ menus --
  const titleMenu: MenuItem[] = [
    {
      key: "photographers",
      label: t("menuPhotographers"),
      sub: t("menuPhotographersSub", { count: columns.length }),
      run: () => go({ kind: "photographers" })
    },
    {
      key: "albums",
      label: t("menuAllAlbums"),
      sub: t("menuAllAlbumsSub", { count: files.length }),
      run: () => go({ kind: "albums" })
    },
    { key: "index", label: t("index"), sub: t("indexSubtitle"), run: () => setIndexOpen(true) },
    { key: "settings", label: t("menuSettings"), sub: t("menuSettingsSub"), run: () => go({ kind: "settings" }) },
    { key: "classic", label: t("menuClassic"), sub: t("menuClassicSub"), external: true, run: () => leaveFor("classic", "/") }
  ];

  // Settings change in place: Enter or → steps forward, ← steps back.
  const cycle = <T,>(values: readonly T[], current: T, direction: number) =>
    values[wrap(values.indexOf(current) + direction, values.length)];
  const THEMES = ["system", "light", "dark"] as const;
  const MOTIONS = ["system", "reduced", "full"] as const;
  const setThemeTo = (next: ThemePreference) => {
    applyTheme(next);
    setTheme(next);
  };
  const setMotionTo = (next: MotionPreference) => {
    try {
      if (next === "system") localStorage.removeItem(MOTION_KEY);
      else localStorage.setItem(MOTION_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
    setMotion(next);
  };
  const settings: (MenuItem & { adjust: (direction: number) => void })[] = [
    {
      key: "language",
      label: t("settingLanguage"),
      sub: t("settingLanguageSub"),
      value: locale === "zh" ? "中文" : "English",
      adjust: () => router.replace(pathname, { locale: locale === "zh" ? "en" : "zh", scroll: false }),
      run: () => undefined
    },
    {
      key: "theme",
      label: t("settingTheme"),
      sub: t("settingThemeSub"),
      value: t(`theme_${theme}`),
      adjust: (direction) => setThemeTo(cycle(THEMES, theme, direction)),
      run: () => undefined
    },
    {
      key: "motion",
      label: t("settingMotion"),
      sub: t("settingMotionSub"),
      value: t(`motion_${motion}`),
      adjust: (direction) => setMotionTo(cycle(MOTIONS, motion, direction)),
      run: () => undefined
    }
  ];
  for (const item of settings) item.run = () => item.adjust(1);

  const rosterMenu: MenuItem[] = columns.map((c, i) => ({
    key: c.username,
    label: c.name,
    sub: t("rosterSub", { albums: c.fileIndexes.length, photos: c.photoCount }),
    run: () => {
      focusPhotographer(i);
      go({ kind: "photographer", username: c.username });
    }
  }));

  const photographerMenu: MenuItem[] = here
    ? [
        {
          key: "albums",
          label: t("menuAlbums"),
          sub: t("menuAllAlbumsSub", { count: here.fileIndexes.length }),
          run: () => go({ kind: "albumSelect", username: here.username })
        },
        ...(here.bookingEnabled
          ? [
              {
                key: "booking",
                label: t("menuBooking"),
                sub: t("menuBookingSub"),
                external: true,
                run: () => router.push(`/u/${encodeURIComponent(here.username)}/booking`)
              }
            ]
          : []),
        {
          key: "classic",
          label: t("menuClassicPage"),
          sub: t("menuClassicPageSub"),
          external: true,
          run: () => leaveFor("classic", `/u/${encodeURIComponent(here.username)}`)
        }
      ]
    : [];

  const activeMenu: MenuItem[] = missing
    ? []
    : screen.kind === "title"
      ? titleMenu
      : screen.kind === "settings"
        ? settings
        : screen.kind === "photographers"
          ? rosterMenu
          : screen.kind === "photographer"
            ? photographerMenu
            : [];

  // -------------------------------------------------------------- keyboard --
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (indexOpen || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (e.key === "Escape" || e.key === "Backspace") {
        if (screen.kind === "title" && !missing) return;
        e.preventDefault();
        back();
        return;
      }
      if (activeMenu.length > 0) {
        const move = (delta: number) => {
          e.preventDefault();
          const next = wrap(menuFocus + delta, activeMenu.length);
          if (screen.kind === "photographers") focusPhotographer(next);
          else setMenuFocus(next);
          document.querySelector<HTMLElement>(`[data-menu-item="${next}"]`)?.scrollIntoView({ block: "nearest" });
        };
        if (e.key === "ArrowUp") return move(-1);
        if (e.key === "ArrowDown") return move(1);
        // The carousel runs left to right, so ← → move it too.
        if (screen.kind === "photographers" && e.key === "ArrowLeft") return move(-1);
        if (screen.kind === "photographers" && e.key === "ArrowRight") return move(1);
        if (screen.kind === "settings" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          settings[menuFocus]?.adjust(e.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        if (screen.kind === "photographer" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          switchPhotographer(e.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        if (e.key === "Enter" && !isInteractive(e.target)) {
          e.preventDefault();
          activeMenu[menuFocus]?.run();
        }
        return;
      }
      if (mode === "table" && albumHere && albumHere.photos.length > 0) {
        const columnsAcross = tableColumns(window.innerWidth, window.innerHeight);
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columnsAcross, ArrowDown: columnsAcross };
        if (e.key in moves) {
          e.preventDefault();
          onPrint(tableFocus + moves[e.key], false);
        } else if (e.key === "Enter" && !isInteractive(e.target)) {
          e.preventDefault();
          onPrint(tableFocus, true);
        }
        return;
      }
      if (mode === "photo") {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          stepPhoto(e.key === "ArrowLeft" ? -1 : 1);
        }
        return;
      }
      if (mode === "detail" && e.key === "Enter" && !isInteractive(e.target) && screen.kind === "album") {
        e.preventDefault();
        go({ kind: "table", username: screen.username, slug: screen.slug });
        return;
      }
      if (mode !== "archive") return;
      const keys: Record<string, () => void> = {
        ArrowUp: () => step("file", -1),
        ArrowDown: () => step("file", 1),
        ArrowLeft: () => step("column", -1),
        ArrowRight: () => step("column", 1),
        "/": () => setIndexOpen(true)
      };
      if (e.key === "Enter" && !isInteractive(e.target)) {
        e.preventDefault();
        openDetail(selectedRef.current);
        return;
      }
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [indexOpen, mode, step, back, activeMenu, settings, menuFocus, screen, missing, focusPhotographer, switchPhotographer, openDetail, albumHere, tableFocus, onPrint, stepPhoto, go]);

  // ----------------------------------------------------------------- render --
  if (files.length === 0 || !file || !column) {
    return (
      <AlbumPhotosContext.Provider value={setAlbum}>
      <main id="main-content" className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-10">
        <EmptyState
          title={t("empty")}
          description={t("emptyHint")}
          action={
            <button type="button" onClick={() => leaveFor("classic", "/")} className="text-sm font-semibold text-accent-text underline">
              {t("classic")}
            </button>
          }
        />
        {children}
      </main>
      </AlbumPhotosContext.Provider>
    );
  }

  const code = fileCode(file.number);
  const altTitle = file.altTitle && file.altTitle !== file.title ? file.altTitle : "";
  const metaLabel = "font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-subtle";
  const square = "grid h-11 w-11 shrink-0 place-items-center text-2xl transition hover:bg-accent-surface";
  const albumsHere = screen.kind === "albumSelect" || (inAlbum && !missing);

  // Where the visitor is, as a trail of links back up the screens.
  const crumbs: { label: string; href?: string }[] = [{ label: t("crumbMenu"), href: screenPath({ kind: "title" }) }];
  if (screen.kind === "albums") crumbs.push({ label: t("menuAllAlbums") });
  if (here && !missing) {
    crumbs.push({ label: t("menuPhotographers"), href: screenPath({ kind: "photographers" }) });
    crumbs.push({ label: here.name, href: screenPath({ kind: "photographer", username: here.username }) });
    if (albumsHere) crumbs.push({ label: t("menuAlbums"), href: screenPath({ kind: "albumSelect", username: here.username }) });
    if (inAlbum && "slug" in screen) crumbs.push({ label: code, href: screenPath({ kind: "album", username: here.username, slug: screen.slug, study: false }) });
    if (screen.kind === "album" && screen.study) crumbs.push({ label: t("study") });
    if (screen.kind === "table" || screen.kind === "photo") {
      crumbs.push({ label: t("lightTable"), href: screenPath({ kind: "table", username: here.username, slug: screen.slug }) });
    }
    if (screen.kind === "photo" && photoIndex >= 0) crumbs.push({ label: t("printCount", { current: pad(photoIndex + 1), total: pad(albumHere?.photos.length ?? 0) }) });
  } else if (screen.kind === "photographers") crumbs.push({ label: t("menuPhotographers") });
  else if (screen.kind === "settings") crumbs.push({ label: t("menuSettings") });
  crumbs[crumbs.length - 1].href = undefined;

  const studyHeader = mode === "study";
  // Controller glyphs replace key names while a controller is in use.
  const key = (name: "move" | "confirm" | "back" | "sides") =>
    gamepad
      ? { move: "✛", confirm: "Ⓐ", back: "Ⓑ", sides: "◀ ▶" }[name]
      : { move: "↑ ↓", confirm: "ENTER", back: "ESC", sides: "← →" }[name];

  return (
    <AlbumPhotosContext.Provider value={setAlbum}>
    <div ref={rootRef} className={`${styles.root} album3d relative h-dvh w-full overflow-hidden bg-page text-fg`}>
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${ready ? "opacity-100" : "opacity-0"}`}
      >
        <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" />
      </div>

      {mode !== "study" && (
        <div
          aria-hidden="true"
          className={styles.shade}
          data-detail={mode === "detail" || mode === "photo"}
          data-overview={overview || mode === "table"}
        />
      )}

      {status === "loading" && (
        <p role="status" className="font-meta absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-fg-subtle">
          {t("loading")}
        </p>
      )}

      {!studyHeader && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-[var(--edge)] pt-4 wide:pt-9">
          <div className="pointer-events-auto flex items-start gap-10">
            <Link href={screenPath({ kind: "title" })} className="block leading-none">
              <span className="block text-xl font-extrabold uppercase tracking-[-0.02em] wide:text-4xl">{t("brandTop")}</span>
              <span className="mt-1 block text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-fg-muted wide:text-xs">{t("brandMiddle")}</span>
              <span className="mt-1 block text-base font-light uppercase tracking-[0.02em] wide:text-2xl">{t("brandBottom")}</span>
            </Link>
            <nav aria-label={t("crumbLabel")} className="hidden pt-2 wide:block">
              <ol className="font-meta flex flex-wrap items-center gap-x-2 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
                {crumbs.map((crumb, i) => (
                  <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-fg">{crumb.label}</Link>
                    ) : (
                      <span aria-current="page" className="text-fg">{crumb.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <nav aria-label={t("brandBottom")} className="pointer-events-auto flex items-center justify-end gap-1 sm:gap-3">
            {mode === "archive" && !overview && (
              <button
                type="button"
                onClick={() => setIndexOpen(true)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.1em] transition hover:text-accent-text"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="9.5" cy="6.5" r="4.5" />
                  <path d="m6.2 9.8-4.7 4.7" />
                </svg>
                <span className="hidden sm:inline">{t("index")}</span>
                <span className="sr-only sm:hidden">{t("index")}</span>
                <kbd className="font-meta hidden border border-border-strong px-1 text-[0.625rem] font-normal sm:inline">/</kbd>
              </button>
            )}
            <span className="hidden sm:contents">
              <SiteModeSwitch current="3d" />
            </span>
            <LanguageSwitcher />
            <ThemeToggle label={tc("toggleTheme")} />
          </nav>
        </header>
      )}

      {/* ----------------------------------------------------- menu screens -- */}
      {missing && (
        <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
          <p className={metaLabel}>{t("archiveLabel")}</p>
          <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-[-0.03em] wide:text-6xl">{t("notFoundTitle")}</h1>
          <p className="mt-3 max-w-md text-sm text-fg-muted">{t("notFoundHint")}</p>
          <GameMenu
            label={t("notFoundTitle")}
            className="mt-8"
            focus={0}
            onFocus={() => undefined}
            items={[{ key: "menu", label: t("notFoundBack"), run: () => go({ kind: "title" }) }]}
          />
        </main>
      )}

      {!missing && screen.kind === "settings" && (
        <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
          <p className={metaLabel}>
            {t("archiveLabel")} <span aria-hidden="true" className="mx-2">／</span> {t("menuSettings")}
          </p>
          <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4.5rem]">
            {t("settingsTitle")}
          </h1>
          <div aria-hidden="true" className={styles.calloutRule} />
          <GameMenu label={t("settingsTitle")} items={settings} focus={menuFocus} onFocus={setMenuFocus} className="mt-8 wide:mt-12" />
          <p className="font-meta mt-6 text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">
            {gamepad ? t("controllerOn") : t("controllerHint")}
          </p>
        </main>
      )}

      {mode === "table" && here && "slug" in screen && (
        <TableScreen
          file={file}
          owner={here.name}
          username={here.username}
          album={albumHere}
          focus={tableFocus}
          onOpen={(index) => onPrint(index, true)}
          onBack={back}
          classicHref={classicTwin(pathname)}
        />
      )}

      {mode === "photo" && here && albumHere && photoIndex >= 0 && (
        <PhotoScreen
          file={file}
          owner={here.name}
          album={albumHere}
          index={photoIndex}
          onStep={stepPhoto}
          onBack={back}
          classicHref={classicTwin(pathname)}
        />
      )}

      {!missing && screen.kind === "title" && (
        <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
          <p className={metaLabel}>
            {t("archiveLabel")} <span aria-hidden="true" className="mx-2">／</span> {t("menuLabel")}
          </p>
          <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4.5rem]">
            {t("menuTitle")}
          </h1>
          <div aria-hidden="true" className={styles.calloutRule} />
          <GameMenu label={t("menuLabel")} items={titleMenu} focus={menuFocus} onFocus={setMenuFocus} className="mt-8 wide:mt-12" />
        </main>
      )}

      {!missing && screen.kind === "photographers" && (
        <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
          <p className={metaLabel}>
            {t("photographerCount", { current: pad(menuFocus + 1), total: pad(columns.length) })}
          </p>
          <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.75rem]">
            {t("rosterTitle")}
          </h1>
          <div aria-hidden="true" className={styles.calloutRule} />
          <div className={`${styles.roster} mt-8 wide:mt-10`}>
            <GameMenu label={t("rosterTitle")} items={rosterMenu} focus={menuFocus} onFocus={focusPhotographer} />
          </div>
        </main>
      )}

      {!missing && screen.kind === "photographer" && here && (
        <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
          <div className="flex items-center gap-3">
            <p className={metaLabel}>
              {t("photographerCount", { current: pad(columnIndex + 1), total: pad(columns.length) })}
            </p>
            {columns.length > 1 && (
              <span className="flex">
                <button type="button" onClick={() => switchPhotographer(-1)} aria-label={t("prevColumn")} className={square}>←</button>
                <button type="button" onClick={() => switchPhotographer(1)} aria-label={t("nextColumn")} className={square}>→</button>
              </span>
            )}
          </div>
          <h1 className="mt-1 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[4.5rem]">
            {here.name}
          </h1>
          <p className="font-meta mt-3 text-xs tracking-[0.1em] text-fg-subtle">@{here.username}</p>
          <div aria-hidden="true" className={styles.calloutRule} />
          <dl className="mt-6 flex gap-12">
            {[
              [t("statAlbums"), here.fileIndexes.length],
              [t("statPhotos"), here.photoCount]
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className={metaLabel}>{label}</dt>
                <dd className="mt-1 text-[2.125rem] leading-none wide:text-[3rem]">
                  <Rolling value={pad(Number(value))} />
                  <span className="sr-only">{value}</span>
                </dd>
              </div>
            ))}
          </dl>
          <GameMenu label={here.name} items={photographerMenu} focus={menuFocus} onFocus={setMenuFocus} className="mt-8" />
        </main>
      )}

      {overview && (
        <Hints
          className={styles.menuHint}
          parts={[
            ...(screen.kind === "photographer" && !missing ? [`${key("sides")} ${t("hintPhotographer")}`] : []),
            ...(screen.kind === "settings" ? [`${key("sides")} ${t("hintChange")}`] : []),
            `${key("move")} ${t("hintSelect")}`,
            `${key("confirm")} ${t("hintConfirm")}`,
            ...(screen.kind !== "title" || missing ? [`${key("back")} ${t("hintBack")}`] : [])
          ]}
        />
      )}

      {(mode === "table" || mode === "photo") && !touch && (
        <Hints
          className={styles.menuHint}
          parts={
            mode === "table"
              ? [`${gamepad ? "✛" : "← → ↑ ↓"} ${t("hintPrint")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]
              : [`${key("sides")} ${t("hintPhoto")}`, `${key("back")} ${t("hintTable")}`]
          }
        />
      )}

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {mode === "archive" && !overview
          ? t("announce", { title: file.title, owner: column.name, current: slot + 1, total: column.fileIndexes.length })
          : ""}
      </p>

      {/* -------------------------------------------------- archive screens -- */}
      {mode === "archive" && !overview && (
        <main id="main-content" tabIndex={-1} className="outline-none">
          <section aria-labelledby="album3d-title" className={styles.callout}>
            <p className="font-meta text-[0.5625rem] uppercase tracking-[0.1em] text-fg-subtle sm:text-xs">
              {t("archiveLabel")} <span aria-hidden="true" className="mx-1 sm:mx-3">／</span> {column.name}
            </p>
            <button
              type="button"
              onClick={() => openDetail(selected)}
              className="group mt-3 flex min-h-11 w-full items-center gap-2 text-left text-xl font-bold tracking-[0.01em] sm:mt-5 wide:text-[1.75rem]"
            >
              <span className="whitespace-nowrap">
                {t("fileNumber").toUpperCase()}: <Rolling value={code} />
                <span className="sr-only">{code}</span>
              </span>
              <span aria-hidden="true" className="ml-auto text-xl transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 wide:ml-12 wide:opacity-0 wide:group-hover:opacity-100">↗</span>
            </button>
            <div aria-hidden="true" className={styles.calloutRule} />
            <div className={styles.calloutBody}>
              <div className="mt-3 flex items-baseline justify-between gap-5 wide:mt-5">
                <h1 id="album3d-title" className="min-w-0 text-base font-medium leading-snug sm:text-lg">
                  {file.title}
                  {altTitle && <span className="block text-xs font-normal text-fg-muted">{altTitle}</span>}
                </h1>
                <p className="font-meta shrink-0 text-[0.625rem] uppercase tracking-[0.1em] text-fg-subtle">
                  {file.dateLabel || t("noDate")}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-10 wide:mt-12">
                <button
                  type="button"
                  onClick={() => openDetail(selected)}
                  className="group inline-flex min-h-11 items-center gap-12 text-sm font-medium uppercase tracking-[0.07em] wide:gap-16"
                >
                  {t("openFile")}
                  <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-2 motion-reduce:transition-none">→</span>
                </button>
                <Link href={file.href} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                  {t("viewAlbum")} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          </section>

          <div className={styles.counter}>
            <p className={metaLabel}>{t("select")}</p>
            <p className="mt-1 flex items-baseline gap-3 font-normal wide:mt-4 wide:gap-5">
              <span className="text-[2.125rem] leading-none wide:text-[3.625rem]">
                <Rolling value={pad(slot + 1)} />
              </span>
              <span aria-hidden="true" className="text-xl font-light text-fg-subtle wide:text-[2rem]">/</span>
              <span className="text-sm text-fg-muted wide:text-[1.375rem]">{pad(column.fileIndexes.length)}</span>
            </p>
          </div>

          <div className={`${styles.fileNav} items-center gap-1.5 wide:gap-8`}>
            <button type="button" onClick={() => step("file", -1)} aria-label={t("prevFile")} className={square}>↑</button>
            <ol className="flex h-10 items-center gap-0 wide:gap-3">
              {column.fileIndexes.slice(0, 24).map((index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => choose(index)}
                    aria-label={`${fileCode(files[index]?.number ?? 0)} ${files[index]?.title ?? ""}`}
                    aria-current={index === selected ? "true" : undefined}
                    className="group relative block h-10 w-3.5 max-sm:w-[1.6875rem]"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-1/2 top-1/2 w-0.5 -translate-x-1/2 -translate-y-1/2 transition-all duration-400 ${
                        index === selected ? "h-8 bg-fg" : "h-3 bg-fg/35 group-hover:h-6 group-hover:bg-accent"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => step("file", 1)} aria-label={t("nextFile")} className={square}>↓</button>
          </div>

          {columns.length > 1 && (
            <div className={`${styles.columnNav} flex items-center gap-2 wide:gap-6`}>
              <button type="button" onClick={() => step("column", -1)} aria-label={t("prevColumn")} className={square}>←</button>
              <div className="grid min-w-[6.25rem] gap-1 wide:min-w-36 wide:gap-2">
                <span className="font-meta text-[0.5rem] uppercase tracking-[0.12em] text-fg-subtle wide:text-[0.625rem]">
                  {t("photographerCount", { current: pad(file.column + 1), total: pad(columns.length) })}
                </span>
                <strong className="max-w-40 truncate text-[0.8125rem] font-normal wide:text-[0.9375rem]">{column.name}</strong>
              </div>
              <button type="button" onClick={() => step("column", 1)} aria-label={t("nextColumn")} className={square}>→</button>
            </div>
          )}

          <p className={`${styles.hint} font-meta text-[0.625rem] uppercase tracking-[0.08em] text-fg-subtle`}>
            {touch ? (
              t("hintTouch")
            ) : (
              <>
                ← → {t("hintPhotographer")} <span aria-hidden="true" className="mx-3">／</span> ↑ ↓ {t("hintAlbum")}
                <span aria-hidden="true" className="mx-3">／</span> ENTER {t("hintOpen")}
                <span aria-hidden="true" className="mx-3">／</span> ESC {t("hintBack")}
              </>
            )}
          </p>
        </main>
      )}

      {mode === "detail" && (
        <main id="main-content" tabIndex={-1} className="outline-none">
          <button
            type="button"
            onClick={back}
            className={`${styles.back} z-10 flex min-h-11 items-center gap-2 px-2 text-2xl transition hover:text-accent-text wide:gap-5 wide:px-0`}
          >
            <span aria-hidden="true">←</span>
            <span className="text-[0.625rem] uppercase tracking-[0.1em] wide:text-xs">{t("archiveOverview")}</span>
            <kbd className="font-meta ml-4 hidden border border-border-strong p-1 text-[0.625rem] text-fg-subtle wide:inline">ESC</kbd>
          </button>

          <div className={`${styles.caption} flex items-center justify-between gap-3 wide:block`}>
            <div>
              <p className="text-[0.9375rem] tracking-[-0.03em] sm:text-xl wide:text-[2.3rem]">{code}</p>
              <p className="font-meta mt-1 hidden text-[0.5rem] uppercase tracking-[0.18em] text-fg-subtle sm:block wide:mt-2 wide:text-[0.625rem]">
                {t("archiveLabel")}
              </p>
              <p className="font-meta mt-8 hidden text-[0.625rem] uppercase tracking-[0.1em] text-fg-subtle wide:block">
                {t("dragToInspect")} <span aria-hidden="true" className="ml-4 text-lg">↔</span>
              </p>
            </div>
            <Link
              href={screen.kind === "album" ? screenPath({ ...screen, study: true }) : pathname}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-4 border-fg-subtle text-sm tracking-[0.02em] transition hover:border-accent hover:text-accent-text wide:mt-6 wide:border-b wide:pb-1"
            >
              {t("view360")} <span aria-hidden="true" className="text-xl">↗</span>
            </Link>
          </div>

          <article aria-labelledby="album3d-detail-title" className={styles.document}>
            <p className="flex items-center justify-between font-meta text-[0.6875rem] uppercase tracking-[0.14em]">
              <span>{code}</span>
              <span className="text-[0.5625rem] text-fg-subtle">{column.name}</span>
            </p>
            <h1 id="album3d-detail-title" className="mb-2 mt-3 text-[1.6875rem] font-bold leading-[1.12] tracking-[-0.03em] [overflow-wrap:anywhere] wide:mb-3 wide:mt-7 wide:text-[2.5rem]">
              {file.title}
            </h1>
            {altTitle && <p className="text-lg wide:text-[1.4375rem]">{altTitle}</p>}
            <div aria-hidden="true" className="mt-5 h-0.5 bg-fg wide:mt-7" />
            <dl className="my-6 grid grid-cols-2 gap-x-10 gap-y-6 wide:my-7">
              {[
                [t("metaPhotographer"), column.name],
                [t("metaDate"), file.dateLabel || t("noDate")],
                [t("metaLocation"), file.location || t("notRecorded")],
                [t("metaPrints"), t("photos", { count: file.photoCount })]
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-meta text-[0.5625rem] uppercase tracking-[0.08em] text-fg-subtle">{label}</dt>
                  <dd className="mt-2 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            {file.prints.length > 0 && (
              <>
                <p className={metaLabel}>{t("contactSheet")}</p>
                <ul className="mt-3 grid grid-cols-6 gap-1.5">
                  {file.prints.slice(0, 6).map((print, i) => (
                    <li key={print.thumb + i} className="aspect-square overflow-hidden bg-control">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={print.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-7 grid gap-2">
              <Link
                href={screenPath({ kind: "table", username: column.username, slug: file.slug })}
                scroll={false}
                className="inline-flex min-h-12 items-center justify-between gap-4 bg-fg px-5 text-sm font-semibold uppercase tracking-[0.08em] text-page transition hover:bg-accent-text"
              >
                {t("openLightTable")}
                <span className="flex items-center gap-3">
                  <kbd className="font-meta hidden border border-page/40 px-1 text-[0.625rem] font-normal wide:inline">{key("confirm")}</kbd>
                  <span aria-hidden="true" className="text-lg">→</span>
                </span>
              </Link>
              <Link
                href={file.href}
                className="inline-flex min-h-11 items-center justify-between gap-4 border border-border-strong px-5 text-sm uppercase tracking-[0.08em] transition hover:border-fg"
              >
                {t("viewAlbum")}
                <span aria-hidden="true" className="text-lg">↗</span>
              </Link>
            </div>
            <p className="font-meta mt-5 flex justify-between text-[0.625rem] uppercase tracking-[0.1em] text-fg-subtle">
              <span>{t("photographerCount", { current: pad(file.column + 1), total: pad(columns.length) })}</span>
              <span>
                {pad(slot + 1, 3)} / {pad(column.fileIndexes.length, 3)}
              </span>
            </p>
          </article>
        </main>
      )}

      {mode === "study" && (
        <StudyScreen
          file={file}
          owner={column.name}
          exploded={exploded}
          clear={clear}
          touch={touch}
          onBack={back}
          onExplode={setExploded}
          onClear={setClear}
          onReset={() => engineRef.current?.resetView()}
        />
      )}

      {mode !== "study" && (
        <footer className={`${styles.footer} ${mode === "detail" ? "hidden wide:flex" : "flex"} pointer-events-none items-center justify-between gap-3 font-meta text-[0.5rem] uppercase tracking-[0.12em] text-fg-subtle wide:text-[0.625rem]`}>
          <span className="flex items-center gap-2">
            <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            {t("connected")}
          </span>
          <button
            type="button"
            onClick={() => leaveFor("classic", classicTwin(pathname))}
            className="pointer-events-auto inline-flex min-h-7 items-center uppercase hover:text-fg"
          >
            {t("classic")} <span aria-hidden="true" className="ml-2">↗</span>
          </button>
        </footer>
      )}

      {status === "unsupported" && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-page px-4 pb-10 pt-32 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-xl font-bold">{t("unsupportedTitle")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t("unsupportedHint")}</p>
            <button
              type="button"
              onClick={() => leaveFor("classic", classicTwin(pathname))}
              className="mt-4 inline-flex min-h-11 items-center bg-fg px-5 text-sm font-semibold uppercase tracking-[0.08em] text-page"
            >
              {t("unsupportedClassic")}
            </button>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {files.map((f) => (
                <li key={f.id}>
                  <Link href={f.href} className="flex min-h-12 items-center gap-4 py-3 hover:bg-fg/5">
                    <span className="font-meta w-16 text-xs">{fileCode(f.number)}</span>
                    <span className="flex-1 font-medium">{f.title}</span>
                    <span className="text-sm text-fg-subtle">{columns[f.column]?.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {(indexOpen || indexUsed) && (
        <ArchiveIndex
          open={indexOpen}
          onClose={() => setIndexOpen(false)}
          files={files}
          columns={columns}
          onSelect={(index) => {
            setIndexOpen(false);
            if (mode === "archive" && !overview) choose(index);
            else openDetail(index);
          }}
          onOpen={(index) => {
            setIndexOpen(false);
            openDetail(index);
          }}
        />
      )}
      {children}
    </div>
    </AlbumPhotosContext.Provider>
  );
}
