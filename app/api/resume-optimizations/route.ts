import { z } from "zod";
import { ApiError, apiError, getBindings, mapFile, requireApiUser, safeJson } from "@/lib/server-data";

const CreateSchema = z.object({ applicationId: z.string().min(1), sourceFileId: z.string().min(1) }).strict();

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const input = CreateSchema.parse(await request.json());
    const { db, bucket } = getBindings();
    const application = await db.prepare("SELECT id, data FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL")
      .bind(input.applicationId, userId).first<Record<string, unknown>>();
    if (!application) throw new ApiError(404, "待投递岗位不存在");
    const source = await db.prepare("SELECT id, filename, object_key, mime_type, size, metadata FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL")
      .bind(input.sourceFileId, userId).first<Record<string, unknown>>();
    if (!source) throw new ApiError(404, "源简历不存在");
    const sourceObject = await bucket.get(String(source.object_key));
    if (!sourceObject) throw new ApiError(404, "源简历文件内容不存在");

    const appData = safeJson<Record<string, any>>(String(application.data), {});
    const existing = await db.prepare("SELECT metadata FROM stored_files WHERE owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL AND json_extract(metadata, '$.applicationId') = ?")
      .bind(userId, input.applicationId).all<Record<string, unknown>>();
    const revision = Math.max(0, ...existing.results.map((row) => Number(safeJson<Record<string, any>>(String(row.metadata), {}).optimizationRevision || 0))) + 1;
    const id = crypto.randomUUID();
    const objectKey = `${userId}/resume/${id}`;
    const sourceMetadata = safeJson<Record<string, any>>(String(source.metadata), {});
    const displayName = `${sourceMetadata.displayName || String(source.filename).replace(/\.[^.]+$/, "")} · ${appData.company || "目标公司"} ${appData.role || "目标岗位"} · 优化稿 ${revision}`;
    const metadata = {
      ...sourceMetadata,
      displayName,
      libraryType: "optimization",
      applicationId: input.applicationId,
      applicationCompany: String(appData.company || ""),
      applicationRole: String(appData.role || ""),
      sourceResumeId: input.sourceFileId,
      parentFileId: input.sourceFileId,
      optimizationRevision: revision,
      optimizationStatus: "待优化",
      isFinalSubmitted: false,
      submittedAt: null,
      review: null,
      reviewedAt: null,
    };
    await bucket.put(objectKey, sourceObject.body, { httpMetadata: { contentType: String(source.mime_type) } });
    appData.resumeId = id;
    appData.resumeName = displayName;
    appData.checklist = { ...(appData.checklist || {}), resumeSelected: { done: true, at: new Date().toISOString() } };
    await db.batch([
      db.prepare("INSERT INTO stored_files (id, owner_id, record_id, purpose, filename, object_key, mime_type, size, metadata) VALUES (?, ?, ?, 'resume', ?, ?, ?, ?, ?)")
        .bind(id, userId, input.applicationId, String(source.filename), objectKey, String(source.mime_type), Number(source.size), JSON.stringify(metadata)),
      db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(JSON.stringify(appData), input.applicationId, userId),
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'activity_events', ?, ?)")
        .bind(crypto.randomUUID(), userId, `创建岗位优化简历：${displayName}`, JSON.stringify({ entityType: "applications", entityId: input.applicationId, applicationId: input.applicationId, action: "resume_optimization_created", fileId: id, sourceFileId: input.sourceFileId })),
    ]);
    const saved = await db.prepare("SELECT id, record_id, purpose, filename, mime_type, size, metadata, version, created_at, updated_at, deleted_at FROM stored_files WHERE id = ? AND owner_id = ?")
      .bind(id, userId).first<Record<string, unknown>>();
    return Response.json({ file: mapFile(saved!) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
