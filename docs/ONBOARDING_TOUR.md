# First-login tutorial

A step-by-step on-screen tour that greets a new account on its first visit to
the dashboard and walks it through creating an event and adding photos. It is
the second half of onboarding: registration and the setup wizard configure the
site, then the tour shows how to use it.

## When it appears

- `User.tourCompletedAt` is `NULL`. The dashboard layout mounts the tour while
  that holds and nothing else; it is not shown on the public site, the setup
  wizard or the platform admin area.
- Invited photographers therefore see it right after the setup wizard's
  Finish, which is also the first time they reach the dashboard. A freshly
  seeded platform admin sees it on their first sign-in.
- Accounts that existed before the tour shipped were marked done by its
  migration, except invited accounts still inside the setup wizard, who have
  never seen the dashboard.
- Finishing or skipping calls `completeOnboardingTour`, which stamps the
  account, so the tour does not come back on another device or browser. The
  Overview page offers "Show the getting-started tutorial again", which clears
  the stamp and restarts at step one.

## The path

| Step | Page | Highlighted control | Advances by |
| --- | --- | --- | --- |
| 1 | Overview | Events card | Next follows the link, or click the card |
| 2 | Events | New event | Next follows the link, or click the button |
| 3 | New event | Title fields | Next |
| 4 | New event | Day picker | Next |
| 5 | New event | Create | Pressing Create (the tour never submits a form) |
| 6 | Booking page | Gallery tab | Next follows the link, or click the tab |
| 7 | Gallery | Add photos | Next follows the link, or click the button |
| 8 | Add photos | File picker | Next |
| 9 | Add photos | Forward button | Finish tutorial |

The last step explains the rest of the wizard (size, credits, review and
publish) and that the gallery's Published box makes it public.

## How it works

- Steps are declared once in `src/lib/onboardingTour.ts`: a route pattern
  (locale prefix already removed), a `data-tour` selector and how the step
  advances. Same-page steps share the same pattern object, which is also what
  enables Back within a page.
- Pages mark their controls with `data-tour` attributes: `events-card`,
  `new-event`, `event-title`, `event-dates`, `event-create` (only when
  creating, not editing), `tab-<id>` on workspace tabs, `add-photos`,
  `upload-picker` and `wizard-forward`.
- `src/components/dashboard/OnboardingTour.tsx` lives in the dashboard layout,
  so it survives client navigations, and mirrors the step index to
  `sessionStorage` because the photo wizard ends with a document reload. On
  every route change `resolveTourStep` picks the current step if its page is
  open, otherwise the first step of the new page ahead, otherwise the last
  step of a page behind, otherwise nothing: a page off the path hides the tour
  without losing its place, and a user who clicks the highlighted control
  themselves advances exactly as if they had pressed Next.
- Nothing is modal. The darkening is a box-shadow on a pointer-transparent
  frame around the control, so the control stays clickable and so does the
  rest of the page. The popover is a non-modal dialog that takes focus when a
  step appears unless the user is typing, sits below or above the control on
  wide screens and at the top or bottom edge on narrow ones, and closes with
  Escape while focused. Motion honours `prefers-reduced-motion`.
- The anchor is awaited with a `MutationObserver` while a page streams in and
  tracked through scrolling, resizing and layout shifts.

## Checks

```powershell
npm run test:onboarding-tour
npx tsc --noEmit
```

The resolver test runs in CI. The Playwright walkthrough, "first-login
tutorial walks from the overview to the photo upload" in
`e2e/ui-workflows.spec.ts`, replays the tour on the seeded admin, creates an
event through it, reaches the upload wizard, confirms leaving and returning
resumes it, finishes, and checks a fresh document no longer shows it. The
e2e bootstrap in `e2e/global-setup.ts` skips the tour once for the seeded
admin so the saved session starts without a coach mark over the page.
