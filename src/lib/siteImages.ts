import "server-only";
import { prisma } from "./db";
import { deleteSiteImageFile } from "./images";
import { deleteSiteImageRowAndRelease } from "./quota";

/**
 * Retire a site image: remove the file, drop its row, and stop counting its
 * bytes against the owner's quota.
 *
 * One helper because those three always belong together, and every place that
 * gets rid of a site image (replacing a logo, clearing a background, deleting
 * an announcement) would otherwise have to remember all three. Forgetting the
 * release is the worst of them: the user's quota shrinks with nothing on disk
 * to show for it, and only reconcile can explain why.
 *
 * Scoped by owner: the token alone would let one account's request delete
 * another's file.
 *
 * Best-effort by design — callers are mid-flow and a missing file should not
 * fail the operation. Anything that slips through is corrected by reconcile.
 */
export async function discardSiteImage(
  ownerId: string,
  token: string
): Promise<void> {
  if (!token) return;

  const row = await prisma.siteImage.findFirst({
    where: { token, ownerId },
    select: { id: true, bytes: true }
  });

  await deleteSiteImageFile(ownerId, token).catch(() => {});

  // No row: an image from before site images were tracked, or already
  // discarded. The file removal above still applies; there is nothing to
  // release.
  if (!row) return;

  await deleteSiteImageRowAndRelease(ownerId, token);
}
