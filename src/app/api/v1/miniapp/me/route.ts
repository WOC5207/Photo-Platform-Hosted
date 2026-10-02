import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { deleteMeSchema } from "@/lib/miniapp/schemas";
import { deleteMiniProgramIdentity } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    await parseJson(request, deleteMeSchema);
    const result = await deleteMiniProgramIdentity(
      identity.identityId,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result);
  });
}
