/**
 * The guided first-login tutorial: create an event, then add photos.
 *
 * Pure data and routing, shared by the client component
 * (src/components/dashboard/OnboardingTour.tsx) and its test. Each step names
 * the dashboard route it belongs to (locale prefix already stripped, as
 * next-intl's usePathname reports it) and the `data-tour` anchor the page
 * renders for it. The route is what advances the tour: the user either presses
 * Next or clicks the highlighted control themselves, and either way the new
 * page resolves to its first step.
 */

export type TourAdvance =
  /** Next moves to the following step on the same page. */
  | "next"
  /** Next activates the highlighted link; the resulting route change advances. */
  | "click"
  /** Only the highlighted control advances (a form submit the tour cannot press). */
  | "manual"
  /** Last step: the primary button finishes the tour. */
  | "finish";

export interface TourStep {
  id: string;
  /** Route the step belongs to. Same-page steps share the same RegExp object. */
  route: RegExp;
  /** CSS selector of the highlighted element. */
  target: string;
  advance: TourAdvance;
}

const OVERVIEW = /^\/dashboard\/?$/;
const EVENT_LIST = /^\/dashboard\/events\/?$/;
const NEW_EVENT = /^\/dashboard\/events\/new\/?$/;
const BOOKING_PAGE = /^\/dashboard\/bookings\/(?!new$)[^/]+\/?$/;
const GALLERY_PAGE = /^\/dashboard\/events\/(?!new$)[^/]+\/?$/;
const PHOTO_WIZARD = /^\/dashboard\/events\/(?!new$)[^/]+\/photos\/?$/;

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "overview", route: OVERVIEW, target: '[data-tour="events-card"]', advance: "click" },
  { id: "newEvent", route: EVENT_LIST, target: '[data-tour="new-event"]', advance: "click" },
  { id: "eventTitle", route: NEW_EVENT, target: '[data-tour="event-title"]', advance: "next" },
  { id: "eventDates", route: NEW_EVENT, target: '[data-tour="event-dates"]', advance: "next" },
  { id: "eventCreate", route: NEW_EVENT, target: '[data-tour="event-create"]', advance: "manual" },
  { id: "galleryTab", route: BOOKING_PAGE, target: '[data-tour="tab-gallery"]', advance: "click" },
  { id: "addPhotos", route: GALLERY_PAGE, target: '[data-tour="add-photos"]', advance: "click" },
  { id: "upload", route: PHOTO_WIZARD, target: '[data-tour="upload-picker"]', advance: "next" },
  { id: "publish", route: PHOTO_WIZARD, target: '[data-tour="wizard-forward"]', advance: "finish" }
];

/**
 * Which step to show on `pathname` when the tour last stood at `current`.
 *
 * The current step wins while its page is open. Otherwise the nearest step
 * ahead on the new page (its first step, so a page is always entered from the
 * top), then the nearest step behind (its last step, so going back lands where
 * the user left). Null means the page is not on the path and the tour stays
 * hidden without losing its place.
 */
export function resolveTourStep(pathname: string, current: number): number | null {
  const at = TOUR_STEPS[current];
  if (at && at.route.test(pathname)) return current;
  for (let index = current + 1; index < TOUR_STEPS.length; index += 1) {
    if (TOUR_STEPS[index].route.test(pathname)) return index;
  }
  for (let index = Math.min(current, TOUR_STEPS.length) - 1; index >= 0; index -= 1) {
    if (TOUR_STEPS[index].route.test(pathname)) return index;
  }
  return null;
}

/** Back is offered only within a page; crossing pages is the user's navigation. */
export function tourStepHasBack(index: number): boolean {
  const previous = TOUR_STEPS[index - 1];
  return previous !== undefined && previous.route === TOUR_STEPS[index].route;
}
