import { JobCaptureDraftSchema, jobFingerprint } from "@/lib/workflow-contracts";
import { ApiError, apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(); const jobId = (await context.params).id; const body = await request.json() as Record<string, unknown>;
    const job = await getDatabase().prepare("SELECT status, result FROM ai_jobs WHERE id = ? AND owner_id = ? AND type IN ('job_capture_url','job_capture_image')").bind(jobId, userId).first<Record<string, unknown>>();
    if (!job || job.status !== "succeeded") throw new ApiError(409, "岗位提取尚未成功完成");
    const original = safeJson<Record<string, unknown>>(String(job.result || "{}"), {}); const field = (key: string) => key in body ? body[key] : original[key];
    const data = JobCaptureDraftSchema.parse({ company: field("company") || "", role: field("role") || "", location: field("location") || "", salary: field("salary") || "", deadline: field("deadline") || "", jd: field("jd") || "", sourceUrl: field("sourceUrl") || "", evidence: original.evidence || [], warnings: original.warnings || [] });
    if (!data.company && !data.role && !data.jd) throw new ApiError(422, "岗位信息过少，请至少补充公司、岗位或 JD");
    const fingerprint = jobFingerprint(data); const db = getDatabase();
    const existingRows = await db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ? AND kind = 'saved_jobs' AND deleted_at IS NULL").bind(userId).all<Record<string, unknown>>();
    const duplicate = existingRows.results.map(mapRecord).find((item) => jobFingerprint(item.data) === fingerprint);
    if (duplicate && body.allowDuplicate !== true) return Response.json({ duplicate, requiresConfirmation: true });
    const id = crypto.randomUUID(); const saved = { ...data, screenshotFileId: String(body.screenshotFileId || original.screenshotFileId || ""), extractionJobId: jobId, fingerprint, savedAt: new Date().toISOString(), priority: String(body.priority || "普通"), recruitmentMode: ["自动判断", "滚动招聘", "固定截止"].includes(String(body.recruitmentMode)) ? String(body.recruitmentMode) : "自动判断" };
    await db.batch([
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'saved_jobs', ?, ?)").bind(id, userId, `${data.company} ${data.role}`.trim() || "收藏岗位", JSON.stringify(saved)),
      db.prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'activity_events', ?, ?)").bind(crypto.randomUUID(), userId, "确认岗位提取", JSON.stringify({ entityType: "saved_jobs", entityId: id, action: "capture_confirmed", aiJobId: jobId })),
    ]);
    const row = await db.prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE id = ? AND owner_id = ?").bind(id, userId).first<Record<string, unknown>>();
    return Response.json({ record: mapRecord(row!), duplicate: null }, { status: 201 });
  } catch (error) { return apiError(error); }
}
