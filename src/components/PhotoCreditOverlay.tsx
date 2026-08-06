/**
 * Hover-revealed photo credit (credited person + subject), shown over a
 * gradient/blur scrim at the bottom of the photo. Desktop only — the parent
 * tile must set "group" for the hover trigger and "relative overflow-hidden"
 * to anchor and clip this. Renders nothing if there's no credit to show.
 */
export default function PhotoCreditOverlay({ credit }: { credit: string }) {
  if (!credit) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-black/65 px-3 py-2 opacity-100 backdrop-blur-sm transition-opacity duration-150 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
      <p className="truncate text-sm font-medium text-white">{credit}</p>
    </div>
  );
}
