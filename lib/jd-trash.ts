import { getDatabase, mapRecord } from "./server-data";
import { atomicBatch, versionGuard, type JDRecord } from "./jd-store";
import { jdKinds } from "./jd-contracts";
import { detachDeletedCaptureEvidence } from "./job-metadata-delete";
export async function relatedJDRecords(ownerId: string, root: JDRecord) {
  const rows = await getDatabase().prepare("SELECT * FROM records WHERE owner_id = ? AND deleted_at IS NULL").bind(ownerId).all<Record<string, unknown>>();
  const all = rows.results.map(mapRecord) as JDRecord[];
  const ids = new Set([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of all) {
      if (ids.has(r.id) || (!(jdKinds as readonly string[]).includes(r.kind) && !["tasks", "submission_metadata_revisions", "job_capture_drafts"].includes(r.kind))) continue;
      const d = r.data;
      if (root.kind === "saved_jobs" && r.kind === "jd_snapshots" && d.applicationId && all.some((a) => a.kind === "applications" && a.id === d.applicationId)) continue;
      if ([d.applicationId, d.savedJobId, d.confirmedSavedJobId, d.submissionId, d.snapshotId, d.extractionId, d.analysisId, d.sourceSuggestionId, d.input?.textSnapshotId].some((id) => id && ids.has(id)) ||
          (d.input?.samples || []).some((s: { id: string }) => ids.has(s.id))) { ids.add(r.id); changed = true; }
    }
  }
  return all.filter((r) => ids.has(r.id));
}
export async function trashJDRecords(ownerId: string, root: JDRecord) {
  const records = await relatedJDRecords(ownerId, root);
  const batchId = crypto.randomUUID();
  const statements = records.flatMap((r) => [versionGuard(ownerId, r.id, r.version),
    getDatabase().prepare("UPDATE records SET deleted_at = CURRENT_TIMESTAMP, version = version + 1, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?")
      .bind(JSON.stringify({ ...r.data, deletionBatchId: batchId }), r.id, ownerId, r.version)]);
  for (const r of records) statements.push(getDatabase().prepare("UPDATE ai_jobs SET status = 'cancelled', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND status IN ('queued','running','failed') AND (json_extract(input_snapshot, '$.snapshotId') = ? OR result_record_id = ?)").bind(ownerId, r.id, r.id));
  await atomicBatch(statements);
  return { deleted: records.length, batchId };
}
export function scrubJDJobs(ownerId: string, recordId: string) {
  const db = getDatabase();
  const condition = "(result_record_id = ? OR json_extract(input_snapshot, '$.snapshotId') = ? OR json_extract(input_snapshot, '$.textSnapshotId') = ? OR json_extract(input_snapshot, '$.fileId') = ? OR json_extract(input_snapshot, '$.resumeFileId') = ? OR EXISTS (SELECT 1 FROM json_each(ai_jobs.input_snapshot, '$.samples') WHERE json_extract(value, '$.id') = ?))";
  const jobs = "SELECT id FROM ai_jobs WHERE owner_id = ? AND " + condition;
  return [
    db.prepare("DELETE FROM ai_job_attempts WHERE owner_id = ? AND job_id IN (" + jobs + ")").bind(ownerId, ownerId, ...Array(6).fill(recordId)),
    db.prepare("DELETE FROM ai_jobs WHERE owner_id = ? AND " + condition).bind(ownerId, ...Array(6).fill(recordId)),
  ];
}
export async function retainDeletedSavedJobSource(ownerId: string, savedJobId: string) {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM records WHERE owner_id = ? AND kind = 'jd_snapshots' AND json_extract(data, '$.savedJobId') = ?").bind(ownerId, savedJobId).all<Record<string, unknown>>();
  return rows.results.map(mapRecord).filter((r) => !(r.data.deletedSourceIds as string[] | undefined)?.includes(savedJobId)).flatMap((r) => [versionGuard(ownerId, r.id, r.version, "records", r.deletedAt ? "deleted" : undefined), db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(JSON.stringify({ ...r.data, deletedSourceIds: [...((r.data.deletedSourceIds as string[] | undefined) || []), savedJobId] }), r.id, ownerId, r.version)]);
}
export async function eraseJDFileCopies(ownerId: string, fileId: string) {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM records WHERE owner_id = ?").bind(ownerId).all<Record<string, unknown>>();
  const all = rows.results.map(mapRecord) as JDRecord[];
  const ids = new Set(all.filter((r) => (r.kind === "resume_text_snapshots" && r.data.fileId === fileId) || (r.kind === "resume_gap_analyses" && r.data.input.resumeFileId === fileId)).map((r) => r.id));
  for (const r of all.filter((r) => r.kind === "resume_improvement_items" && ids.has(r.data.analysisId))) ids.add(r.id);
  for (const r of all.filter((r) => r.kind === "tasks" && ids.has(r.data.sourceSuggestionId))) ids.add(r.id);
  const statements = [...await detachDeletedCaptureEvidence(ownerId, fileId), ...scrubJDJobs(ownerId, fileId), ...[...ids].flatMap((id) => [...scrubJDJobs(ownerId, id), db.prepare("DELETE FROM records WHERE id = ? AND owner_id = ?").bind(id, ownerId)])];
  for (const r of all.filter((r) => r.kind === "jd_snapshots" && (r.data.resumeFileId === fileId || r.data.screenshotFileId === fileId))) statements.push(db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify({ ...r.data, ...(r.data.resumeFileId === fileId ? { resumeReferenceStatus: "deleted" } : {}), deletedFileIds: [...new Set([...(r.data.deletedFileIds || []), fileId])] }), r.id, ownerId));
  for (const r of all.filter((r) => !ids.has(r.id) && r.kind === "resume_improvement_items" && r.data.resultResumeFileId === fileId)) statements.push(db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?").bind(JSON.stringify({ ...r.data, resultResumeFileId: null, resultResumeSha256: null }), r.id, ownerId));
  return statements;
}
