import { readDocumentText } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { reportImportSchema } from "@/lib/feishu-contracts";
import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";

export async function POST(request: Request) {
  try { const { userId } = await requireApiUser(); const body = reportImportSchema.parse(await request.json()); const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书"); const db = getDatabase(); const target = await db.prepare("SELECT id FROM records WHERE id = ? AND owner_id = ? AND kind = ? AND deleted_at IS NULL").bind(body.entityId, userId, body.entityType).first(); if (!target) throw new ApiError(404, "关联记录不存在"); const content = await readDocumentText(userId, body.documentToken); const id = crypto.randomUUID(); const data = { title: body.title, content, readOnly: true, source: "feishu", sourceToken: body.documentToken, entityType: body.entityType, entityId: body.entityId, importedAt: new Date().toISOString(), excludedFromEvidence: true }; await db.batch([db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'feishu_documents', ?, ?)").bind(id, userId, body.title, JSON.stringify(data)), db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'document_snapshot', ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, id, body.documentToken, JSON.stringify({ entityType: body.entityType, entityId: body.entityId }))]); return Response.json({ snapshot: { id, ...data } }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
