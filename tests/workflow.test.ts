import test from "node:test";
import assert from "node:assert/strict";
import { ActionTaskSchema, buildAutumnPhaseCountdowns, defaultJobSearchSettings, jobDeadlineStatus, jobFingerprint, normalizeJobCapture, normalizeJobUrl, riskForRecord } from "../lib/workflow-contracts.ts";

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

test("秋招阶段倒计时使用上海服务端日期且结束后不出现负数", () => {
  const active = buildAutumnPhaseCountdowns(defaultJobSearchSettings, new Date("2026-09-20T02:00:00Z"));
  assert.equal(active[0].daysRemaining, 25);
  assert.equal(active[0].status, "active");
  const ended = buildAutumnPhaseCountdowns(defaultJobSearchSettings, new Date("2026-12-21T02:00:00Z"));
  assert.equal(ended[2].status, "ended");
});

test("岗位截止提示区分滚动招聘与七天三级风险", () => {
  const now = new Date("2026-09-20T02:00:00Z");
  assert.equal(jobDeadlineStatus({ recruitmentMode: "滚动招聘", deadline: "2026-12-01" }, defaultJobSearchSettings, now).mode, "rolling");
  assert.equal(jobDeadlineStatus({ deadline: "2026-09-27" }, defaultJobSearchSettings, now).level, "warning");
  assert.equal(jobDeadlineStatus({ deadline: "2026-09-23" }, defaultJobSearchSettings, now).level, "critical");
});
