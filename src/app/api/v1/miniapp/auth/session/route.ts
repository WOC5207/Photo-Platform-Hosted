import { revokeMiniProgramSession } from "@/lib/miniapp/auth";
import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { requireMiniAppIdentity } from "@/lib/miniapp/route-helpers";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    await revokeMiniProgramSession(identity.sessionId);
    return apiSuccess(request, { revoked: true });
  });
}
