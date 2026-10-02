import { miniappRoute, parseJson } from "@/lib/miniapp/http";
import {
  miniAppWriteClientIp,
  requireMiniAppIdentity,
  serviceResponse
} from "@/lib/miniapp/route-helpers";
import { contentReportSchema } from "@/lib/miniapp/schemas";
import { createMiniProgramContentReport } from "@/lib/miniapp/services";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return miniappRoute(request, async () => {
    const identity = await requireMiniAppIdentity(request);
    const [{ id }, input] = await Promise.all([
      params,
      parseJson(request, contentReportSchema)
    ]);
    const result = await createMiniProgramContentReport(
      identity.identityId,
      id,
      input,
      miniAppWriteClientIp(request)
    );
    return serviceResponse(request, result, 201);
  });
}
