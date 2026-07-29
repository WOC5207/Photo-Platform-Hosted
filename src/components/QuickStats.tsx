export interface QuickStatsData {
  photoCount: number;
  albumCount: number;
  creditCount: number;
}

/** Small always-fresh "by the numbers" card for the homepage sidebar. */
export default function QuickStats({
  stats,
  title,
  photosLabel,
  albumsLabel,
  creditsLabel
}: {
  stats: QuickStatsData;
  title: string;
  photosLabel: string;
  albumsLabel: string;
  creditsLabel: string;
}) {
  const items = [
    { value: stats.photoCount, label: photosLabel },
    { value: stats.albumCount, label: albumsLabel },
    { value: stats.creditCount, label: creditsLabel }
  ];

  return (
    <div className="rounded-xl border border-border bg-surface/92 p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
        {title}
      </h3>
      <div className="mt-4 grid grid-cols-3 divide-x divide-border text-center">
        {items.map((item) => (
          <div key={item.label} className="px-2">
            <p className="font-display text-3xl font-semibold tracking-[-0.035em]">
              {item.value}
            </p>
            <p className="mt-1 text-[0.6875rem] text-fg-subtle">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
