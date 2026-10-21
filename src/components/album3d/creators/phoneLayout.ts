import { useSyncExternalStore } from "react";

/** Phones held upright get the creators' flat, full-screen layout; everything else keeps the easel. */
const PHONE = "(max-width: 719px) and (max-aspect-ratio: 105/100)";

function subscribe(change: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}

/** Whether this is a phone held upright; null while rendering on the server, so neither layout mounts until the browser says which. */
export function usePhoneLayout(): boolean | null {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => null);
}
