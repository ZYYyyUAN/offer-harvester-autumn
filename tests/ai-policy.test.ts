import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionAIJob, CompanyResearchSchema, deterministicScore, filterEvidenceIds, ForeignInterviewReviewSchema, InterviewReviewSchema, JobAnalysisSchema, percentile } from "../lib/ai-contracts.ts";

test("deterministic score follows published weights", () => {
  const score = deterministicScore([
    { label: "SQL", importance: "must", evidenceIds: ["e1"], coverage: "strong", reason: "confirmed" },
    { label: "English", importance: "important", evidenceIds: [], coverage: "missing", reason: "missing" },
    { label: "Python", importance: "bonus", evidenceIds: ["e2"], coverage: "partial", reason: "partial" },
  ]);
  assert.equal(score, 59);
});

test("invalid evidence ids are rejected", () => {
  assert.deepEqual(filterEvidenceIds(["e1", "fake", "e2"], new Set(["e1", "e2"])), { valid: ["e1", "e2"], rejected: ["fake"] });
});

test("AI state machine blocks late success after cancellation", () => {
  assert.equal(canTransitionAIJob("running", "cancelled"), true);
  assert.equal(canTransitionAIJob("cancelled", "succeeded"), false);
  assert.equal(canTransitionAIJob("failed", "queued"), true);
});

test("schemas reject unknown fields and malformed quotes", () => {
  assert.equal(JobAnalysisSchema.safeParse({ summary: "ok", requirements: [{ label: "SQL", importance: "must", evidenceIds: [], coverage: "missing", reason: "none" }], suggestions: [], invented: true }).success, false);
  assert.equal(InterviewReviewSchema.safeParse({ summary: "ok", strengths: [], gaps: [], star: { situation: "", task: "", action: "", result: "" }, quotes: [3], actions: [] }).success, false);
});

test("percentile is stable for small samples", () => {
  assert.equal(percentile([10, 40, 20, 30], 0.5), 20);
  assert.equal(percentile([10, 40, 20, 30], 0.95), 40);
});

test("company research keeps stage-specific findings and rejects untraceable shapes", () => {
  const base = {
    overview: "基于公开来源的摘要", verdict: "proceed_with_caution",
    findings: [{ category: "basic", title: "经营状态", detail: "存续", nature: "fact", severity: "none", sourceIndexes: [0], asOf: "2026-09-20" }],
    overallEvaluation: "可以继续核查", applicationAdvice: ["先确认主体"], interviewAdvice: ["询问业务线"], offerAdvice: ["核对签约主体"], risks: [], questions: ["签约主体是什么？"], limitations: [], confidence: "medium",
  };
  const valid = CompanyResearchSchema.safeParse(base);
  assert.equal(valid.success, true);
  assert.equal(CompanyResearchSchema.safeParse({ ...base, findings: [{ category: "basic", title: "经营状态", detail: "存续", nature: "fact", severity: "none", sourceIndexes: ["0"], asOf: "" }] }).success, false);
  assert.equal(CompanyResearchSchema.safeParse({ ...base, preciseScore: 91 }).success, false);
});

test("foreign interview review requires auditable unsupported-claim output", () => {
  const valid = { verdict: "practice_more", technicalFeedback: "需要补充边界条件", englishFeedback: "表达清楚", structureFeedback: "先结论后解释", strengths: [], improvements: ["补充复杂度"], correctedAnswer: "I would first clarify the requirements.", vocabulary: [{ term: "trade-off", usage: "Explain the trade-off." }], followUpQuestions: ["How would you test it?"], unsupportedClaims: [] };
  assert.equal(ForeignInterviewReviewSchema.safeParse(valid).success, true);
  assert.equal(ForeignInterviewReviewSchema.safeParse({ ...valid, unsupportedClaims: "none" }).success, false);
  assert.equal(ForeignInterviewReviewSchema.safeParse({ ...valid, score: 100 }).success, false);
});
