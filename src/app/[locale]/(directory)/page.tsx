import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import { getSiteSettings } from "@/lib/settings";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import DirectorySearch from "@/components/DirectorySearch";
import { publicPhotoWhere } from "@/lib/photoVisibility";

// Lists live accounts — never prerender.
export const dynamic = "force-dynamic";

/**
 * The root of the platform: every photographer hosted here.
 *
 * This is what pinhaoshe.ca serves now; the admin's own site is just another
 * /u/<username> with no special case. Suspended accounts are excluded, which
 * is the same rule resolveOwner applies to their site directly.
 */
export default async function DirectoryPage() {
  const t = await getTranslations("directory");
  const tc = await getTranslations("common");

  const owners = await prisma.user.findMany({
    where: {
      status: "active",
      // Only accounts with something to show. A photographer who has not
      // published yet gets a working site at their URL but no directory card,
      // rather than a card leading to an empty page.
      events: {
        some: {
          published: true,
          photos: { some: publicPhotoWhere }
        }
      }
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      events: {
        where: { published: true },
        orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          coverPhoto: {
            where: publicPhotoWhere,
            select: { id: true }
          },
          _count: {
            select: { photos: { where: publicPhotoWhere } }
          },
          photos: {
            where: publicPhotoWhere,
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { id: true }
          }
        }
      }
    }
  });

  const cards = await Promise.all(
    owners.map(async (o) => {
      const settings = await getSiteSettings(o.id);
      // First published album with a picture, for the card thumbnail.
      const withPhoto = o.events.find(
        (e) => e.coverPhoto?.id ?? e.photos[0]?.id
      );
      const photoId = withPhoto
        ? (withPhoto.coverPhoto?.id ?? withPhoto.photos[0]?.id)
        : null;
      return {
        username: o.username,
        name: ownerName(o),
        logoUrl: siteImageUrl(settings.logo),
        thumbUrl:
          withPhoto && photoId ? photoUrls(withPhoto.id, photoId).med : "",
        albumCount: o.events.length,
        photoCount: o.events.reduce((n, e) => n + e._count.photos, 0)
      };
    })
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-10 px-4 py-7 sm:px-7 sm:py-10 lg:py-14">
      <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-3xl gap-4">
          <span aria-hidden="true" className="font-meta mt-2 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent">
            01
          </span>
          <div>
          <h1 className="font-display ui-balance text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
            {t("title")}
          </h1>
          <p className="ui-pretty mt-2 text-sm leading-6 text-fg-subtle">
            {t("subtitle")}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
          <LanguageSwitcher />
          <ThemeToggle label={tc("toggleTheme")} />
          {/* The only way in for a photographer arriving at the root: every
              other entrance to /login sits behind a page they cannot reach yet.
              Shown to everyone rather than hidden once signed in — the login
              page already redirects an existing session to its dashboard, so
              the button lands somewhere sensible either way. */}
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center rounded-lg border border-border-strong bg-raised px-3 text-sm font-semibold text-fg-muted transition hover:border-accent/30 hover:text-fg"
          >
            {t("login")}
          </Link>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface py-20 text-center">
          <p className="text-fg-subtle">{t("empty")}</p>
          <p className="text-xs text-fg-subtle">{t("emptyHint")}</p>
        </div>
      ) : (
        <DirectorySearch owners={cards} />
      )}
    </main>
  );
}
