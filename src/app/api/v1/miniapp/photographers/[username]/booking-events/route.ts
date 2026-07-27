import { parsePageSize } from "@/lib/miniapp/cursor";
import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { listPhotographerBookingEvents } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  return miniappRoute(request, async () => {
    const { username } = await params;
    const search = new URL(request.url).searchParams;
    const result = await listPhotographerBookingEvents(username, {
      cursor: search.get("cursor"),
      limit: parsePageSize(search.get("limit"))
    });
    return apiSuccess(
      request,
      { items: result.items },
      { meta: { nextCursor: result.nextCursor } }
    );
  });
}
