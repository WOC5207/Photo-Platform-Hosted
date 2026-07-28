import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { getBookingEvent } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return miniappRoute(request, async () => {
    const { token } = await params;
    return apiSuccess(request, await getBookingEvent(token));
  });
}
