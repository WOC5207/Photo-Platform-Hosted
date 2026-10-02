import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { lotteryEntrySchema } from "@/lib/miniapp/schemas";
import { createMiniProgramLotteryEntry } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    const [{ token }, input] = await Promise.all([
      params,
      parseJson(request, lotteryEntrySchema)
    ]);
    const result = await createMiniProgramLotteryEntry(
      identity.identityId,
      token,
      input,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result, 201);
  });
}
