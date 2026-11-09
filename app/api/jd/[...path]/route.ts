import { apiError, requireApiUser } from "@/lib/server-data";
import { featureGet, featureWrite } from "@/lib/jd-feature";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try { const { userId } = await requireApiUser(); return Response.json(await featureGet(userId, (await context.params).path, Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) {
  try { const { userId } = await requireApiUser(); return Response.json(await featureWrite(userId, (await context.params).path, await request.json())); }
  catch (error) { return apiError(error); }
}
export const PATCH = POST;
