import { getDatabase, mapRecord } from "./server-data";
import { insertRecord, versionGuard } from "./jd-store";
import { metadataRuleVersion, type JobMetadata } from "./job-metadata";

async function detachEvidenceReferences(ownerId: string, sourceIds: Set<string>, profileId?: string, fileId?: string) {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM records WHERE owner_id = ? AND kind IN ('applications','saved_jobs','job_capture_drafts')").bind(ownerId).all<Record<string, unknown>>();
  const statements: D1PreparedStatement[] = [];
  for (const record of rows.results.map(mapRecord)) {
    const key = record.kind === "job_capture_drafts" ? "metadata" : "jobMetadata";
    const metadata = record.data[key] as JobMetadata | undefined;
    const draftFileRemoved = record.kind === "job_capture_drafts" && fileId && (record.data.values as Record<string, unknown>).screenshotFileId === fileId;
    if (!metadata || !(metadata.companyProfileId === profileId || metadata.companyProfileCandidate?.id === profileId || draftFileRemoved || Object.values(metadata.fieldStates).some((state) => state.evidence && sourceIds.has(state.evidence.sourceRef)) || metadata.suggestions.some((s) => sourceIds.has(s.evidence.sourceRef)))) continue;
    const next = structuredClone(metadata);
    if (profileId && next.companyProfileId === profileId) next.companyProfileId = null;
    if (profileId && next.companyProfileCandidate?.id === profileId) next.companyProfileCandidate = null;
    for (const state of Object.values(next.fieldStates)) if (state.evidence && sourceIds.has(state.evidence.sourceRef)) { state.evidence.sourceDeleted = true; if (state.status === "suggested") state.status = "needs_review"; }
    next.suggestions = next.suggestions.map((suggestion) => sourceIds.has(suggestion.evidence.sourceRef) ? { ...suggestion, status: "stale", evidence: { ...suggestion.evidence, sourceDeleted: true } } : suggestion);
    const data = { ...record.data, [key]: next, ...(draftFileRemoved ? { values: { ...(record.data.values as Record<string, unknown>), screenshotFileId: "" }, extractionJobId: sourceIds.has(String(record.data.extractionJobId)) ? "" : record.data.extractionJobId } : {}) };
    statements.push(versionGuard(ownerId, record.id, record.version, "records", record.deletedAt ? "deleted" : undefined), db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(JSON.stringify(data), record.id, ownerId, record.version));
  }
  if (statements.length) statements.push(insertRecord(ownerId, "activity_events", "标记已删除的分类资料来源", { entityType: profileId ? "company_profiles" : "files", entityId: profileId || fileId, action: "metadata_source_detached", policy: "preserve_confirmed_values_and_history" }));
  return statements;
}
export async function detachDeletedCompanyProfile(ownerId: string, profileId: string) {
  return detachEvidenceReferences(ownerId, new Set([profileId]), profileId);
}
export async function detachDeletedCaptureEvidence(ownerId: string, fileId: string) {
  const jobs = await getDatabase().prepare("SELECT id FROM ai_jobs WHERE owner_id = ? AND type = 'job_capture_image' AND json_extract(input_snapshot, '$.fileId') = ?").bind(ownerId, fileId).all<{ id: string }>();
  return detachEvidenceReferences(ownerId, new Set(jobs.results.map((r) => r.id)), undefined, fileId);
}
export async function detachDeletedResearchReport(ownerId: string, reportId: string) {
  const db = getDatabase();
  const rows = await db.prepare("SELECT * FROM records WHERE owner_id = ? AND kind = 'company_profiles' AND json_extract(data, '$.researchRecordId') = ?").bind(ownerId, reportId).all<Record<string, unknown>>();
  return rows.results.map(mapRecord).flatMap((record) => [
    versionGuard(ownerId, record.id, record.version, "records", record.deletedAt ? "deleted" : undefined),
    db.prepare("UPDATE records SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND version = ?").bind(JSON.stringify({ ...record.data, researchRecordId: "", evidence: [...(record.data.evidence as unknown[]), { sourceType: "manual", sourceRef: reportId, quote: "参考背调报告已删除；此前人工确认的公司分类保留", obtainedAt: new Date().toISOString(), version: metadataRuleVersion, contextKey: JSON.stringify([record.data.legalName, ""]), sourceDeleted: true }] }), record.id, ownerId, record.version),
  ]);
}
