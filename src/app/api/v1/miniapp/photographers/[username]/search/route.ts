import {
  apiSuccess,
  MiniAppApiError,
  miniappRoute
} from "@/lib/miniapp/http";
import { searchPhotographerPhotos } from "@/lib/miniapp/queries";
import { photographerSearchQuerySchema } from "@/lib/miniapp/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  return miniappRoute(request, async () => {
    const { username } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = photographerSearchQuerySchema.safeParse({
      q: search.get("q") ?? "",
      cursor: search.get("cursor") ?? undefined,
      limit: search.get("limit") ?? undefined
    });
    if (!parsed.success) {
      throw new MiniAppApiError(422, "VALIDATION_ERROR");
    }
    const result = await searchPhotographerPhotos(
      username,
      parsed.data.q,
      {
        requestUrl: request.url,
        cursor: parsed.data.cursor,
        limit: parsed.data.limit
      }
    );
    return apiSuccess(
      request,
      { items: result.items },
      { meta: { nextCursor: result.nextCursor } }
    );
  });
}
