import { downloadDriveFile, exportDocumentFile } from "@/lib/feishu-api";
import { getFeishuConnection } from "@/lib/feishu";
import { resumeImportSchema } from "@/lib/feishu-contracts";
import { ApiError, apiError, getBindings, requireApiUser } from "@/lib/server-data";

const types: Record<string, { mime: string; extension: string }> = {
  pdf: { mime: "application/pdf", extension: "pdf" }, docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" }, doc: { mime: "application/msword", extension: "doc" },
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const body = resumeImportSchema.parse(await request.json()); const connection = await getFeishuConnection(userId); if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const kind = types[body.type.toLowerCase()] ?? types[body.name.split(".").pop()?.toLowerCase() || ""]; if (!kind) throw new ApiError(415, "仅支持从飞书导入 PDF、DOCX 和 DOC 简历");
    const { db, bucket } = getBindings(); const mapped = await db.prepare("SELECT local_id FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND object_type = 'resume' AND remote_id = ? AND deleted_at IS NULL").bind(userId, connection.id, body.remoteFileToken).first<Record<string, unknown>>(); if (mapped?.local_id) throw new ApiError(409, "该飞书文件已经导入过");
    let bytes: ArrayBuffer; try { bytes = await downloadDriveFile(userId, body.remoteFileToken); } catch (error) { if (body.type.toLowerCase() !== "docx") throw error; bytes = await exportDocumentFile(userId, body.remoteFileToken, "docx", "docx"); } if (bytes.byteLength > 20 * 1024 * 1024) throw new ApiError(413, "简历文件超过 20 MB"); const id = crypto.randomUUID(); const objectKey = `${userId}/resume/${id}`; await bucket.put(objectKey, bytes, { httpMetadata: { contentType: kind.mime } });
    await db.batch([db.prepare("INSERT INTO stored_files (id, owner_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, 'resume', ?, ?, ?, ?, ?)").bind(id, userId, body.name, objectKey, kind.mime, bytes.byteLength, JSON.stringify({ displayName: body.name.replace(/\.[^.]+$/, ""), source: "feishu", sourceToken: body.remoteFileToken })), db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'resume', ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, connection.id, id, body.remoteFileToken, JSON.stringify({ filename: body.name }))]);
    return Response.json({ file: { id, filename: body.name, mimeType: kind.mime, size: bytes.byteLength } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
