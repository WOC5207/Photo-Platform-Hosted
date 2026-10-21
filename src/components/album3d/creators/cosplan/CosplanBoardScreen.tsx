"use client";

import { lazy, Suspense } from "react";
import { usePhoneLayout } from "../phoneLayout";
import CosplanBoard from "./CosplanBoard";

// Only phones load the flat board, so the easel board's first load stays as it was.
const CosplanPhoneBoard = lazy(() => import("./CosplanPhoneBoard"));

export default function CosplanBoardScreen() {
  const phone = usePhoneLayout();
  if (phone === null) return null;
  if (!phone) return <CosplanBoard />;
  return (
    <Suspense fallback={null}>
      <CosplanPhoneBoard />
    </Suspense>
  );
}
