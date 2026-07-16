import { Link } from "@/i18n/navigation";
import PhotoCreditOverlay from "@/components/PhotoCreditOverlay";

export interface StreamPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface StreamEvent {
  slug: string;
  title: string;
  date: string | null;
  location: string;
  photos: StreamPhoto[];
}

/**
 * The homepage's scroll-down photo stream: every published album with
 * photos, each as its own labeled section (title/date/location) followed by
 * a justified "poster" mosaic of that album's photos — the same photos you'd
 * see on the album page, just all inline so visitors can browse without
 * clicking in. See the layout note on the <ul> below for how the mosaic works.
 */
export default function EventPhotoStream({
  events
}: {
  events: StreamEvent[];
}) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-10">
      {events.map((event) => (
        <section key={event.slug} className="flex flex-col gap-3">
          <Link
            href={`/gallery/${event.slug}`}
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
            proportional to the photo's aspect ratio, so every row grows to fill
            the full width edge-to-edge and all photos in a row share one height
            — a height that varies from row to row, giving the varied, packed
            poster look. The item box ends up at the photo's own aspect ratio,
            so object-cover has (essentially) nothing to crop. --row-h sets the
            rough per-row height (responsive).
          */}
          <ul className="flex flex-wrap gap-1 [--row-h:140px] sm:[--row-h:190px] lg:[--row-h:230px]">
            {event.photos.map((photo) => {
              const ar = photo.height ? photo.width / photo.height : 1;
              return (
                <li
                  key={photo.id}
                  className="overflow-hidden rounded-md"
                  style={{
                    flexGrow: ar,
                    flexBasis: `calc(${ar} * var(--row-h))`
                  }}
                >
                  <Link
                    href={`/gallery/${event.slug}`}
                    className="group relative block h-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt}
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
