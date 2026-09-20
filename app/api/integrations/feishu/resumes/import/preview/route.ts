import { getFeishuConnection } from "@/lib/feishu";
import { resumeImportSchema } from "@/lib/feishu-contracts";
import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const body = resumeImportSchema.parse(await request.json()); const db = getDatabase(); const connection = await getFeishuConnection(userId);
    if (!connection || String(connection.status) !== "connected") throw new ApiError(409, "请先连接飞书");
    const extension = (body.type || body.name.split(".").pop() || "").toLowerCase(); if (!["pdf","docx","doc"].includes(extension)) throw new ApiError(415, "仅支持 PDF、DOCX 和 DOC 简历");
    if ((body.size ?? 0) > 20 * 1024 * 1024) throw new ApiError(413, "简历文件超过 20 MB");
    const duplicate = await db.prepare("SELECT local_id FROM integration_mappings WHERE owner_id = ? AND integration_id = ? AND object_type = 'resume' AND remote_id = ? AND deleted_at IS NULL").bind(userId, connection.id, body.remoteFileToken).first<Record<string, unknown>>();
    const id = crypto.randomUUID(); const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString(); const preview = { file: body, extension, duplicateLocalId: duplicate?.local_id ?? null, verdict: duplicate ? "duplicate" : "ready" };
    await db.prepare("INSERT INTO integration_runs (id, owner_id, integration_id, run_type, status, preview, expires_at) VALUES (?, ?, ?, 'resume_import', 'preview', ?, ?)").bind(id, userId, connection.id, JSON.stringify(preview), expiresAt).run();
    return Response.json({ run: { id, version: 1, status: "preview", preview, expiresAt } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
