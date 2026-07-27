import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { bookingCreateSchema } from "@/lib/miniapp/schemas";
import { createMiniProgramBooking } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return miniappRoute(request, async () => {
    const [{ token }, identity, input] = await Promise.all([
      params,
      requireMiniAppIdentity(request),
      parseJson(request, bookingCreateSchema)
    ]);
    const result = await createMiniProgramBooking(
      identity.identityId,
      token,
      input,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result, 201);
  });
}
