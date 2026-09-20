import { downloadDriveFile, exportDocumentFile } from "@/lib/feishu-api";
import { validateResumeMagic } from "@/lib/feishu-diagnostics";
import { resumeImportCommitSchema } from "@/lib/feishu-contracts";
import { ApiError, apiError, getBindings, requireApiUser, safeJson } from "@/lib/server-data";

const mime: Record<string,string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" };
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const body = resumeImportCommitSchema.parse(await request.json()); const { db, bucket } = getBindings();
    const run = await db.prepare("SELECT * FROM integration_runs WHERE id = ? AND owner_id = ? AND run_type = 'resume_import'").bind(body.runId, userId).first<Record<string, unknown>>();
    if (!run) throw new ApiError(404, "导入预览不存在"); if (String(run.status) !== "preview" || Number(run.version) !== body.version) throw new ApiError(409, "导入预览已变化，请重新生成"); if (Date.parse(String(run.expires_at)) <= Date.now()) throw new ApiError(410, "导入预览已过期");
    const preview = safeJson<any>(String(run.preview), {}); if (preview.duplicateLocalId) throw new ApiError(409, "该飞书文件已经导入过"); const file = preview.file; const extension = preview.extension;
    let bytes: ArrayBuffer; try { bytes = await downloadDriveFile(userId, file.remoteFileToken); } catch (error) { if (extension !== "docx") throw error; bytes = await exportDocumentFile(userId, file.remoteFileToken, "docx", "docx"); }
    if (bytes.byteLength > 20 * 1024 * 1024) throw new ApiError(413, "简历文件超过 20 MB"); if (!validateResumeMagic(new Uint8Array(bytes).slice(0, 16), extension)) throw new ApiError(415, "文件内容与扩展名不一致，已拒绝导入");
    const id = crypto.randomUUID(); const objectKey = `${userId}/resume/${id}`; await bucket.put(objectKey, bytes, { httpMetadata: { contentType: mime[extension] } });
    await db.batch([
      db.prepare("INSERT INTO stored_files (id, owner_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, 'resume', ?, ?, ?, ?, ?)").bind(id, userId, file.name, objectKey, mime[extension], bytes.byteLength, JSON.stringify({ displayName: file.name.replace(/\.[^.]+$/, ""), source: "feishu", sourceToken: file.remoteFileToken })),
      db.prepare("INSERT INTO integration_mappings (id, owner_id, integration_id, object_type, local_id, remote_id, metadata, last_synced_at) VALUES (?, ?, ?, 'resume', ?, ?, ?, CURRENT_TIMESTAMP)").bind(crypto.randomUUID(), userId, run.integration_id, id, file.remoteFileToken, JSON.stringify({ filename: file.name })),
      db.prepare("UPDATE integration_runs SET status = 'succeeded', result = ?, version = version + 1, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify({ fileId: id, size: bytes.byteLength }), body.runId, userId),
    ]);
    return Response.json({ file: { id, filename: file.name, mimeType: mime[extension], size: bytes.byteLength } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
