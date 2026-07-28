import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { createWeChatSession } from "@/lib/miniapp/auth";
import {
  apiSuccess,
  MiniAppApiError,
  miniappRoute,
  parseJson
} from "@/lib/miniapp/http";
import { wechatAuthSchema } from "@/lib/miniapp/schemas";

export const dynamic = "force-dynamic";
const AUTH_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  return miniappRoute(request, async () => {
    const ip = clientIp(request.headers);
    if (
      !rateLimit(`miniapp:auth:ip:${ip}`, {
        limit: 60,
        windowMs: AUTH_WINDOW_MS
      })
    ) {
      throw new MiniAppApiError(429, "RATE_LIMITED");
    }
    const { code } = await parseJson(request, wechatAuthSchema);
    const session = await createWeChatSession(code);
    return apiSuccess(
      request,
      {
        token: session.token,
        expiresAt: session.expiresAt.toISOString()
      },
      { status: 201 }
    );
  });
}
