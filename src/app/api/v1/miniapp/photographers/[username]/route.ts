import { apiSuccess, miniappRoute } from "@/lib/miniapp/http";
import { getPhotographerProfile } from "@/lib/miniapp/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  return miniappRoute(request, async () => {
    const { username } = await params;
    return apiSuccess(
      request,
      await getPhotographerProfile(username, request.url)
    );
  });
}
