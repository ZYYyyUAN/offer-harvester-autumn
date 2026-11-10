import { canonicalCompanyTag, channelLabels, discoveryLabels, JobMetadataSchema, type JobMetadata } from "./job-metadata.ts";

type RecordEntry = { id: string; kind: string; data: Record<string, any> };
export type MetadataFilters = { discoverySource?: string; channel?: string; referralStatus?: string; companyNature?: string; companyTags?: string[]; tagMatch?: "any" | "all" };
export function historicalMetadata(applicationId: string, records: RecordEntry[]): { metadata: JobMetadata; basis: "snapshot" | "backfill" | "unknown"; recordedAt: string | null } {
  const revision = records.filter((r) => r.kind === "submission_metadata_revisions" && r.data.applicationId === applicationId).sort((a, b) => b.data.revision - a.data.revision)[0];
  if (revision) return { metadata: JobMetadataSchema.parse(revision.data.metadata), basis: "backfill", recordedAt: revision.data.recordedAt };
  const submission = records.find((r) => r.kind === "job_submissions" && r.data.applicationId === applicationId);
  return { metadata: JobMetadataSchema.parse(submission?.data.metadataSnapshot || {}), basis: submission?.data.metadataSnapshot ? "snapshot" : "unknown", recordedAt: submission?.data.metadataRecordedAt || null };
}
export function matchesMetadata(metadata: JobMetadata, filters: MetadataFilters) {
  if (filters.channel && (metadata.actualSubmission?.channel || "unknown") !== filters.channel) return false;
  if (filters.discoverySource && metadata.discoverySource !== filters.discoverySource) return false;
  if (filters.referralStatus && metadata.referralStatus !== filters.referralStatus) return false;
  if (filters.companyNature && metadata.companyNature !== filters.companyNature) return false;
  const tags = metadata.companyTags.map(canonicalCompanyTag);
  if (filters.companyTags?.length && !(filters.tagMatch === "all" ? filters.companyTags.every((t) => tags.includes(canonicalCompanyTag(t))) : filters.companyTags.some((t) => tags.includes(canonicalCompanyTag(t))))) return false;
  return true;
}
export function metadataStatistics(records: RecordEntry[], minimumSample: number, filters: MetadataFilters = {}) {
  const events = records.filter((r) => ["application_events", "activity_events"].includes(r.kind));
  const submissions = records.filter((r) => r.kind === "job_submissions");
  const reached = (id: string, stage: string, current: unknown) => {
    const stages = ["待投递", "已投递", "笔试中", "面试中", "OFFER"];
    return stages.indexOf(String(current)) >= stages.indexOf(stage) || events.some((e) => e.data.applicationId === id && stages.indexOf(String(e.data.to)) >= stages.indexOf(stage));
  };
  const applied = [...new Map(records.filter((r) => r.kind === "applications" && (submissions.some((s) => s.data.applicationId === r.id) || reached(r.id, "已投递", r.data.stage) || Boolean(r.data.appliedAt))).map((r) => [r.id, r])).values()];
  const samples = applied.map((r) => ({ ...r, ...historicalMetadata(r.id, records) })).filter((r) => matchesMetadata(r.metadata, filters));
  const group = (field: "submissionChannel" | "discoverySource" | "referralStatus") => {
    const groups = new Map<string, typeof samples>();
    for (const sample of samples) { const key = field === "submissionChannel" ? sample.metadata.actualSubmission?.channel || "unknown" : sample.metadata[field]; groups.set(key, [...(groups.get(key) || []), sample]); }
    return [...groups].map(([key, items]) => ({ key, label: field === "referralStatus" ? ({ yes: "已确认内推", no: "非内推", unknown: "内推未知" } as Record<string, string>)[key] : (field === "discoverySource" ? discoveryLabels : channelLabels)[key as keyof typeof channelLabels] || "未知", count: items.length,
      interviewCount: items.filter((r) => reached(r.id, "面试中", r.data.stage)).length,
      offerCount: items.filter((r) => reached(r.id, "OFFER", r.data.stage)).length, ratesVisible: items.length >= minimumSample }));
  };
  return { totalSubmitted: applied.length, filteredCount: samples.length, basis: "投递时快照及明确标注的历史补录；未知单列", backfilledCount: samples.filter((r) => r.basis === "backfill").length,
    channel: group("submissionChannel"), discovery: group("discoverySource"), referral: group("referralStatus"), samples: samples.map(({ id, metadata, basis, recordedAt }) => ({ id, metadata, basis, recordedAt })) };
}
