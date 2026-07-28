import { miniappRoute } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { cancelMiniProgramBooking } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return miniappRoute(request, async () => {
    const [{ id }, identity] = await Promise.all([
      params,
      requireMiniAppIdentity(request)
    ]);
    const result = await cancelMiniProgramBooking(
      identity.identityId,
      id,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result);
  });
}
