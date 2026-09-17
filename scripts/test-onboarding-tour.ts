/**
 * The first-login tutorial's route logic: which step a page shows given where
 * the tour last stood. The coach marks themselves are exercised by the
 * Playwright walkthrough in e2e/ui-workflows.spec.ts; this covers the pure
 * resolver that both rely on, without a browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TOUR_STEPS,
  resolveTourStep,
  tourRequirementMet,
  tourStepHasBack
} from "../src/lib/onboardingTour";

const index = (id: string) => {
  const found = TOUR_STEPS.findIndex((step) => step.id === id);
  assert.notEqual(found, -1, `unknown step ${id}`);
  return found;
};

// The path a new account follows, in order, each page entered from its first step.
assert.equal(resolveTourStep("/dashboard", 0), index("overview"));
assert.equal(resolveTourStep("/dashboard/events", index("overview")), index("newEvent"));
assert.equal(resolveTourStep("/dashboard/events/new", index("newEvent")), index("eventTitle"));
assert.equal(resolveTourStep("/dashboard/events/new", index("eventDates")), index("eventDates"));
assert.equal(
  resolveTourStep("/dashboard/bookings/cmabc123", index("eventCreate")),
  index("galleryTab")
);
assert.equal(
  resolveTourStep("/dashboard/events/cmabc123", index("galleryTab")),
  index("addPhotos")
);
assert.equal(
  resolveTourStep("/dashboard/events/cmabc123/photos", index("addPhotos")),
  index("upload")
);
assert.equal(
  resolveTourStep("/dashboard/events/cmabc123/photos", index("publish")),
  index("publish")
);

// "new" is a reserved segment, never an event id.
assert.equal(resolveTourStep("/dashboard/events/new", index("overview")), index("eventTitle"));
assert.equal(resolveTourStep("/dashboard/bookings/new", index("eventCreate")), null);

// Going back a page lands on that page's last step, so the user resumes where
// they left rather than being walked through it again from the top.
assert.equal(
  resolveTourStep("/dashboard/events/new", index("galleryTab")),
  index("eventCreate")
);
assert.equal(resolveTourStep("/dashboard/events", index("eventTitle")), index("newEvent"));

// Opening an existing album from the list skips straight to adding photos.
assert.equal(
  resolveTourStep("/dashboard/events/cmexisting", index("newEvent")),
  index("addPhotos")
);

// Pages off the path hide the tour without moving it.
assert.equal(resolveTourStep("/dashboard/settings", index("eventDates")), null);
assert.equal(resolveTourStep("/dashboard/equipment", 0), null);
assert.equal(resolveTourStep("/admin", index("publish")), null);

// A stale stored index is tolerated.
assert.equal(resolveTourStep("/dashboard", TOUR_STEPS.length + 5), index("overview"));

// Back stays within a page.
assert.equal(tourStepHasBack(index("eventTitle")), false);
assert.equal(tourStepHasBack(index("eventDates")), true);
assert.equal(tourStepHasBack(index("eventCreate")), true);
assert.equal(tourStepHasBack(index("galleryTab")), false);
assert.equal(tourStepHasBack(index("publish")), true);
assert.equal(tourStepHasBack(0), false);

// Steps that ask for input gate their own Next button, so the tour cannot walk
// anyone to the Create button with a form the server will reject.
assert.deepEqual(
  TOUR_STEPS.filter((step) => step.requires).map((step) => step.id),
  ["eventTitle", "eventDates"]
);
for (const step of TOUR_STEPS) {
  if (step.requires) assert.equal(step.advance, "next", `${step.id}: only Next can be gated`);
}

// A title in either language satisfies the text requirement; blank does not.
const titleRequirement = TOUR_STEPS[index("eventTitle")].requires!;
assert.equal(titleRequirement.kind, "text");
assert.equal(tourRequirementMet(titleRequirement, ["", ""]), false);
assert.equal(tourRequirementMet(titleRequirement, ["   ", "\t\n"]), false);
assert.equal(tourRequirementMet(titleRequirement, ["", "Sakura shoot"]), true);
assert.equal(tourRequirementMet(titleRequirement, ["樱花场照", ""]), true);
assert.equal(tourRequirementMet(titleRequirement, []), false);

// The day picker publishes its selection as a hidden JSON array.
const daysRequirement = TOUR_STEPS[index("eventDates")].requires!;
assert.equal(daysRequirement.kind, "list");
assert.equal(tourRequirementMet(daysRequirement, ["[]"]), false);
assert.equal(tourRequirementMet(daysRequirement, [""]), false);
assert.equal(tourRequirementMet(daysRequirement, ["not json"]), false);
assert.equal(tourRequirementMet(daysRequirement, ['{"a":1}']), false);
assert.equal(tourRequirementMet(daysRequirement, ['["2026-10-15"]']), true);
assert.equal(tourRequirementMet(daysRequirement, ['["2026-10-15","2026-10-16"]']), true);

// Every anchor is unique and every step has translated copy in both locales.
const anchors = new Set(TOUR_STEPS.map((step) => step.target));
assert.equal(anchors.size, TOUR_STEPS.length, "anchors must be unique");
for (const locale of ["en", "zh"] as const) {
  const messages = JSON.parse(
    readFileSync(path.join(__dirname, "..", "messages", `${locale}.json`), "utf8")
  ) as {
    tour: { steps: Record<string, { title: string; body: string; blocked?: string }> };
  };
  for (const step of TOUR_STEPS) {
    const copy = messages.tour.steps[step.id];
    assert.ok(copy?.title && copy?.body, `${locale}: missing copy for ${step.id}`);
    // A gated step has to be able to say what it is waiting for.
    if (step.requires) {
      assert.ok(copy.blocked, `${locale}: missing blocked copy for ${step.id}`);
    } else {
      assert.equal(copy.blocked, undefined, `${locale}: stray blocked copy on ${step.id}`);
    }
  }
  assert.deepEqual(
    Object.keys(messages.tour.steps).sort(),
    TOUR_STEPS.map((step) => step.id).sort(),
    `${locale}: stray step copy`
  );
}

console.log("Onboarding tour tests passed.");
