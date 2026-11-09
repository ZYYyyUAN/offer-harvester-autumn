import { apiError, requireApiUser } from "@/lib/server-data";
import { featureGet } from "@/lib/jd-feature";
export async function GET(request: Request) {
  try { const { userId } = await requireApiUser(); return Response.json(await featureGet(userId, [], Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
