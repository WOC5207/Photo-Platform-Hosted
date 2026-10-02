import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { bookingImportSchema } from "@/lib/miniapp/schemas";
import { importMiniProgramBooking } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    const { cancelToken } = await parseJson(request, bookingImportSchema);
    const result = await importMiniProgramBooking(
      identity.identityId,
      cancelToken,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result);
  });
}
