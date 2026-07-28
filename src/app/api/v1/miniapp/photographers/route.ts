import { parsePageSize } from "@/lib/miniapp/cursor";
import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { listPhotographers } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return miniappRoute(request, async () => {
    const search = new URL(request.url).searchParams;
    const result = await listPhotographers({
      requestUrl: request.url,
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
