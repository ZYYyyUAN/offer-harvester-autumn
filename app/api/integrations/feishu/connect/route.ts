import { authorizationUrl, createOAuthState } from "@/lib/feishu";
import { apiError, requireApiUser } from "@/lib/server-data";

export async function GET() {
  try { const { userId } = await requireApiUser(); return Response.redirect(authorizationUrl(await createOAuthState(userId)), 302); }
  catch (error) { return apiError(error); }
}
