import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import LoginScreen from "@/components/album3d/LoginScreen";

// Reads the session cookie.
export const dynamic = "force-dynamic";

export default async function ThreeDLoginPage() {
  const user = await getCurrentUser();
  // The archive lists a photographer once they have a published album with
  // public photos (see lib/archive3d); until then there is nothing to open.
  const listed = user
    ? (await prisma.event.count({ where: { ownerId: user.id, published: true, photos: { some: publicPhotoWhere } } })) > 0
    : false;
  return (
    <LoginScreen
      account={user ? { username: user.username, name: user.displayName || user.username, admin: user.role === "admin", listed } : null}
    />
  );
}
