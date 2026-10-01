/** A labelled slider showing its value, used across the sharing poster editor. */
export default function PosterRangeField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-sm font-semibold text-fg-muted"><span className="flex justify-between gap-3"><span>{label}</span><span className="font-meta text-xs text-fg-subtle">{value}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-h-11 accent-accent" /></label>;
}
