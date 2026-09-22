import { z } from "zod";
import { ApiError, apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";

const FinalizeSchema = z.object({ applicationId: z.string().min(1), fileId: z.string().min(1), appliedAt: z.string().datetime() }).strict();

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const input = FinalizeSchema.parse(await request.json());
    const db = getDatabase();
    const application = await db.prepare("SELECT * FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL")
      .bind(input.applicationId, userId).first<Record<string, unknown>>();
    if (!application) throw new ApiError(404, "投递记录不存在");
    const selected = await db.prepare("SELECT id, filename, metadata FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL")
      .bind(input.fileId, userId).first<Record<string, unknown>>();
    if (!selected) throw new ApiError(404, "最终投递简历不存在");
    const selectedMetadata = safeJson<Record<string, any>>(String(selected.metadata), {});
    if (selectedMetadata.libraryType !== "optimization") throw new ApiError(400, "请先在简历优化库创建岗位专用版本");
    if (selectedMetadata.applicationId && selectedMetadata.applicationId !== input.applicationId) throw new ApiError(409, "该简历属于其他岗位");
    const data = safeJson<Record<string, any>>(String(application.data), {});
    const now = new Date().toISOString();
    const previousStage = String(data.stage || "待投递");
    data.stage = "已投递";
    data.resumeId = input.fileId;
    data.finalResumeFileId = input.fileId;
    data.resumeName = String(selectedMetadata.displayName || selected.filename);
    data.appliedAt = input.appliedAt;
    data.checklist = {
      ...(data.checklist || {}),
      resumeSelected: { done: true, at: now },
      resumeOptimized: { done: true, at: now },
      submitted: { done: true, at: input.appliedAt },
    };
    const siblings = await db.prepare("SELECT id, metadata FROM stored_files WHERE owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL AND json_extract(metadata, '$.applicationId') = ?")
      .bind(userId, input.applicationId).all<Record<string, unknown>>();
    const statements = siblings.results.map((row) => {
      const metadata = safeJson<Record<string, any>>(String(row.metadata), {});
      const isSelected = String(row.id) === input.fileId;
      return db.prepare("UPDATE stored_files SET record_id = ?, metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(input.applicationId, JSON.stringify({ ...metadata, applicationId: input.applicationId, applicationCompany: String(data.company || ""), applicationRole: String(data.role || ""), isFinalSubmitted: isSelected, submittedAt: isSelected ? input.appliedAt : null, optimizationStatus: isSelected ? "已投递" : "已归档" }), String(row.id), userId);
    });
    if (!siblings.results.some((row) => String(row.id) === input.fileId)) {
      statements.push(db.prepare("UPDATE stored_files SET record_id = ?, metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(input.applicationId, JSON.stringify({ ...selectedMetadata, applicationId: input.applicationId, applicationCompany: String(data.company || ""), applicationRole: String(data.role || ""), isFinalSubmitted: true, submittedAt: input.appliedAt, optimizationStatus: "已投递" }), input.fileId, userId));
    }
    statements.push(
      db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify(data), input.applicationId, userId),
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'application_events', ?, ?)")
        .bind(crypto.randomUUID(), userId, `完成投递：${data.resumeName}`, JSON.stringify({ entityType: "applications", entityId: input.applicationId, applicationId: input.applicationId, action: "application_submitted", from: previousStage, to: "已投递", fileId: input.fileId, appliedAt: input.appliedAt }))
    );
    await db.batch(statements);
    const saved = await db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE id = ? AND owner_id = ?")
      .bind(input.applicationId, userId).first<Record<string, unknown>>();
    return Response.json({ application: mapRecord(saved!) });
  } catch (error) {
    return apiError(error);
  }
}
