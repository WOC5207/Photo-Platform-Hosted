import { parsePageSize } from "@/lib/miniapp/cursor";
import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import {
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { listMiniProgramBookings } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    const search = new URL(request.url).searchParams;
    const result = await listMiniProgramBookings(identity.identityId, {
      cursor: search.get("cursor"),
      limit: parsePageSize(search.get("limit"))
    });
    if (!result.ok) return serviceResponse(request, result);
    return apiSuccess(
      request,
      { items: result.data.items },
      {
        meta: { nextCursor: result.data.nextCursor }
      }
    );
  });
}
