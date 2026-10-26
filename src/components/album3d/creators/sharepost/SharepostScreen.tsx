"use client";

import { lazy, Suspense, type ReactNode } from "react";
import type { SharepostStep } from "@/lib/siteMode";
import { usePhoneLayout } from "../phoneLayout";

// Only phones load the flat board, so the easel screens' first load stays as it was.
const SharepostPhoneBoard = lazy(() => import("./SharepostPhoneBoard"));

/**
 * One Sharepost step, public or a saved project's: phones held upright get
 * the flat board opened at this step's tool; everything else keeps the
 * step's easel screen, given as `children`.
 */
export default function SharepostScreen({ step, children }: { step: "photos" | SharepostStep; children: ReactNode }) {
  const phone = usePhoneLayout();
  if (phone === null) return null;
  if (!phone) return children;
  return (
    <Suspense fallback={null}>
      <SharepostPhoneBoard step={step} />
    </Suspense>
  );
}
