import { bootstrapWorkspace } from "@/lib/feishu-api";
import { getFeishuConnection, publicConnection, updateWorkspaceConfig } from "@/lib/feishu";
import { requiredCapabilitiesReady } from "@/lib/feishu-diagnostics";
import { ApiError, apiError, requireApiUser, safeJson } from "@/lib/server-data";
import type { FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

export async function POST() {
  try {
    const { userId } = await requireApiUser(); const connection = await getFeishuConnection(userId);
    if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const grantedScopes = safeJson<string[]>(String(connection.scopes ?? "[]"), []);
    if (!requiredCapabilitiesReady(grantedScopes)) throw new ApiError(409, "飞书必需权限尚未全部授权，请先在开放平台开通后重新授权");
    const current = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); const config = await bootstrapWorkspace(userId, current, (partial) => updateWorkspaceConfig(userId, String(connection.id), partial));
    config.minutesAvailable = grantedScopes.some((item) => item.toLowerCase().includes("minutes"));
    await updateWorkspaceConfig(userId, String(connection.id), config);
    return Response.json({ connection: { ...publicConnection(connection), config } });
  } catch (error) { return apiError(error); }
}
