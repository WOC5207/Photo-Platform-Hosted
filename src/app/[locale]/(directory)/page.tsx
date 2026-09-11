import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import DirectorySearch from "@/components/DirectorySearch";
import EmptyState from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

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

  type DirectoryRow = {
    id: string;
    username: string;
    displayName: string;
    logo: string | null;
    albumCount: bigint;
    photoCount: bigint;
    thumbEventId: string | null;
    thumbPhotoId: string | null;
  };
  const owners = await prisma.$queryRaw<DirectoryRow[]>`
    SELECT
      u."id",
      u."username",
      u."displayName",
      s."logo",
      (SELECT COUNT(*) FROM "Event" e
        WHERE e."ownerId" = u."id" AND e."published" = true) AS "albumCount",
      (SELECT COUNT(*) FROM "Photo" p
        INNER JOIN "Event" e ON e."id" = p."eventId"
        WHERE e."ownerId" = u."id" AND e."published" = true
          AND p."pendingBatchId" IS NULL AND p."uploadState" = 'ready'
          AND p."moderationStatus" IN ('not_required', 'approved')) AS "photoCount",
      thumb."eventId" AS "thumbEventId",
      thumb."photoId" AS "thumbPhotoId"
    FROM "User" u
    LEFT JOIN "SiteSettings" s ON s."ownerId" = u."id"
    LEFT JOIN LATERAL (
      SELECT e."id" AS "eventId", p."id" AS "photoId"
      FROM "Event" e
      INNER JOIN LATERAL (
        SELECT candidate."id"
        FROM "Photo" candidate
        WHERE candidate."eventId" = e."id"
          AND candidate."pendingBatchId" IS NULL
          AND candidate."uploadState" = 'ready'
          AND candidate."moderationStatus" IN ('not_required', 'approved')
        ORDER BY (candidate."id" = e."coverPhotoId") DESC,
          candidate."sortOrder" ASC, candidate."createdAt" ASC
        LIMIT 1
      ) p ON true
      WHERE e."ownerId" = u."id" AND e."published" = true
      ORDER BY e."dateStart" DESC NULLS LAST, e."createdAt" DESC
      LIMIT 1
    ) thumb ON true
    WHERE u."status" = 'active' AND thumb."photoId" IS NOT NULL
    ORDER BY u."createdAt" ASC
  `;

  const cards = owners.map((owner) => ({
    username: owner.username,
    name: ownerName(owner),
    logoUrl: siteImageUrl(owner.logo ?? ""),
    thumbUrl:
      owner.thumbEventId && owner.thumbPhotoId
        ? photoUrls(owner.thumbEventId, owner.thumbPhotoId).med
        : "",
    albumCount: Number(owner.albumCount),
    photoCount: Number(owner.photoCount)
  }));

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-10 px-4 py-7 sm:px-7 sm:py-10 lg:py-14">
      <header className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
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
        <EmptyState title={t("empty")} description={t("emptyHint")}
          action={<Link href="/login" className={buttonClasses({ variant: "secondary" })}>{t("login")}</Link>}
        />
      ) : (
        <DirectorySearch owners={cards} />
      )}
    </main>
  );
}
