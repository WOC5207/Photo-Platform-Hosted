import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { lotteryImportSchema } from "@/lib/miniapp/schemas";
import { importMiniProgramLotteryEntry } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return miniappRoute(request, async () => {
    const [identity, input] = await Promise.all([
      requireMiniAppIdentity(request),
      parseJson(request, lotteryImportSchema)
    ]);
    const result = await importMiniProgramLotteryEntry(
      identity.identityId,
      input,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result);
  });
}
