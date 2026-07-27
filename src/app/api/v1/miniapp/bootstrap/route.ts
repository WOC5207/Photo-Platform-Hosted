import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { getBootstrap } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return miniappRoute(request, async () =>
    apiSuccess(request, getBootstrap())
  );
}
