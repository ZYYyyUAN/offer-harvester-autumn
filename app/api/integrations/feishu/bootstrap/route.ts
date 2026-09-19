import { bootstrapWorkspace } from "@/lib/feishu-api";
import { getFeishuConnection, publicConnection, updateWorkspaceConfig } from "@/lib/feishu";
import { ApiError, apiError, requireApiUser, safeJson } from "@/lib/server-data";
import type { FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

export async function POST() {
  try {
    const { userId } = await requireApiUser(); const connection = await getFeishuConnection(userId);
    if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const current = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); const config = await bootstrapWorkspace(userId, current);
    const scopes = safeJson<string[]>(String(connection.scopes ?? "[]"), []); config.minutesAvailable = scopes.some((item) => item.toLowerCase().includes("minutes"));
    await updateWorkspaceConfig(userId, String(connection.id), config);
    return Response.json({ connection: { ...publicConnection(connection), config } });
  } catch (error) { return apiError(error); }
}
