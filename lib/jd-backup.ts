import { jdKinds, jdDataSchemas, validateExtraction, validateGap } from "./jd-contracts.ts";
import { validateMetadataBackup } from "./job-metadata-backup.ts";
type Entry = { id: string; kind: string; data: Record<string, any> };
export function validateJDBackup(records: Entry[], files: Array<{ id: string; sha256?: string }>) {
  validateMetadataBackup(records);
  const byId = new Map(records.map((r) => [r.id, r])); const fileIds = new Set(files.map((f) => f.id));
  if (byId.size !== records.length || fileIds.size !== files.length) throw new Error("备份记录或文件 ID 重复");
  const need = (id: string, kind?: string) => { const r = byId.get(id); if (!r || (kind && r.kind !== kind)) throw new Error("备份缺少关联记录：" + id); return r; };
  for (const r of records.filter((e) => (jdKinds as readonly string[]).includes(e.kind))) {
    jdDataSchemas[r.kind].parse(r.data);
    const d = r.data;
    if (r.kind === "job_submissions") { need(d.applicationId, "applications"); const snap = need(d.snapshotId, "jd_snapshots"); if (snap.data.applicationId !== d.applicationId || snap.data.submissionId !== r.id) throw new Error("投递身份与快照不一致"); }
    if (r.kind === "jd_snapshots") {
      if (d.applicationId) need(d.applicationId, "applications");
      if (d.savedJobId && !d.deletedSourceIds?.includes(d.savedJobId)) need(d.savedJobId, "saved_jobs");
      if (d.previousSnapshotId) { const previous = need(d.previousSnapshotId, "jd_snapshots"); if (previous.data.sourceEntryId !== d.sourceEntryId || previous.data.revision >= d.revision) throw new Error("快照修订链无效"); }
      if (d.activeExtractionId && need(d.activeExtractionId, "jd_extractions").data.snapshotId !== r.id) throw new Error("有效提取不属于此快照");
      if (d.screenshotFileId && !d.deletedFileIds?.includes(d.screenshotFileId) && !fileIds.has(d.screenshotFileId)) throw new Error("备份缺少岗位截图");
      if (d.resumeFileId && d.resumeReferenceStatus === "available" && files.find((f) => f.id === d.resumeFileId)?.sha256 !== d.resumeSha256) throw new Error("投递时简历的文件或哈希不一致");
    }
    if (r.kind === "jd_extractions") { const snap = need(d.snapshotId, "jd_snapshots"); validateExtraction(d.rawOutput, snap.data.jdText, r.id); }
    if (r.kind === "jd_requirement_edits") {
      const ext = need(d.extractionId, "jd_extractions"); need(d.snapshotId, "jd_snapshots");
      if (ext.data.snapshotId !== d.snapshotId) throw new Error("人工修订与快照不一致");
      if (!ext.data.output.requirements.some((item: { key: string }) => item.key === d.requirementKey)) throw new Error("备份修订引用不存在的要求");
    }
    if (r.kind === "resume_text_snapshots" && files.find((f) => f.id === d.fileId)?.sha256 !== d.fileSha256) throw new Error("备份简历文本与原件哈希不一致：" + d.fileId);
    if (r.kind === "resume_gap_analyses") {
      need(d.input.textSnapshotId, "resume_text_snapshots");
      for (const s of d.input.samples) need(s.id, "jd_snapshots");
      validateGap(d.output, d.input);
    }
    if (r.kind === "resume_improvement_items") {
      const analysis = need(d.analysisId, "resume_gap_analyses"); if (!analysis.data.output.suggestions.some((s: { key: string }) => s.key === d.suggestion.key)) throw new Error("建议不属于此分析");
      if (d.taskId && need(d.taskId, "tasks").data.sourceSuggestionId !== r.id) throw new Error("任务与建议不一致");
      if (d.resultResumeFileId && !fileIds.has(d.resultResumeFileId)) throw new Error("备份缺少修改稿");
    }
  }
}
export function validateJDMerge(current: Entry, incoming: Entry) {
  if (current.kind !== incoming.kind) throw new Error("同 ID 记录类型不一致");
  const immutable: Record<string, string[]> = {
    jd_snapshots: ["jdText", "jdSha256", "snapshotPayloadSha256", "sourceEntryId", "applicationId", "submissionId", "previousSnapshotId", "revision", "capturedAt", "appliedAt", "resumeFileId", "resumeFileVersion", "resumeSha256"],
    jd_extractions: ["snapshotId", "aiJobId", "rawOutput", "output"],
    jd_requirement_edits: ["extractionId", "requirementKey", "revision", "patch", "reason"],
    resume_text_snapshots: ["fileId", "fileSha256", "text"],
    resume_gap_analyses: ["aiJobId", "input", "output"],
    job_submissions: ["applicationId", "sourceEntryId", "snapshotId", "resumeFileId", "resumeSha256", "metadataSnapshot", "metadataRecordedAt"],
    submission_metadata_revisions: ["applicationId", "submissionId", "revision", "previousRevisionId", "metadata", "reason", "recordedAt"],
  };
  if ((immutable[current.kind] || []).some((key) => JSON.stringify(current.data[key]) !== JSON.stringify(incoming.data[key]))) throw new Error("备份不能覆盖历史正文或证据，请保留当前版本并创建修订");
}
