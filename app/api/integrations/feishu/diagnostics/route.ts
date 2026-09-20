import { buildFeishuCapabilities, requiredCapabilitiesReady } from "@/lib/feishu-diagnostics";
import { getFeishuConnection, publicConnection, sha256 } from "@/lib/feishu";
import { apiError, requireApiUser } from "@/lib/server-data";
import type { FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

export async function GET() {
  try {
    const { userId } = await requireApiUser(); const row = await getFeishuConnection(userId); const connection = publicConnection(row);
    const scopes = connection?.scopes ?? []; const config = connection?.config as FeishuWorkspaceConfig | undefined;
    const tenantFingerprint = row?.external_tenant_key ? (await sha256(String(row.external_tenant_key))).slice(0, 12) : null;
    return Response.json({ connection, account: connection?.externalUserName ?? null, tenantFingerprint, tokenExpiresAt: row?.token_expires_at ?? null, scopes, capabilities: buildFeishuCapabilities(scopes), requiredReady: requiredCapabilitiesReady(scopes), bootstrapped: Boolean(config?.rootFolderToken && config?.bitableAppToken && config?.tableId), configSummary: config ? { root: Boolean(config.rootFolderToken), folders: [config.resumeFolderToken, config.reportFolderToken, config.interviewFolderToken].filter(Boolean).length, bitable: Boolean(config.bitableAppToken && config.tableId) } : null });
  } catch (error) { return apiError(error); }
}
