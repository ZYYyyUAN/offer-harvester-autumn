import { test } from "node:test";
import assert from "node:assert/strict";
import { JobMetadataSchema } from "../lib/job-metadata.ts";
import { metadataStatistics } from "../lib/job-metadata-statistics.ts";
import { validateMetadataBackup } from "../lib/job-metadata-backup.ts";

test("fixed 8 submitted + 2 preparing samples: historical channel denominators and small samples", () => {
  const records: Array<{ id: string; kind: string; data: Record<string, any> }> = [];
  for (let i = 0; i < 10; i++) {
    records.push({ id: "a" + i, kind: "applications", data: { stage: i < 8 ? i === 0 ? "OFFER" : "已投递" : "待投递", jobMetadata: JobMetadataSchema.parse({ submissionChannel: "email" }) } });
    if (i < 8) records.push({ id: "s" + i, kind: "job_submissions", data: { applicationId: "a" + i, metadataSnapshot: JobMetadataSchema.parse({ submissionChannel: "email", actualSubmission: i < 7 ? { channel: i < 5 ? "company_portal" : "boss", customLabel: "", contextKey: '["合成统计",""]', confirmedAt: "2026-11-09T04:00:00.000Z" } : null, companyTags: ["banking", "large"], companyNature: "foreign_invested", discoverySource: "xiaohongshu", referralStatus: i % 2 ? "no" : "yes" }) } });
  }
  const stats = metadataStatistics(records, 5);
  assert.equal(stats.totalSubmitted, 8); assert.deepEqual(stats.channel.map((s) => [s.key, s.count, s.ratesVisible]), [["company_portal", 5, true], ["boss", 2, false], ["unknown", 1, false]]);
  assert.equal(stats.discovery[0].count, 8);
  assert.equal(metadataStatistics(records, 5, { companyTags: ["banking", "large"], tagMatch: "any" }).filteredCount, 8);
  assert.equal(metadataStatistics(records, 5, { companyTags: ["banking", "missing"], tagMatch: "all" }).filteredCount, 0);
  assert.equal(metadataStatistics(records, 5, { channel: "company_portal", referralStatus: "yes" }).filteredCount, 3);
  records.push({ id: "rev", kind: "submission_metadata_revisions", data: { applicationId: "a0", submissionId: "s0", revision: 1, metadata: JobMetadataSchema.parse({ submissionChannel: "email" }), recordedAt: "2026-11-09T04:00:00.000Z" } });
  assert.equal(metadataStatistics(records, 5).backfilledCount, 1);
  assert.equal(records.find((r) => r.id === "s0")!.data.metadataSnapshot.actualSubmission.channel, "company_portal");
});
test("backup validates profile and correction links instead of dropping fields", () => {
  const record = { id: "a", kind: "applications", data: { jobMetadata: JobMetadataSchema.parse({ companyProfileId: "missing" }) } };
  assert.throws(() => validateMetadataBackup([record]), /缺少关联/);
  validateMetadataBackup([{ ...record, data: { jobMetadata: JobMetadataSchema.parse({}) } }]);
});
