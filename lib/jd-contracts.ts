import { z } from "zod";
import { JobMetadataSchema } from "./job-metadata.ts";

export const jdKinds = ["job_submissions", "jd_snapshots", "jd_extractions", "jd_requirement_edits", "resume_text_snapshots", "resume_gap_analyses", "resume_improvement_items"] as const;
export const importanceValues = ["must", "important", "bonus", "unspecified"] as const;
export const CitationSchema = z.object({ blockId: z.string().min(1), quote: z.string().min(1).max(2000) }).strict();
export const JDRequirementSchema = z.object({
  key: z.string().min(1).max(100),
  type: z.enum(["technical_skill", "business_scenario", "responsibility", "engineering_practice", "qualification"]),
  rawName: z.string().min(1).max(240), proposedName: z.string().min(1).max(240),
  importance: z.enum(importanceValues), depth: z.string().max(240),
  polarity: z.enum(["required", "not_required", "prohibited"]), condition: z.string().max(600),
  citations: z.array(CitationSchema).min(1).max(8), reviewReason: z.string().max(600),
}).strict();
export const JDExtractionSchema = z.object({
  complete: z.boolean(), requirements: z.array(JDRequirementSchema).max(100),
  groups: z.array(z.object({ key: z.string().min(1), operator: z.enum(["any", "all"]), memberKeys: z.array(z.string()).min(2).max(30), citations: z.array(CitationSchema).min(1).max(8) }).strict()).max(40),
  warnings: z.array(z.string().max(1000)).max(30),
}).strict();
const citationJson = { type: "object", additionalProperties: false, required: ["blockId", "quote"], properties: { blockId: { type: "string" }, quote: { type: "string", minLength: 1, maxLength: 2000 } } };
export const jdExtractionJsonSchema = {
  type: "object", additionalProperties: false, required: ["complete", "requirements", "groups", "warnings"],
  properties: {
    complete: { type: "boolean" },
    requirements: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["key", "type", "rawName", "proposedName", "importance", "depth", "polarity", "condition", "citations", "reviewReason"], properties: {
      key: { type: "string" }, type: { type: "string", enum: ["technical_skill", "business_scenario", "responsibility", "engineering_practice", "qualification"] },
      rawName: { type: "string" }, proposedName: { type: "string" }, importance: { type: "string", enum: importanceValues },
      depth: { type: "string" }, polarity: { type: "string", enum: ["required", "not_required", "prohibited"] },
      condition: { type: "string" }, citations: { type: "array", minItems: 1, items: citationJson }, reviewReason: { type: "string" },
    } } },
    groups: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "operator", "memberKeys", "citations"], properties: {
      key: { type: "string" }, operator: { type: "string", enum: ["any", "all"] }, memberKeys: { type: "array", minItems: 2, items: { type: "string" } }, citations: { type: "array", minItems: 1, items: citationJson },
    } } }, warnings: { type: "array", items: { type: "string" } },
  },
};
export const GapSuggestionSchema = z.object({
  key: z.string().min(1).max(100), category: z.enum(["A", "B", "C"]),
  requirementRefs: z.array(z.string().min(1)).min(1).max(100), evidenceRefs: z.array(z.string()).max(30),
  resumeQuotes: z.array(CitationSchema).max(15), resumeLocation: z.string().max(500).nullable(),
  issue: z.string().min(1).max(1600), suggestedExpression: z.string().max(2400).nullable(),
  action: z.enum(["rewrite", "add_evidence", "confirm_capability"]), questions: z.array(z.string().max(600)).max(15),
}).strict();
export const GapOutputSchema = z.object({ suggestions: z.array(GapSuggestionSchema).max(60), warnings: z.array(z.string().max(1000)).max(30) }).strict();
export const gapJsonSchema = {
  type: "object", additionalProperties: false, required: ["suggestions", "warnings"], properties: {
    suggestions: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false,
      required: ["key", "category", "requirementRefs", "evidenceRefs", "resumeQuotes", "resumeLocation", "issue", "suggestedExpression", "action", "questions"],
      properties: { key: { type: "string" }, category: { type: "string", enum: ["A", "B", "C"] }, requirementRefs: { type: "array", minItems: 1, items: { type: "string" } },
        evidenceRefs: { type: "array", items: { type: "string" } }, resumeQuotes: { type: "array", items: citationJson },
        resumeLocation: { type: ["string", "null"] }, issue: { type: "string" }, suggestedExpression: { type: ["string", "null"] },
        action: { type: "string", enum: ["rewrite", "add_evidence", "confirm_capability"] }, questions: { type: "array", items: { type: "string" } },
      } } }, warnings: { type: "array", items: { type: "string" } },
  },
};
export const dictionaryVersion = "skills-v1";
const aliases: Array<[string, string, string[]]> = [
  ["java", "Java", []], ["go", "Go", ["golang"]], ["javascript", "JavaScript", ["js"]], ["typescript", "TypeScript", ["ts"]],
  ["spring-boot", "Spring Boot", ["springboot"]], ["spring-cloud-alibaba", "Spring Cloud Alibaba", ["sca"]],
  ["mysql", "MySQL", []], ["redis", "Redis", []], ["mq", "MQ", ["消息队列", "message queue", "message queues"]],
  ["rocketmq", "RocketMQ", []], ["rabbitmq", "RabbitMQ", []], ["kafka", "Kafka", []],
  ["kubernetes", "Kubernetes", ["k8s"]], ["docker", "Docker", []], ["git", "Git", []],
  ["python", "Python", []], ["sql", "SQL", []], ["linux", "Linux", []], ["figma", "Figma", []],
  ["nacos", "Nacos", []], ["sentinel", "Sentinel", []], ["elasticsearch", "Elasticsearch", ["es"]],
];
export function canonicalSkill(name: string) {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const key = normalize(name);
  const found = aliases.find(([, label, other]) => [label, ...other].some((s) => normalize(s) === key));
  return { skillId: found?.[0] ?? "custom:" + key, skillName: found?.[1] ?? name.trim(), parentSkillId: ["rocketmq", "rabbitmq", "kafka"].includes(found?.[0] ?? "") ? "mq" : null };
}
export function textBlocks(text: string) {
  const blocks: Array<{ id: string; text: string; start: number }> = [];
  for (const match of text.matchAll(/[^\r\n]+/g)) blocks.push({ id: "p" + (blocks.length + 1), text: match[0], start: match.index! });
  return blocks;
}
export function locateCitations(text: string, citations: z.infer<typeof CitationSchema>[]) {
  const blocks = textBlocks(text);
  return citations.map((cite) => {
    const block = blocks.find((b) => b.id === cite.blockId);
    if (!block) throw new Error("引用段落不存在：" + cite.blockId);
    const at = block.text.indexOf(cite.quote);
    if (at < 0 || block.text.indexOf(cite.quote, at + 1) !== -1) throw new Error("引用原文不存在或位置不唯一");
    const start = block.start + at;
    return { ...cite, start, end: start + cite.quote.length };
  });
}
export type ValidRequirement = z.infer<typeof JDRequirementSchema> & ReturnType<typeof canonicalSkill> & { requirementId: string; citations: ReturnType<typeof locateCitations>; anyGroup: boolean };
export function validateExtraction(raw: unknown, text: string, extractionId: string) {
  const output = JDExtractionSchema.parse(raw);
  if (!output.complete) throw new Error("提取不完整，不能进入统计");
  const keys = new Set(output.requirements.map((r) => r.key));
  if (keys.size !== output.requirements.length) throw new Error("要求标识重复");
  if (new Set(output.groups.map((g) => g.key)).size !== output.groups.length) throw new Error("条件组标识重复");
  const groups = output.groups.map((g) => {
    if (new Set(g.memberKeys).size !== g.memberKeys.length || g.memberKeys.some((k) => !keys.has(k))) throw new Error("条件组引用无效");
    return { ...g, citations: locateCitations(text, g.citations) };
  });
  const requirements: ValidRequirement[] = output.requirements.map((r) => ({
    ...r, ...canonicalSkill(r.proposedName), requirementId: extractionId + ":" + r.key,
    citations: locateCitations(text, r.citations), anyGroup: groups.some((g) => g.operator === "any" && g.memberKeys.includes(r.key)),
  }));
  return { ...output, requirements, groups, dictionaryVersion };
}
export function validateGap(raw: unknown, input: { requirements: Array<{ requirementId: string }>; evidence: Array<{ id: string; [key: string]: unknown }>; resumeText: string }) {
  const output = GapOutputSchema.parse(raw);
  const reqs = new Set(input.requirements.map((r) => r.requirementId));
  const facts = new Set(input.evidence.map((e) => e.id));
  if (new Set(output.suggestions.map((s) => s.key)).size !== output.suggestions.length) throw new Error("建议标识重复");
  for (const s of output.suggestions) {
    if (s.requirementRefs.some((id) => !reqs.has(id)) || s.evidenceRefs.some((id) => !facts.has(id))) throw new Error("建议引用无效");
    locateCitations(input.resumeText, s.resumeQuotes);
    if (s.category === "A" && !s.evidenceRefs.length) throw new Error("A 类建议必须有已确认事实");
    if (s.category === "B" && !s.resumeQuotes.length) throw new Error("B 类建议必须引用简历原文");
    if (s.category === "C" && (s.suggestedExpression !== null || s.action !== "confirm_capability" || !s.questions.length)) throw new Error("C 类只能请求确认，不能生成经历");
    if (s.suggestedExpression && !s.evidenceRefs.length && !s.resumeQuotes.length) throw new Error("表达建议缺少个人证据");
    if (s.suggestedExpression) {
      const personalQuotes = [...s.resumeQuotes.map((q) => q.quote), ...input.evidence.filter((e) => s.evidenceRefs.includes(e.id)).flatMap((e) => Object.entries(e).filter(([key,value]) => key !== "id" && typeof value === "string").map(([,value]) => String(value)))];
      if (!personalQuotes.some((quote) => quote.includes(s.suggestedExpression!))) throw new Error("建议表达只能摘录引用的个人原文，请改为修改方向与待补问题");
    }
  }
  return output;
}
export type ProfileSample = { id: string; sourceEntryId: string; data: Record<string, unknown>; requirements: ValidRequirement[]; extractionId: string | null };
export function skillStatistics(samples: ProfileSample[]) {
  const unique = [...new Map(samples.map((s) => [s.sourceEntryId, s])).values()];
  const valid = unique.filter((s) => s.extractionId !== null);
  const skills = new Map<string, { skillId: string; name: string; count: number; optionalCount: number; conditionalCount: number; importance: Record<typeof importanceValues[number], number>; sources: Array<{ snapshotId: string; requirementIds: string[]; company: unknown; role: unknown }>; weight: number }>();
  for (const sample of valid) {
    const perSkill = new Map<string, ValidRequirement[]>();
    for (const r of sample.requirements.filter((r) => r.polarity === "required" && !r.reviewReason)) {
      for (const id of [r.skillId, ...(r.parentSkillId ? [r.parentSkillId] : [])]) perSkill.set(id, [...(perSkill.get(id) ?? []), r]);
    }
    for (const [id, reqs] of perSkill) {
      const skill = skills.get(id) ?? { skillId: id, name: id === "mq" ? "MQ" : reqs[0].skillName, count: 0, optionalCount: 0, conditionalCount: 0, importance: { must: 0, important: 0, bonus: 0, unspecified: 0 }, sources: [], weight: 0 };
      skill.count++;
      const direct = reqs.filter((r) => !r.anyGroup && !r.condition);
      if (!direct.length && reqs.some((r) => r.anyGroup)) skill.optionalCount++;
      if (!direct.length && reqs.some((r) => Boolean(r.condition))) skill.conditionalCount++;
      if (direct.length) {
        const level = importanceValues.find((value) => direct.some((r) => r.importance === value))!;
        skill.importance[level]++; skill.weight += { must: 3, important: 2, bonus: 1, unspecified: 0 }[level];
      }
      skill.sources.push({ snapshotId: sample.id, requirementIds: reqs.map((r) => r.requirementId), company: sample.data.company, role: sample.data.role });
      skills.set(id, skill);
    }
  }
  return { total: unique.length, valid: valid.length, missing: unique.filter((s) => !String(s.data.jdText ?? "").trim()).length,
    pending: unique.filter((s) => String(s.data.jdText ?? "").trim() && !s.extractionId).length,
    pendingRequirements: valid.reduce((n, s) => n + s.requirements.filter((r) => Boolean(r.reviewReason)).length, 0),
    skills: [...skills.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((s) => ({ ...s, ratio: valid.length >= 5 ? s.count / valid.length : null })),
  };
}

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const iso = z.string().datetime();
export const SnapshotDataSchema = z.object({
  sourceEntryId: id, applicationId: z.string(), savedJobId: z.string(), submissionId: z.string(),
  revision: z.number().int().positive(), previousSnapshotId: z.string().nullable(), captureReason: z.enum(["submitted", "late_entry", "correction", "saved_capture"]),
  company: z.string(), role: z.string(), direction: z.string(), location: z.string(), companyType: z.string(),
  jdText: z.string().max(30000), sourceUrl: z.string().max(2000), screenshotFileId: z.string(),
  jdSha256: hash, snapshotPayloadSha256: hash, capturedAt: iso, appliedAt: iso.nullable(),
  appliedAtStatus: z.enum(["known", "unknown"]), resumeFileId: z.string().nullable(), resumeFileVersion: z.number().int().nullable(),
  resumeSha256: hash.nullable(), resumeDisplayName: z.string(), resumeReferenceStatus: z.enum(["available", "not_recorded", "deleted"]),
  contentStatus: z.enum(["available", "missing"]), correctionReason: z.string(), activeExtractionId: z.string().nullable(),
  ignored: z.boolean(), deletionBatchId: z.string().optional(), deletedFileIds: z.array(z.string()).optional(), deletedSourceIds: z.array(z.string()).optional(),
}).strict();
export const SubmissionDataSchema = z.object({ applicationId: id, sourceEntryId: id, snapshotId: id, appliedAt: iso.nullable(), operationId: z.string(), resumeFileId: z.string().nullable(), resumeSha256: hash.nullable(), metadataSnapshot: JobMetadataSchema.optional(), metadataRecordedAt: iso.optional(), deletionBatchId: z.string().optional() }).strict();
export const ExtractionDataSchema = z.object({ snapshotId: id, sourceEntryId: id, aiJobId: id, rawOutput: JDExtractionSchema,
  output: z.object({ complete: z.literal(true), requirements: z.array(JDRequirementSchema.extend({ citations: z.array(CitationSchema.extend({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict()) }).passthrough()), groups: z.array(z.record(z.string(), z.unknown())), warnings: z.array(z.string()), dictionaryVersion: z.string() }).strict(),
  deletionBatchId: z.string().optional(),
}).strict();
export const EditDataSchema = z.object({ extractionId: id, snapshotId: id, sourceEntryId: id, requirementKey: id, revision: z.number().int().positive(), patch: z.object({
  proposedName: z.string().min(1).max(240).optional(), type: JDRequirementSchema.shape.type.optional(), importance: z.enum(importanceValues).optional(), ignored: z.boolean().optional(), reviewReason: z.string().max(600).optional(),
}).strict(), reason: z.string().min(1).max(1000), deletionBatchId: z.string().optional() }).strict();
export const TextSnapshotSchema = z.object({ fileId: id, fileVersion: z.number().int().positive(), fileSha256: hash, text: z.string().min(1).max(200000),
  method: z.enum(["docx_local", "qwen_document"]), confirmedAt: iso.nullable(), aiJobId: z.string(), deletionBatchId: z.string().optional(),
}).strict();
export const ImprovementSchema = z.object({ analysisId: id, aiJobId: id, suggestion: GapSuggestionSchema, targetResumeFileId: id,
  status: z.enum(["pending", "accepted", "completed", "ignored"]), capabilityDecision: z.enum(["unknown", "has_evidence", "needs_practice"]),
  taskId: z.string().nullable(), resultResumeFileId: z.string().nullable(), resultResumeSha256: hash.nullable(), deletionBatchId: z.string().optional(),
}).strict();
export const GapAnalysisDataSchema = z.object({ aiJobId: id, input: z.record(z.string(), z.unknown()), output: GapOutputSchema, deletionBatchId: z.string().optional() }).strict();
export const jdDataSchemas: Record<string, z.ZodTypeAny> = {
  job_submissions: SubmissionDataSchema, jd_snapshots: SnapshotDataSchema, jd_extractions: ExtractionDataSchema,
  jd_requirement_edits: EditDataSchema, resume_text_snapshots: TextSnapshotSchema, resume_gap_analyses: GapAnalysisDataSchema, resume_improvement_items: ImprovementSchema,
};
