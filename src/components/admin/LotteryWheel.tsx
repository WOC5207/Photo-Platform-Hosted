"use client";

import { useEffect, useRef, useState } from "react";

export interface WheelSlice {
  id: string;
  label: string;
  weight: number;
}

const SLICE_COLORS = [
  "#f97316",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899"
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Cumulative [start, end) angle range for each slice, sized by weight. */
function sliceRanges(slices: WheelSlice[]): { start: number; end: number }[] {
  const totalWeight = slices.reduce((sum, s) => sum + Math.max(s.weight, 0), 0) || 1;
  let acc = 0;
  return slices.map((s) => {
    const start = (acc / totalWeight) * 360;
    acc += Math.max(s.weight, 0);
    const end = (acc / totalWeight) * 360;
    return { start, end };
  });
}

export default function LotteryWheel({
  slices,
  accessibleLabel,
  spinning,
  targetIndex,
  onSpinComplete
}: {
  slices: WheelSlice[];
  accessibleLabel: string;
  spinning: boolean;
  targetIndex: number | null;
  onSpinComplete: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const completedRef = useRef(false);
  const onSpinCompleteRef = useRef(onSpinComplete);

  const n = slices.length;
  const ranges = sliceRanges(slices);

  useEffect(() => {
    onSpinCompleteRef.current = onSpinComplete;
  }, [onSpinComplete]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!spinning || targetIndex === null || n === 0) return;
    completedRef.current = false;
    const range = ranges[targetIndex];
    if (!range) return;
    const sliceWidth = range.end - range.start;
    const sliceCenter = range.start + sliceWidth / 2;
    const jitter = (Math.random() - 0.5) * sliceWidth * 0.6;
    const extraSpins = reduceMotion ? 0 : 5 + Math.floor(Math.random() * 3);
    setRotation((prev) => {
      const prevMod = ((prev % 360) + 360) % 360;
      const targetMod = (((360 - sliceCenter - jitter) % 360) + 360) % 360;
      let delta = targetMod - prevMod;
      if (delta < 0) delta += 360;
      return prev + delta + extraSpins * 360;
    });
    const timeout = window.setTimeout(
      () => {
        if (completedRef.current) return;
        completedRef.current = true;
        onSpinCompleteRef.current();
      },
      reduceMotion ? 80 : 4600
    );
    return () => window.clearTimeout(timeout);
    // Intentionally only re-triggers on a fresh spin (spinning flipping to
    // true with a target index), not on every slice-count change.
  }, [spinning, targetIndex, reduceMotion]);

  function finishSpin() {
    if (!spinning || completedRef.current) return;
    completedRef.current = true;
    onSpinCompleteRef.current();
  }

  return (
    <div className="relative mx-auto w-full max-w-xs">
      {slices.length > 0 && (
        <div className="sr-only">
          <p>{accessibleLabel}</p>
          <ul>
            {slices.map((slice) => (
              <li key={slice.id}>{slice.label}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
        <div className="h-0 w-0 border-x-[10px] border-t-[18px] border-x-transparent border-t-red-500 drop-shadow" />
      </div>
      <div className="aspect-square overflow-hidden rounded-full border-4 border-border-strong shadow-lg">
        <div
          onTransitionEnd={finishSpin}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? reduceMotion
                ? "transform 1ms linear"
                : "transform 4.2s cubic-bezier(0.13,0.66,0.15,1)"
              : "none"
          }}
          className="h-full w-full"
        >
          {n === 0 ? (
            <div className="flex h-full w-full items-center justify-center bg-surface text-xs text-fg-faint">
              —
            </div>
          ) : (
            <svg
              viewBox="0 0 200 200"
              aria-hidden="true"
              focusable="false"
              className="h-full w-full"
            >
              {n === 1 ? (
                <>
                  <circle cx={100} cy={100} r={100} fill={SLICE_COLORS[0]} />
                  <text
                    x={100}
                    y={30}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="#fff"
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth="2.5"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {slices[0].label}
                  </text>
                </>
              ) : (
                slices.map((s, i) => {
                  const { start, end } = ranges[i];
                  const p1 = polar(100, 100, 100, start);
                  const p2 = polar(100, 100, 100, end);
                  const largeArc = end - start > 180 ? 1 : 0;
                  const mid = start + (end - start) / 2;
                  const label = polar(100, 100, 66, mid);
                  return (
                    <g key={s.id}>
                      <path
                        d={`M100,100 L${p1.x},${p1.y} A100,100 0 ${largeArc} 1 ${p2.x},${p2.y} Z`}
                        fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                        stroke="rgba(0,0,0,0.15)"
                      />
                      <text
                        x={label.x}
                        y={label.y}
                        transform={`rotate(${mid}, ${label.x}, ${label.y})`}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={n > 16 ? "6" : "9"}
                        fontWeight="700"
                        fill="#fff"
                        stroke="rgba(0,0,0,0.85)"
                        strokeWidth="2.5"
                        paintOrder="stroke"
                        strokeLinejoin="round"
                      >
                        {s.label}
                      </text>
                    </g>
                  );
                })
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
