import type { ReactNode } from "react";

export default function FormActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-raised/95 p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
      {children}
    </div>
  );
}
