"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import CosplanBoard from "./CosplanBoard";

// Only phones load the flat board, so the easel board's first load stays as it was.
const CosplanPhoneBoard = lazy(() => import("./CosplanPhoneBoard"));

/** Phones held upright get the flat, full-screen board; everything else keeps the easel. */
const PHONE = "(max-width: 719px) and (max-aspect-ratio: 105/100)";

function subscribe(change: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

export default function CosplanBoardScreen() {
  // Unknown while rendering on the server, so neither board mounts until the browser says which.
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null);
  if (phone === null) return null;
  if (!phone) return <CosplanBoard />;
  return (
    <Suspense fallback={null}>
      <CosplanPhoneBoard />
    </Suspense>
  );
}
