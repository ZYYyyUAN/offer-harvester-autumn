import test from "node:test";
import assert from "node:assert/strict";
import { ActionTaskSchema, defaultJobSearchSettings, jobFingerprint, normalizeJobUrl, riskForRecord } from "../lib/workflow-contracts.ts";

test("岗位链接判重会移除常见追踪参数", () => {
  assert.equal(normalizeJobUrl("https://example.com/job/1/?utm_source=a&spm=2"), "https://example.com/job/1");
  assert.equal(jobFingerprint({ sourceUrl: "https://example.com/job/1?utm_campaign=x" }), "url:https://example.com/job/1");
});

test("无链接岗位使用公司岗位地点构造稳定指纹", () => {
  assert.equal(jobFingerprint({ company: "示例 科技", role: "产品经理", location: "杭州" }), jobFingerprint({ company: "示例科技", role: "产品经理", location: "杭州" }));
});

test("风险规则识别临近截止与停滞投递", () => {
  const now = new Date("2026-09-19T00:00:00Z");
  assert.equal(riskForRecord("applications", { deadline: "2026-09-20" }, "2026-09-19", defaultJobSearchSettings, now)?.level, "high");
  assert.match(riskForRecord("applications", { stage: "已投递" }, "2026-09-01", defaultJobSearchSettings, now)?.reason || "", /无更新/);
});

test("AI 行动任务结构要求来源字段", () => {
  const result = ActionTaskSchema.parse({ title: "补充项目数据", category: "evidence", createdBy: "ai", aiJobId: "job", sourceRefs: [{ type: "evidence", id: "e1" }] });
  assert.equal(result.status, "todo");
  assert.equal(result.sourceRefs.length, 1);
});
