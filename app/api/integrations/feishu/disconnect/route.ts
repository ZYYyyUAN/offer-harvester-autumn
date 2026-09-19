import { apiError, requireApiUser } from "@/lib/server-data";
import { disconnectFeishu } from "@/lib/feishu";

export async function POST() { try { const { userId } = await requireApiUser(); await disconnectFeishu(userId); return Response.json({ ok: true }); } catch (error) { return apiError(error); } }
