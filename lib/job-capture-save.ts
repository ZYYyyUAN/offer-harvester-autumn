import { z } from "zod";
import { ApiError, getDatabase } from "./server-data";
import { JobCaptureDraftSchema, jobFingerprint } from "./workflow-contracts";
import { JobMetadataSchema } from "./job-metadata";
import { validateJobMetadata } from "./job-metadata-store";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard } from "./jd-store";

export const CaptureConfirmationSchema = z.object({
  draftId: z.string().uuid().optional(), draftVersion: z.number().int().positive().optional(), jobMetadata: JobMetadataSchema.optional(),
  screenshotFileId: z.string().max(200).optional(), priority: z.enum(["高", "普通", "低"]).optional(), recruitmentMode: z.enum(["自动判断", "滚动招聘", "固定截止"]).optional(),
  allowDuplicate: z.boolean().default(false),
}).passthrough();
export async function saveCapturedJob(ownerId: string, input: z.infer<typeof CaptureConfirmationSchema>, original: Record<string, any>, jobId = "", jobVersion?: number) {
  const draft = input.draftId ? await ownedRecord(ownerId, input.draftId, "job_capture_drafts") : null;
  if (draft?.data.confirmedSavedJobId) return { record: await ownedRecord(ownerId, draft.data.confirmedSavedJobId, "saved_jobs"), reused: true };
  if (draft && draft.version !== input.draftVersion) throw new ApiError(409, "草稿已更新，请刷新后重试");
  const values = { ...original, ...draft?.data.values, ...input };
  const screenshotFileId = String(values.screenshotFileId ?? "");
  const extractionJobId = jobId || draft?.data.extractionJobId || "";
  const fields = ["company", "role", "location", "salary", "deadline", "jd", "sourceUrl"];
  const extracted = JobCaptureDraftSchema.parse({ ...Object.fromEntries(fields.map((key) => [key, values[key] ?? ""])), evidence: original.evidence || [], warnings: original.warnings || [], classificationClues: original.classificationClues || [] });
  if (!extracted.company && !extracted.role && !extracted.jd && !extracted.sourceUrl && !screenshotFileId) throw new ApiError(422, "请至少保存岗位链接、截图或一项岗位信息");
  if (screenshotFileId) {
    const file = await getDatabase().prepare("SELECT id FROM stored_files WHERE owner_id = ? AND id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(ownerId, screenshotFileId).first();
    if (!file) throw new ApiError(404, "岗位截图不存在");
  }
  const saved = await validateJobMetadata(ownerId, { ...extracted, jobMetadata: input.jobMetadata ?? draft?.data.metadata, screenshotFileId, extractionJobId, fingerprint: jobFingerprint(extracted), savedAt: new Date().toISOString(), priority: values.priority ?? "普通", recruitmentMode: values.recruitmentMode ?? "自动判断" }, draft ? { ...draft.data.values, jobMetadata: draft.data.metadata } : undefined);
  const savedJobs = await listKind(ownerId, "saved_jobs");
  const alreadyConfirmed = extractionJobId && !input.allowDuplicate ? savedJobs.find((r) => r.data.extractionJobId === extractionJobId) : null;
  if (alreadyConfirmed) return { record: alreadyConfirmed, reused: true };
  const duplicate = savedJobs.find((r) => jobFingerprint(r.data) === saved.fingerprint);
  if (duplicate && !input.allowDuplicate) return { duplicate, requiresConfirmation: true };
  const id = crypto.randomUUID();
  await atomicBatch([
    ...(draft ? [versionGuard(ownerId, draft.id, input.draftVersion!), updateRecordStatement(ownerId, draft, { ...draft.data, confirmedSavedJobId: id })] : []),
    ...(jobVersion ? [versionGuard(ownerId, jobId, jobVersion, "ai_jobs", "succeeded"), getDatabase().prepare("UPDATE ai_jobs SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(jobId, ownerId, jobVersion)] : []),
    insertRecord(ownerId, "saved_jobs", `${extracted.company} ${extracted.role}`.trim() || "收藏岗位", saved, id),
    insertRecord(ownerId, "activity_events", "核对收藏岗位与分类渠道", { entityType: "saved_jobs", entityId: id, action: "capture_confirmed", aiJobId: extractionJobId, draftId: draft?.id || null }),
  ]);
  return { record: await ownedRecord(ownerId, id), duplicate: null };
}
