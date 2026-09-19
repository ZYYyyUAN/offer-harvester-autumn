import { uploadDriveFile } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";
import type { FeishuWorkspaceConfig } from "@/lib/feishu-contracts";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const localId = (await context.params).id; const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书"); const config = safeJson<FeishuWorkspaceConfig>(String(connection.config ?? "{}"), {}); if (!config.resumeFolderToken) throw new ApiError(409, "请先初始化飞书专用空间"); const { db, bucket } = getBindings();
    const file = await db.prepare("SELECT filename, object_key, mime_type, version FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(localId, userId).first<Record<string, unknown>>(); if (!file) throw new ApiError(404, "简历不存在"); const existing = await db.prepare("SELECT remote_id FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND object_type = 'resume' AND local_id = ? AND deleted_at IS NULL").bind(userId, connection.id, localId).first<Record<string, unknown>>(); if (existing?.remote_id) return Response.json({ ok: true, remoteFileToken: existing.remote_id, duplicate: true }); const object = await bucket.get(String(file.object_key)); if (!object) throw new ApiError(404, "简历原文件不存在");
    const remoteId = await uploadDriveFile(userId, config.resumeFolderToken, String(file.filename), String(file.mime_type), await object.arrayBuffer()); await db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, local_version, metadata, last_synced_at) VALUES (?, ?, ?, 'resume', ?, ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, localId, remoteId, Number(file.version), JSON.stringify({ filename: file.filename })).run(); return Response.json({ ok: true, remoteFileToken: remoteId, duplicate: false });
  } catch (error) { return apiError(error); }
}
