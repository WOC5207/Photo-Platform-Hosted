import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import { getSiteSettings } from "@/lib/settings";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import DirectorySearch from "@/components/DirectorySearch";

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
      events: { some: { published: true } }
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
          coverPhotoId: true,
          _count: { select: { photos: true } },
          photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } }
        }
      }
    }
  });

  const cards = await Promise.all(
    owners.map(async (o) => {
      const settings = await getSiteSettings(o.id);
      // First published album with a picture, for the card thumbnail.
      const withPhoto = o.events.find(
        (e) => e.coverPhotoId ?? e.photos[0]?.id
      );
      const photoId = withPhoto
        ? (withPhoto.coverPhotoId ?? withPhoto.photos[0]?.id)
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
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
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
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted transition hover:border-fg-faint hover:text-fg"
          >
            {t("login")}
          </Link>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-fg/10 bg-page/85 py-20 text-center">
          <p className="text-fg-subtle">{t("empty")}</p>
          <p className="text-xs text-fg-subtle">{t("emptyHint")}</p>
        </div>
      ) : (
        <DirectorySearch owners={cards} />
      )}
    </div>
  );
}
