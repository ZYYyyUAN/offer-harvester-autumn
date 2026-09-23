import test from "node:test";
import assert from "node:assert/strict";
import { ApplicationDataSchema, EvidenceDataSchema, OfferDataSchema, ProfileDataSchema, validateRecordData } from "../lib/data-contracts.ts";
import { safeArchiveName, sha256Hex, trashRetention } from "../lib/data-safety.ts";

test("个人资料与核心记录执行完整 Schema 校验", () => {
  const profile = ProfileDataSchema.parse({ name: "张同学", email: "student@example.com" });
  assert.equal(profile.targetRoles, "");
  assert.throws(() => ProfileDataSchema.parse({ email: "not-an-email" }));
  assert.throws(() => validateRecordData("applications", { company: "", role: "后端开发" }));
  assert.throws(() => EvidenceDataSchema.parse({ title: "并发优化", context: "", action: "压测" }));
  assert.throws(() => OfferDataSchema.parse({ company: "A", role: "Java", growth: 11 }));
});

test("投递清单兼容本地审计对象与飞书布尔值", () => {
  const base = { company: "示例公司", role: "Java 后端" };
  assert.equal(ApplicationDataSchema.parse({ ...base, checklist: { submitted: true } }).checklist.submitted, true);
  const audited = ApplicationDataSchema.parse({ ...base, checklist: { submitted: { done: true, at: "2026-09-22T10:00:00.000Z" } } });
  assert.deepEqual(audited.checklist.submitted, { done: true, at: "2026-09-22T10:00:00.000Z" });
});

test("附件归档名称不可越界且哈希稳定", async () => {
  const row = { id: "../resume-1", purpose: "resume/../../", filename: "../../简历.PDF" };
  const archiveName = safeArchiveName(row);
  assert.equal(archiveName.includes(".."), false);
  assert.match(archiveName, /^[a-z0-9_-]+\/[a-z0-9_-]+\.pdf$/i);
  const source = new TextEncoder().encode("offer-harvester");
  assert.equal(await sha256Hex(source.buffer), "85d51694758b9cbb8c3effc27a57f8a7c055024089230d30b38ac9837fb1d904");
});

test("回收站保留天数不会变成负数", () => {
  const now = new Date("2026-09-22T00:00:00.000Z");
  assert.equal(trashRetention("2026-09-21T00:00:00.000Z", now).daysRemaining, 29);
  assert.equal(trashRetention("2026-08-01T00:00:00.000Z", now).daysRemaining, 0);
  assert.equal(trashRetention(null, now).expiresAt, null);
});
