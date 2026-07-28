import { miniappRoute } from "@/lib/miniapp/http";
import {
  optionalMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { readMiniProgramLottery } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return miniappRoute(request, async () => {
    const [{ token }, identity] = await Promise.all([
      params,
      optionalMiniAppIdentity(request)
    ]);
    const result = await readMiniProgramLottery(
      token,
      identity?.identityId
    );
    return serviceResponse(request, result);
  });
}
