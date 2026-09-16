"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import {
  TOUR_STEPS,
  resolveTourStep,
  tourStepHasBack
} from "@/lib/onboardingTour";

/**
 * Coach marks for the first-login tutorial.
 *
 * Mounted once in the dashboard layout so it survives client navigations; the
 * step index is mirrored to sessionStorage because the photo wizard ends with
 * a document reload. Nothing is modal: the darkening is a box-shadow on a
 * pointer-transparent frame around the highlighted control, so the user can
 * always click that control (which is the point) or anything else. Pages that
 * have no step hide the tour until the user is back on the path.
 */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const FRAME_PADDING = 6;
const GAP = 12;
const EDGE = 16;
const NARROW = 640;
/** Below the 4 rem mobile header plus a breath. */
const TALL_TARGET_TOP = 80;

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function sameBox(a: Box | null, b: Box): boolean {
  return (
    a !== null &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function storageKeyFor(account: string): string {
  return `onboarding-tour:${account}`;
}

function readStoredStep(key: string): number {
  try {
    const raw = window.sessionStorage.getItem(key);
    const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isInteger(value) && value >= 0 && value < TOUR_STEPS.length ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredStep(key: string, index: number | null): void {
  try {
    if (index === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, String(index));
  } catch {
    // Private mode or blocked storage: the tour still works within one page load.
  }
}

export default function OnboardingTour({
  active,
  account,
  completeAction
}: {
  /** False once the account has finished or skipped the tour. */
  active: boolean;
  /** Storage namespace so two accounts in one browser never share progress. */
  account: string;
  completeAction: () => Promise<void>;
}) {
  const t = useTranslations("tour");
  const pathname = usePathname();
  const storageKey = storageKeyFor(account);

  // null until mounted: the tour renders only in the browser.
  const [index, setIndex] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(active);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    setIndex(readStoredStep(storageKey));
  }, [storageKey]);

  // Replaying from the Overview page flips `active` back on while mounted.
  useEffect(() => {
    if (active && !wasActive.current) {
      setIndex(0);
      setDone(false);
    }
    wasActive.current = active;
  }, [active]);

  const stepIndex = index === null ? null : resolveTourStep(pathname, index);
  const step = stepIndex === null ? null : TOUR_STEPS[stepIndex];
  const showing = active && !done && step !== null;

  // Commit the resolved step so progress follows the user's own navigation.
  useEffect(() => {
    if (stepIndex !== null && stepIndex !== index) setIndex(stepIndex);
  }, [stepIndex, index]);

  useEffect(() => {
    if (!active || done || index === null) return;
    writeStoredStep(storageKey, index);
  }, [active, done, index, storageKey]);

  // Find the anchor, waiting for it if the page is still streaming in.
  useEffect(() => {
    if (!showing || !step) {
      setTarget(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>(step.target);
    const found = find();
    setTarget(found);
    if (found) return;
    const observer = new MutationObserver(() => {
      const element = find();
      if (element) {
        observer.disconnect();
        setTarget(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [showing, step, pathname]);

  // Track the anchor's position through scrolling, resizing and layout shifts.
  useEffect(() => {
    if (!target) {
      setBox(null);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!target.isConnected) {
        setTarget(null);
        return;
      }
      const next = boxOf(target);
      setBox((current) => (sameBox(current, next) ? current : next));
      setViewport((current) =>
        current && current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { width: window.innerWidth, height: window.innerHeight }
      );
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    const resize = new ResizeObserver(schedule);
    resize.observe(target);
    resize.observe(document.body);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const interval = window.setInterval(schedule, 500);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.clearInterval(interval);
    };
  }, [target]);

  // Bring a newly highlighted control into view, once per control, after the
  // popover has been measured so its height can be accounted for.
  const scrolledFor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!target || !popoverSize || scrolledFor.current === target) return;
    scrolledFor.current = target;
    const rect = target.getBoundingClientRect();
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    if (window.innerWidth < NARROW) {
      // The popover takes the top or bottom edge on a phone. If the control
      // sits clear of one of those zones it can stay; otherwise align it just
      // under the sticky header, which frees the bottom edge for the popover
      // (or comes as close as a very tall control allows).
      const zone = popoverSize.height + GAP + EDGE;
      const clearOfBottom = rect.bottom <= window.innerHeight - zone;
      const clearOfTop = rect.top >= zone;
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (inView && (clearOfBottom || clearOfTop)) return;
      window.scrollTo({ top: window.scrollY + rect.top - TALL_TARGET_TOP, behavior });
      return;
    }
    const visible =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;
    if (visible) return;
    if (rect.height > window.innerHeight / 2) {
      window.scrollTo({ top: window.scrollY + rect.top - TALL_TARGET_TOP, behavior });
      return;
    }
    target.scrollIntoView({ block: "center", inline: "nearest", behavior });
  }, [target, popoverSize]);

  // The popover mounts only once the anchor's box is known, so measure on that
  // transition (and on every step, whose copy changes the height), not merely
  // when the anchor is found.
  const popoverMounted = showing && target !== null && box !== null && viewport !== null;
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) {
      setPopoverSize(null);
      return;
    }
    const measure = () =>
      setPopoverSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [popoverMounted, step]);

  // Announce the step by moving focus to it, unless the user is typing somewhere.
  // Only once measured: until then the popover is visibility-hidden, which
  // makes it unfocusable.
  const popoverVisible = popoverMounted && popoverSize !== null;
  useEffect(() => {
    if (!popoverVisible) return;
    // Two frames later, so it lands after a page that focuses its own section
    // on mount in the next frame (the photo wizard does) and the tour is what
    // gets announced.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const current = document.activeElement;
        const typing =
          current instanceof HTMLElement &&
          (current.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(current.tagName));
        if (!typing) popoverRef.current?.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [popoverVisible, step]);

  const finish = useCallback(() => {
    setDone(true);
    writeStoredStep(storageKey, null);
    startTransition(async () => {
      await completeAction();
    });
  }, [completeAction, storageKey]);

  if (!showing || !step || stepIndex === null || !target || !box || !viewport) return null;

  const total = TOUR_STEPS.length;
  const hasBack = tourStepHasBack(stepIndex);
  const narrow = viewport.width < NARROW;

  const frame: Box = {
    top: box.top - FRAME_PADDING,
    left: box.left - FRAME_PADDING,
    width: box.width + FRAME_PADDING * 2,
    height: box.height + FRAME_PADDING * 2
  };

  let popoverStyle: React.CSSProperties;
  if (narrow) {
    // Pinned to the top or bottom edge, whichever covers less of the control;
    // a tall control (the day picker) is scrolled to the top so the bottom is free.
    const height = popoverSize?.height ?? 200;
    const overlapWith = (top: number, bottom: number) =>
      Math.max(0, Math.min(bottom, frame.top + frame.height) - Math.max(top, frame.top));
    const atTop = overlapWith(EDGE, EDGE + height);
    const atBottom = overlapWith(viewport.height - EDGE - height, viewport.height - EDGE);
    popoverStyle =
      atTop < atBottom
        ? { top: EDGE, left: EDGE, right: EDGE }
        : { bottom: EDGE, left: EDGE, right: EDGE };
  } else {
    const width = popoverSize?.width ?? 352;
    const height = popoverSize?.height ?? 200;
    const left = Math.min(Math.max(frame.left, EDGE), Math.max(EDGE, viewport.width - width - EDGE));
    const below = frame.top + frame.height + GAP;
    const above = frame.top - GAP - height;
    const top =
      below + height <= viewport.height - EDGE
        ? below
        : above >= EDGE
          ? above
          : Math.max(EDGE, viewport.height - EDGE - height);
    popoverStyle = { top, left, width: "min(22rem, calc(100vw - 2rem))" };
  }

  const onPrimary = () => {
    if (step.advance === "next") setIndex(stepIndex + 1);
    else if (step.advance === "click") target.click();
    else if (step.advance === "finish") finish();
  };

  return createPortal(
    <>
      <div
        aria-hidden="true"
        data-tour-frame={step.id}
        className="pointer-events-none fixed z-[70] rounded-xl ring-2 ring-accent transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
        style={{
          top: frame.top,
          left: frame.left,
          width: frame.width,
          height: frame.height,
          boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.45)"
        }}
      />
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={t("dialogLabel")}
        aria-describedby={`${titleId} ${bodyId}`}
        data-tour-step={step.id}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish();
          }
        }}
        className={`fixed z-[71] flex flex-col gap-3 rounded-xl border border-border-strong bg-raised p-4 text-fg shadow-[0_18px_48px_rgb(0_0_0/0.24)] outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          popoverSize ? "" : "invisible"
        }`}
        style={popoverStyle}
      >
        <p className="font-meta text-[0.6875rem] font-semibold tracking-[0.14em] text-accent">
          {t("stepOf", { current: stepIndex + 1, total })}
        </p>
        <h2 id={titleId} className="font-display text-lg font-semibold leading-tight tracking-[-0.02em]">
          {t(`steps.${step.id}.title`)}
        </h2>
        <p id={bodyId} className="text-sm leading-6 text-fg-muted">
          {t(`steps.${step.id}.body`)}
        </p>
        {step.advance === "manual" && (
          <p className="text-xs font-medium text-fg-subtle">{t("clickToContinue")}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={finish}
            className={buttonClasses({ variant: "ghost", size: "compact" })}
          >
            {t("skip")}
          </button>
          <div className="flex items-center gap-2">
            {hasBack && (
              <button
                type="button"
                onClick={() => setIndex(stepIndex - 1)}
                className={buttonClasses({ variant: "secondary", size: "compact" })}
              >
                {t("back")}
              </button>
            )}
            {step.advance !== "manual" && (
              <button
                type="button"
                onClick={onPrimary}
                className={buttonClasses({ variant: "primary", size: "compact" })}
              >
                {step.advance === "finish" ? t("finish") : t("next")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
