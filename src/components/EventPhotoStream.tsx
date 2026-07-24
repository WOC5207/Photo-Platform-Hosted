import { Link } from "@/i18n/navigation";
import PhotoCreditOverlay from "@/components/PhotoCreditOverlay";
import { homePhotoWeightScale } from "@/lib/homePhotoWeight";

export interface StreamPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  homeWeight: number;
}

export interface StreamEvent {
  slug: string;
  title: string;
  date: string | null;
  location: string;
  photos: StreamPhoto[];
}

/**
 * The homepage's bounded recent-work stream: recent published albums with
 * photos, each as its own labeled section (title/date/location) followed by
 * a justified "poster" mosaic of that album's photos — the same photos you'd
 * see on the album page, just all inline so visitors can browse without
 * clicking in. See the layout note on the <ul> below for how the mosaic works.
 */
export default function EventPhotoStream({
  basePath,
  events,
  openPhotoLabel
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  events: StreamEvent[];
  openPhotoLabel: string;
}) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-10">
      {events.map((event) => (
        <section key={event.slug} className="flex flex-col gap-3">
          <Link
            href={`${basePath}/gallery/${event.slug}`}
            className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <h3 className="text-xl font-semibold group-hover:underline">
              {event.title}
            </h3>
            <span className="text-sm text-fg-subtle">
              {[event.date, event.location || null].filter(Boolean).join(" · ")}
            </span>
          </Link>
          {/*
            Justified "poster" mosaic. Each item's flex-basis and flex-grow are
            proportional to its aspect ratio and the photographer's 1-5 homepage
            weight. Every row still grows edge-to-edge, while higher-weight
            photos receive more area and naturally drive a varied packed layout.
            --row-h sets the rough per-row height (responsive).
          */}
          <ul className="flex flex-wrap gap-1 [--row-h:140px] sm:[--row-h:190px] lg:[--row-h:230px]">
            {event.photos.map((photo, index) => {
              const ar = photo.height ? photo.width / photo.height : 1;
              const weightScale = homePhotoWeightScale(photo.homeWeight);
              const fallbackLabel = `${event.title} — ${openPhotoLabel} ${index + 1}`;
              const linkLabel = photo.alt
                ? `${openPhotoLabel}: ${photo.alt}`
                : fallbackLabel;
              return (
                <li
                  key={photo.id}
                  data-home-weight={photo.homeWeight}
                  className="overflow-hidden rounded-md"
                  style={{
                    flexGrow: ar * weightScale,
                    flexBasis: `calc(${ar * weightScale} * var(--row-h))`
                  }}
                >
                  <Link
                    href={`${basePath}/gallery/${event.slug}?photo=${encodeURIComponent(photo.id)}`}
                    aria-label={linkLabel}
                    className="group relative block h-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt || fallbackLabel}
                      loading="lazy"
                      width={photo.width}
                      height={photo.height}
                      className="block h-full w-full object-cover transition group-hover:opacity-90"
                    />
                    <PhotoCreditOverlay credit={photo.alt} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
