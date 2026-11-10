import { JobMetadataSchema, metadataDataSchemas } from "./job-metadata.ts";
type Entry = { id: string; kind: string; data: Record<string, any> };
export function validateMetadataBackup(records: Entry[]) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const need = (id: string, kind: string) => { const record = byId.get(id); if (!record || record.kind !== kind) throw new Error("分类与渠道备份缺少关联记录：" + id); return record; };
  for (const record of records) {
    const data = record.data;
    metadataDataSchemas[record.kind]?.parse(data);
    if (record.kind === "company_profiles" && data.researchRecordId) need(data.researchRecordId, "research");
    if (["applications", "saved_jobs"].includes(record.kind) && data.jobMetadata) {
      JobMetadataSchema.parse(data.jobMetadata);
      if (data.jobMetadata.companyProfileId) need(data.jobMetadata.companyProfileId, "company_profiles");
      if (data.jobMetadata.companyProfileCandidate) need(data.jobMetadata.companyProfileCandidate.id, "company_profiles");
    }
    if (record.kind === "job_capture_drafts") {
      if (data.metadata.companyProfileId) need(data.metadata.companyProfileId, "company_profiles");
      if (data.metadata.companyProfileCandidate) need(data.metadata.companyProfileCandidate.id, "company_profiles");
      if (data.confirmedSavedJobId) need(data.confirmedSavedJobId, "saved_jobs");
    }
    if (record.kind === "submission_metadata_revisions") {
      need(data.applicationId, "applications");
      if (need(data.submissionId, "job_submissions").data.applicationId !== data.applicationId) throw new Error("渠道修订与投递身份不一致");
      if (data.previousRevisionId) {
        const previous = need(data.previousRevisionId, "submission_metadata_revisions");
        if (previous.data.submissionId !== data.submissionId || previous.data.revision + 1 !== data.revision) throw new Error("渠道修订链无效");
      } else if (data.revision !== 1) throw new Error("渠道修订缺少前一版");
    }
  }
}
