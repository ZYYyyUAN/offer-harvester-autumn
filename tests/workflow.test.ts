import test from "node:test";
import assert from "node:assert/strict";
import { ActionTaskSchema, defaultJobSearchSettings, jobFingerprint, normalizeJobCapture, normalizeJobUrl, riskForRecord } from "../lib/workflow-contracts.ts";

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

test("岗位提取会把供应商空值和别名规范成稳定结构", () => {
  const result = normalizeJobCapture({ company: null, position_title: "AI 产品经理", source_url: "https://example.com/job", evidence: { page_raw_text_retrieved: "校园招聘" }, warnings: ["页面需要脚本渲染"], extraction_status: "failed_no_content" });
  assert.equal(result.company, "");
  assert.equal(result.role, "AI 产品经理");
  assert.equal(result.sourceUrl, "https://example.com/job");
  assert.equal(result.evidence[0].quote, "校园招聘");
});
