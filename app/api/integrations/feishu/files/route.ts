import { listWorkspaceFiles } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { ApiError, apiError, requireApiUser, safeJson } from "@/lib/server-data";
import type { FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

export async function GET(request: Request) {
  try { const { userId } = await requireApiUser(); const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书"); const folder = new URL(request.url).searchParams.get("folder"); const selected = folder === "reports" || folder === "interviews" ? folder : "resumes"; const config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); const files = await listWorkspaceFiles(userId, config, selected); return Response.json({ files }); }
  catch (error) { return apiError(error); }
}
