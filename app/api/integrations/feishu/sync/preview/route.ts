import { listBitableRecords } from "@/lib/feishu-api";
import { getFeishuConnection, stableHash } from "@/lib/feishu";
import { buildSyncPreview } from "@/lib/feishu-sync";
import { ApiError, apiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";
import type { FeishuWorkspaceConfig, LocalApplication, SyncMapping } from "@/lib/feishu-contracts";

export async function POST() {
  try {
    const { userId } = await requireApiUser(); const db = getDatabase(); const connection = await getFeishuConnection(userId);
    if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {});
    const [localRows, remoteRecords, mappingRows] = await Promise.all([
      db.prepare("SELECT id, data, version, updated_at FROM records WHERE owner_id = ? AND kind = 'applications' AND deleted_at IS NULL ORDER BY updated_at DESC").bind(userId).all<Record<string, unknown>>(),
      listBitableRecords(userId, config),
      db.prepare("SELECT id, local_id, remote_id, local_hash, remote_hash FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND object_type = 'application' AND deleted_at IS NULL").bind(userId, connection.id).all<Record<string, unknown>>(),
    ]);
    const locals: LocalApplication[] = localRows.results.map((row) => ({ id: String(row.id), version: Number(row.version), updatedAt: String(row.updated_at), data: safeJson(String(row.data), {}) }));
    const mappings: SyncMapping[] = mappingRows.results.map((row) => ({ id: String(row.id), localId: row.local_id ? String(row.local_id) : null, remoteId: row.remote_id ? String(row.remote_id) : null, localHash: row.local_hash ? String(row.local_hash) : null, remoteHash: row.remote_hash ? String(row.remote_hash) : null }));
    const items = await buildSyncPreview(locals, remoteRecords, mappings); const id = crypto.randomUUID(); const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const preview = { generatedAt: new Date().toISOString(), localCount: locals.length, remoteCount: remoteRecords.length, integrationVersion: Number(connection.version), configHash: await stableHash(config), items };
    await db.prepare("INSERT INTO integration_runs (id, owner_id, integration_id, run_type, status, preview, expires_at) VALUES (?, ?, ?, 'application_sync', 'preview', ?, ?)").bind(id, userId, connection.id, JSON.stringify(preview), expiresAt).run();
    return Response.json({ run: { id, status: "preview", version: 1, expiresAt, preview } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
