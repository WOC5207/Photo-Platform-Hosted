import AlbumPhotosFeed from "@/components/album3d/AlbumPhotosFeed";
import { loadAlbumPhotos } from "@/lib/archive3d";

/**
 * The light table and photo screens of one album. Loaded once here, so moving
 * between photos only changes the address.
 */
export default async function AlbumPhotosLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const photos = await loadAlbumPhotos(username, slug);
  return (
    <>
      <AlbumPhotosFeed photos={photos} />
      {children}
    </>
  );
}
