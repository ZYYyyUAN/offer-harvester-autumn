import { z } from "zod";
import { ApiError, apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";

const LinkSchema = z.object({ applicationId: z.string().min(1), fileId: z.string().nullable() }).strict();

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const input = LinkSchema.parse(await request.json());
    const db = getDatabase();
    const application = await db.prepare("SELECT * FROM records WHERE id = ? AND owner_id = ? AND kind = 'applications' AND deleted_at IS NULL")
      .bind(input.applicationId, userId).first<Record<string, unknown>>();
    if (!application) throw new ApiError(404, "投递记录不存在");
    const data = safeJson<Record<string, any>>(String(application.data), {});
    const previousId = String(data.resumeId || "");
    let file: Record<string, unknown> | null = null;
    let fileMetadata: Record<string, any> | null = null;
    if (input.fileId) {
      file = await db.prepare("SELECT id, filename, metadata FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL")
        .bind(input.fileId, userId).first<Record<string, unknown>>();
      if (!file) throw new ApiError(404, "简历不存在");
      fileMetadata = safeJson<Record<string, any>>(String(file.metadata), {});
      if (fileMetadata.libraryType === "optimization" && fileMetadata.applicationId && fileMetadata.applicationId !== input.applicationId) throw new ApiError(409, "该优化简历已关联其他岗位");
      data.resumeId = input.fileId;
      data.resumeName = String(fileMetadata.displayName || file.filename);
      data.checklist = { ...(data.checklist || {}), resumeSelected: { done: true, at: new Date().toISOString() } };
    } else {
      data.resumeId = "";
      data.resumeName = "";
      data.finalResumeFileId = "";
      data.checklist = { ...(data.checklist || {}), resumeSelected: { done: false, at: new Date().toISOString() } };
    }
    const statements = [
      db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(JSON.stringify(data), input.applicationId, userId),
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'activity_events', ?, ?)")
        .bind(crypto.randomUUID(), userId, input.fileId ? `关联简历：${data.resumeName}` : "取消简历关联", JSON.stringify({ entityType: "applications", entityId: input.applicationId, applicationId: input.applicationId, action: input.fileId ? "resume_linked" : "resume_unlinked", fileId: input.fileId, previousFileId: previousId })),
    ];
    if (input.fileId && fileMetadata?.libraryType === "optimization") {
      statements.push(db.prepare("UPDATE stored_files SET record_id = ?, metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
        .bind(input.applicationId, JSON.stringify({ ...fileMetadata, applicationId: input.applicationId, applicationCompany: String(data.company || ""), applicationRole: String(data.role || "") }), input.fileId, userId));
    }
    if (!input.fileId && previousId) {
      const previous = await db.prepare("SELECT metadata FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume'").bind(previousId, userId).first<Record<string, unknown>>();
      if (previous) {
        const previousMetadata = safeJson<Record<string, any>>(String(previous.metadata), {});
        if (previousMetadata.libraryType === "optimization" && previousMetadata.applicationId === input.applicationId) {
          statements.push(db.prepare("UPDATE stored_files SET record_id = NULL, metadata = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
            .bind(JSON.stringify({ ...previousMetadata, applicationId: null, applicationCompany: "", applicationRole: "", isFinalSubmitted: false }), previousId, userId));
        }
      }
    }
    await db.batch(statements);
    const saved = await db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE id = ? AND owner_id = ?")
      .bind(input.applicationId, userId).first<Record<string, unknown>>();
    return Response.json({ application: mapRecord(saved!) });
  } catch (error) {
    return apiError(error);
  }
}
