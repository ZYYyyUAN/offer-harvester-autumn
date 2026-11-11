import { ApiError, getBindings, getDatabase, recordTitle } from "./server-data";
import { closureTransition } from "./application-closure";
import { sha256Hex } from "./data-safety";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard, type JDRecord } from "./jd-store";
import { submissionMetadata } from "./job-metadata-store";
import { applyMetadataSuggestions, metadataContext } from "./job-metadata";

export async function hashText(value: string) { return sha256Hex(new TextEncoder().encode(value).buffer); }
export async function resumeIdentity(ownerId: string, fileId: string | null, options: { completedOnly?: boolean } = {}) {
  if (!fileId) return { resumeFileId: null, resumeFileVersion: null, resumeSha256: null, resumeDisplayName: "", resumeReferenceStatus: "not_recorded" };
  const { db, bucket } = getBindings();
  const file = await db.prepare("SELECT * FROM stored_files WHERE owner_id = ? AND id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(ownerId, fileId).first<Record<string, unknown>>();
  if (!file) throw new ApiError(404, "关联简历不存在");
  const metadata = JSON.parse(String(file.metadata));
  if (options.completedOnly && metadata.libraryType === "optimization") throw new ApiError(422, "默认投递简历需要从已完成简历库选择");
  const object = await bucket.get(String(file.object_key));
  if (!object) throw new ApiError(404, "关联简历原文件不存在");
  return { resumeFileId: fileId, resumeFileVersion: Number(file.version), resumeSha256: await sha256Hex(await object.arrayBuffer()), resumeDisplayName: String(metadata.displayName || file.filename), resumeReferenceStatus: "available" };
}
export async function snapshotData(ownerId: string, source: { id: string; data: Record<string, any> }, options: { submissionId?: string; previous?: JDRecord; reason: string; correctionReason?: string; isSaved?: boolean; resumeIdentity?: Awaited<ReturnType<typeof resumeIdentity>>; pendingSavedJobId?: string }) {
  const d = source.data;
  const identity = options.previous ? {
    resumeFileId: options.previous.data.resumeFileId, resumeFileVersion: options.previous.data.resumeFileVersion, resumeSha256: options.previous.data.resumeSha256,
    resumeDisplayName: options.previous.data.resumeDisplayName, resumeReferenceStatus: options.previous.data.resumeReferenceStatus,
  } : options.resumeIdentity || await resumeIdentity(ownerId, options.isSaved ? null : String(d.finalResumeFileId || d.resumeId || "") || null);
  const jdText = String(d.jd || "");
  const payload = { company: String(d.company || ""), role: String(d.role || ""), direction: String(d.direction || ""), location: String(d.location || ""),
    companyType: String(d.companyType || "unknown"), jdText, sourceUrl: String(d.sourceUrl || ""), screenshotFileId: String(d.screenshotFileId || "") };
  if (payload.screenshotFileId) {
    const file = await getDatabase().prepare("SELECT id FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(payload.screenshotFileId, ownerId).first();
    if (!file) throw new ApiError(404, "岗位截图不存在");
  }
  const appliedAt = options.isSaved ? null : (options.previous?.data.appliedAt ?? (d.appliedAt || null));
  const savedJobId = options.isSaved ? source.id : String(options.previous?.data.savedJobId || d.savedJobId || "");
  const deletedSourceIds = [...(options.previous?.data.deletedSourceIds || [])];
  if (savedJobId && savedJobId !== options.pendingSavedJobId && !await getDatabase().prepare("SELECT id FROM records WHERE owner_id = ? AND id = ? AND kind = 'saved_jobs'").bind(ownerId, savedJobId).first()) deletedSourceIds.push(savedJobId);
  return { ...payload, ...identity, sourceEntryId: String(options.previous?.data.sourceEntryId || (options.isSaved ? source.id : d.savedJobId || source.id)),
    applicationId: options.isSaved ? "" : source.id, savedJobId, deletedSourceIds: [...new Set(deletedSourceIds)],
    submissionId: options.submissionId || "", revision: options.previous ? options.previous.data.revision + 1 : 1,
    previousSnapshotId: options.previous?.id ?? null, captureReason: options.reason,
    jdSha256: await hashText(jdText), snapshotPayloadSha256: await hashText(JSON.stringify(payload)), capturedAt: new Date().toISOString(),
    appliedAt, appliedAtStatus: appliedAt ? "known" : "unknown", contentStatus: jdText.trim() ? "available" : "missing",
    correctionReason: options.correctionReason || "", activeExtractionId: null, ignored: false };
}
export function isSubmitted(data: Record<string, any>) {
  const checked = data.checklist?.submitted;
  return ["已投递", "笔试中", "面试中", "OFFER"].includes(String(data.stage)) || Boolean(data.appliedAt) || checked === true || checked?.done === true;
}
export async function applicationSaveStatements(ownerId: string, id: string, data: Record<string, any>, existing: JDRecord | null, operationId = "", lateEntry = false, creationContext?: { resumeIdentity: Awaited<ReturnType<typeof resumeIdentity>>; pendingSavedJobId: string }) {
  const transition = closureTransition(existing?.data || null, data, new Date().toISOString(), crypto.randomUUID());
  data = transition.data;
  if (data.jobMetadata) {
    const metadata = applyMetadataSuggestions(data.jobMetadata, [], metadataContext(String(data.company || ""), String(data.sourceUrl || "")));
    if (existing && existing.data.company !== data.company && metadata.companyProfileId === existing.data.jobMetadata?.companyProfileId) metadata.companyProfileId = null;
    data = { ...data, jobMetadata: metadata };
  }
  const db = getDatabase();
  const statements: D1PreparedStatement[] = [];
  if (transition.event) statements.push(insertRecord(ownerId, "application_events", "更新机会结束状态", { applicationId: id, entityId: id, entityType: "applications", ...transition.event }));
  if (existing) statements.push(versionGuard(ownerId, id, existing.version));
  const submission = (await listKind(ownerId, "job_submissions")).find((s) => s.data.applicationId === id);
  if (!submission && (isSubmitted(data) || (lateEntry && existing))) {
    const submissionId = crypto.randomUUID(), snapshotId = crypto.randomUUID();
    const snap = await snapshotData(ownerId, { id, data }, { submissionId, reason: lateEntry || (existing && isSubmitted(existing.data)) ? "late_entry" : "submitted", resumeIdentity: creationContext?.resumeIdentity, pendingSavedJobId: creationContext?.pendingSavedJobId });
    const prior = (await listKind(ownerId, "jd_snapshots")).filter((s) => s.data.sourceEntryId === snap.sourceEntryId).sort((a, b) => b.data.revision - a.data.revision)[0];
    if (prior) { snap.revision = prior.data.revision + 1; snap.previousSnapshotId = prior.id; }
    statements.push(insertRecord(ownerId, "jd_snapshots", data.company + " · " + data.role, snap, snapshotId));
    statements.push(insertRecord(ownerId, "job_submissions", data.company + " · 投递归档", {
      applicationId: id, sourceEntryId: snap.sourceEntryId, snapshotId, appliedAt: snap.appliedAt, operationId,
      resumeFileId: snap.resumeFileId, resumeSha256: snap.resumeSha256,
      metadataSnapshot: submissionMetadata(data), metadataRecordedAt: new Date().toISOString(),
    }, submissionId));
  }
  if(existing && (existing.data.appliedAt || null) !== (data.appliedAt || null)) statements.push(insertRecord(ownerId,"activity_events","更正实际投递时间",{entityType:"applications",entityId:id,applicationId:id,action:"submission_date_corrected",previousAppliedAt:existing.data.appliedAt||null,appliedAt:data.appliedAt||null,recordedAt:new Date().toISOString(),policy:"original_submission_snapshot_unchanged"}));
  statements.push(existing ? updateRecordStatement(ownerId, existing, data) : insertRecord(ownerId, "applications", recordTitle("applications", data), data, id));
  statements.push(db.prepare("UPDATE records SET title = ? WHERE id = ? AND owner_id = ?").bind(recordTitle("applications", data), id, ownerId));
  statements.push(insertRecord(ownerId, "application_events", "更新投递与 JD 归档", {
    applicationId: id, entityId: id, entityType: "applications", action: "application_updated", from: existing?.data.stage || null, to: data.stage,
    appliedAt: data.appliedAt || null, operationId,
  }));
  return statements;
}
export async function saveApplication(ownerId: string, id: string, data: Record<string, any>, existing: JDRecord | null, operationId = "", extra: D1PreparedStatement[] = [], lateEntry = false) {
  await atomicBatch([...(await applicationSaveStatements(ownerId, id, data, existing, operationId, lateEntry)), ...extra], existing ? { ownerId, id } : undefined);
  return ownedRecord(ownerId, id, "applications");
}
