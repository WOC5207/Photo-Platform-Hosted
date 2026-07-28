import { parsePageSize } from "@/lib/miniapp/cursor";
import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { listAlbumPhotos } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params
  }: { params: Promise<{ username: string; slug: string }> }
) {
  return miniappRoute(request, async () => {
    const { username, slug } = await params;
    const search = new URL(request.url).searchParams;
    const result = await listAlbumPhotos(username, slug, {
      requestUrl: request.url,
      cursor: search.get("cursor"),
      limit: parsePageSize(search.get("limit"), 48)
    });
    return apiSuccess(
      request,
      { album: result.album, items: result.items },
      { meta: { nextCursor: result.nextCursor } }
    );
  });
}
