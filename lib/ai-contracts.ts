import { z } from "zod";

export const aiJobTypes = ["job_analysis", "resume_suggestions", "company_research", "interview_review", "foreign_interview_review", "transcription", "evaluation_case", "job_capture_url", "job_capture_image"] as const;
export const aiJobStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export const AIJobTypeSchema = z.enum(aiJobTypes);
export const AIJobStatusSchema = z.enum(aiJobStatuses);
export type AIJobType = z.infer<typeof AIJobTypeSchema>;
export type AIJobStatus = z.infer<typeof AIJobStatusSchema>;

export const RequirementSchema = z.object({
  label: z.string().min(1).max(240),
  importance: z.enum(["must", "important", "bonus"]),
  evidenceIds: z.array(z.string()).max(30),
  coverage: z.enum(["strong", "partial", "missing"]),
  reason: z.string().max(1200),
}).strict();

export const SuggestionSchema = z.object({
  issue: z.string().min(1).max(800),
  suggestion: z.string().min(1).max(1600),
  evidenceIds: z.array(z.string()).max(30),
  risk: z.string().max(800),
}).strict();

export const JobAnalysisSchema = z.object({
  summary: z.string().max(2400),
  requirements: z.array(RequirementSchema).min(1).max(40),
  suggestions: z.array(SuggestionSchema).max(30),
}).strict();

export const ResumeSuggestionSchema = z.object({
  facts: z.array(z.object({
    title: z.string().min(1).max(240),
    sourceQuote: z.string().min(1).max(1600),
    detail: z.string().max(1600),
  }).strict()).max(50),
  suggestions: z.array(z.object({
    location: z.string().min(1).max(400),
    issue: z.string().min(1).max(800),
    suggestion: z.string().min(1).max(1600),
    sourceQuotes: z.array(z.string().min(1)).min(1).max(10),
    risk: z.string().max(800),
  }).strict()).max(40),
  warnings: z.array(z.string()).max(20),
}).strict();

export const CompanyResearchFindingSchema = z.object({
  category: z.enum(["basic", "business", "prospects", "employee", "latest", "compliance", "role", "recruitment", "offer"]),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(1600),
  nature: z.enum(["fact", "inference", "review_claim"]),
  severity: z.enum(["none", "info", "watch", "high"]),
  sourceIndexes: z.array(z.number().int().nonnegative()).max(12),
  asOf: z.string().max(80),
}).strict();

export const CompanyResearchSchema = z.object({
  overview: z.string().max(2400),
  verdict: z.enum(["recommended", "proceed_with_caution", "insufficient_information", "avoid"]),
  findings: z.array(CompanyResearchFindingSchema).max(60),
  overallEvaluation: z.string().max(2400),
  applicationAdvice: z.array(z.string().max(800)).max(20),
  interviewAdvice: z.array(z.string().max(800)).max(20),
  offerAdvice: z.array(z.string().max(800)).max(20),
  risks: z.array(z.string().max(1000)).max(30),
  questions: z.array(z.string().max(800)).max(30),
  limitations: z.array(z.string().max(800)).max(20),
  confidence: z.enum(["high", "medium", "low"]),
}).strict();

export const InterviewReviewSchema = z.object({
  summary: z.string().max(2400),
  strengths: z.array(z.string()).max(30),
  gaps: z.array(z.string()).max(30),
  star: z.object({ situation: z.string(), task: z.string(), action: z.string(), result: z.string() }).strict(),
  quotes: z.array(z.string()).max(20),
  actions: z.array(z.string()).max(30),
}).strict();

export const ForeignInterviewReviewSchema = z.object({
  verdict: z.enum(["ready", "practice_more", "rewrite"]),
  technicalFeedback: z.string().max(1800),
  englishFeedback: z.string().max(1800),
  structureFeedback: z.string().max(1800),
  strengths: z.array(z.string().max(500)).max(12),
  improvements: z.array(z.string().max(500)).max(12),
  correctedAnswer: z.string().max(5000),
  vocabulary: z.array(z.object({ term: z.string().max(100), usage: z.string().max(500) }).strict()).max(20),
  followUpQuestions: z.array(z.string().max(500)).max(10),
  unsupportedClaims: z.array(z.string().max(500)).max(10),
}).strict();

export const requirementJsonSchema = {
  type: "object", additionalProperties: false, required: ["summary", "requirements", "suggestions"],
  properties: {
    summary: { type: "string" },
    requirements: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "importance", "evidenceIds", "coverage", "reason"], properties: { label: { type: "string" }, importance: { type: "string", enum: ["must", "important", "bonus"] }, evidenceIds: { type: "array", items: { type: "string" } }, coverage: { type: "string", enum: ["strong", "partial", "missing"] }, reason: { type: "string" } } } },
    suggestions: { type: "array", items: { type: "object", additionalProperties: false, required: ["issue", "suggestion", "evidenceIds", "risk"], properties: { issue: { type: "string" }, suggestion: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" } }, risk: { type: "string" } } } },
  },
};

export const resumeJsonSchema = {
  type: "object", additionalProperties: false, required: ["facts", "suggestions", "warnings"],
  properties: {
    facts: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "sourceQuote", "detail"], properties: { title: { type: "string" }, sourceQuote: { type: "string" }, detail: { type: "string" } } } },
    suggestions: { type: "array", items: { type: "object", additionalProperties: false, required: ["location", "issue", "suggestion", "sourceQuotes", "risk"], properties: { location: { type: "string" }, issue: { type: "string" }, suggestion: { type: "string" }, sourceQuotes: { type: "array", items: { type: "string" } }, risk: { type: "string" } } } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export const companyJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["overview", "verdict", "findings", "overallEvaluation", "applicationAdvice", "interviewAdvice", "offerAdvice", "risks", "questions", "limitations", "confidence"],
  properties: {
    overview: { type: "string" },
    verdict: { type: "string", enum: ["recommended", "proceed_with_caution", "insufficient_information", "avoid"] },
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["category", "title", "detail", "nature", "severity", "sourceIndexes", "asOf"], properties: {
      category: { type: "string", enum: ["basic", "business", "prospects", "employee", "latest", "compliance", "role", "recruitment", "offer"] },
      title: { type: "string" }, detail: { type: "string" }, nature: { type: "string", enum: ["fact", "inference", "review_claim"] },
      severity: { type: "string", enum: ["none", "info", "watch", "high"] }, sourceIndexes: { type: "array", items: { type: "integer", minimum: 0 } }, asOf: { type: "string" },
    } } },
    overallEvaluation: { type: "string" }, applicationAdvice: { type: "array", items: { type: "string" } }, interviewAdvice: { type: "array", items: { type: "string" } },
    offerAdvice: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } }, confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

export const interviewJsonSchema = {
  type: "object", additionalProperties: false, required: ["summary", "strengths", "gaps", "star", "quotes", "actions"],
  properties: { summary: { type: "string" }, strengths: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } }, star: { type: "object", additionalProperties: false, required: ["situation", "task", "action", "result"], properties: { situation: { type: "string" }, task: { type: "string" }, action: { type: "string" }, result: { type: "string" } } }, quotes: { type: "array", items: { type: "string" } }, actions: { type: "array", items: { type: "string" } } },
};

export const foreignInterviewJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["verdict", "technicalFeedback", "englishFeedback", "structureFeedback", "strengths", "improvements", "correctedAnswer", "vocabulary", "followUpQuestions", "unsupportedClaims"],
  properties: {
    verdict: { type: "string", enum: ["ready", "practice_more", "rewrite"] },
    technicalFeedback: { type: "string" }, englishFeedback: { type: "string" }, structureFeedback: { type: "string" },
    strengths: { type: "array", items: { type: "string" } }, improvements: { type: "array", items: { type: "string" } },
    correctedAnswer: { type: "string" },
    vocabulary: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "usage"], properties: { term: { type: "string" }, usage: { type: "string" } } } },
    followUpQuestions: { type: "array", items: { type: "string" } }, unsupportedClaims: { type: "array", items: { type: "string" } },
  },
};

export function deterministicScore(requirements: Array<z.infer<typeof RequirementSchema>>) {
  const weights = { must: 3, important: 2, bonus: 1 } as const;
  const coverage = { strong: 1, partial: 0.55, missing: 0 } as const;
  const total = requirements.reduce((sum, item) => sum + weights[item.importance], 0) || 1;
  return Math.round(requirements.reduce((sum, item) => sum + weights[item.importance] * coverage[item.coverage], 0) / total * 100);
}

export function percentile(values: number[], value: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(value * sorted.length) - 1))];
}

export function filterEvidenceIds(ids: string[], validIds: Set<string>) {
  return { valid: ids.filter((id) => validIds.has(id)), rejected: ids.filter((id) => !validIds.has(id)) };
}

export function canTransitionAIJob(from: string, to: string) {
  const transitions: Record<string, string[]> = { queued: ["running", "cancelled"], running: ["succeeded", "failed", "cancelled"], failed: ["queued", "cancelled"], cancelled: ["queued"], succeeded: [] };
  return Boolean(transitions[from]?.includes(to));
}
