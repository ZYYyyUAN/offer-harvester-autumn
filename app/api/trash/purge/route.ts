import { apiError, requireApiUser } from "@/lib/server-data";
import { purgeExpiredTrash } from "@/lib/trash";

export async function POST() {
  try { const { userId } = await requireApiUser(); const result = await purgeExpiredTrash(userId); return Response.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 207 : 200 }); }
  catch (error) { return apiError(error); }
}
