import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionAIJob, deterministicScore, filterEvidenceIds, InterviewReviewSchema, JobAnalysisSchema, percentile } from "../lib/ai-contracts.ts";

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
