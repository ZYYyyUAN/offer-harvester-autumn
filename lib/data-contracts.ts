import { z } from "zod";
import { DefaultSubmissionResumeSchema } from "./submission-intake-contracts.ts";
import { ApplicationClosureSchema } from "./application-closure.ts";
import { ActionTaskSchema } from "./workflow-contracts.ts";
import { jdDataSchemas } from "./jd-contracts.ts";
import { JobMetadataSchema, metadataDataSchemas } from "./job-metadata.ts";

const text = (max = 4000) => z.string().max(max).default("");
const optionalDate = z.string().max(40).default("");
const checklistValue = z.union([
  z.boolean(),
  z.object({ done: z.boolean(), at: z.string().max(40).nullable().optional() }).passthrough(),
]);

export const ProfileDataSchema = z.object({
  defaultSubmissionResume: DefaultSubmissionResumeSchema.optional(),
  name: text(120), phone: text(80), email: z.string().email().or(z.literal("")), city: text(120),
  jobStatus: text(80), availableDate: optionalDate, targetRoles: text(500), targetIndustries: text(500),
  targetCities: text(500), expectedSalary: text(240), education: text(12000), experience: text(20000),
  projects: text(20000), skills: text(4000), bio: text(12000), avatarFileId: text(120),
  jobSearchSettings: z.record(z.string(), z.unknown()).default({}), foreignPrep: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export const ApplicationDataSchema = z.object({
  appliedAt: z.string().datetime().or(z.literal("")).nullable().optional(),
  appliedAtStatus: z.enum(["known","unknown"]).optional(),
  intakeDraftId: z.string().uuid().optional(),
  closure: ApplicationClosureSchema.nullable().optional(),
  jobMetadata: JobMetadataSchema.optional(),
  company: z.string().trim().min(1).max(240), role: z.string().trim().min(1).max(240), direction: text(240),
  location: text(240), salary: text(240), sourceUrl: text(2000), jd: text(30000), notes: text(12000),
  stage: z.enum(["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"]).default("待投递"),
  priority: z.enum(["高", "普通", "低"]).default("普通"),
  recruitmentMode: z.enum(["自动判断", "滚动招聘", "固定截止"]).default("自动判断"),
  deadline: optionalDate, channel: text(240), contactName: text(240), contactRole: text(240), contactValue: text(500),
  lastContactAt: optionalDate, nextFollowUpAt: optionalDate, resumeId: text(120), resumeName: text(500),
  checklist: z.record(z.string(), checklistValue).default({}),
}).passthrough();

export const SavedJobDataSchema = z.object({
  jobMetadata: JobMetadataSchema.optional(),
  company: z.string().trim().max(240).default(""), role: z.string().trim().max(240).default(""), location: text(240), salary: text(240), deadline: optionalDate,
  jd: text(30000), sourceUrl: text(2000), notes: text(12000), screenshotFileId: text(120),
  recruitmentMode: z.enum(["自动判断", "滚动招聘", "固定截止"]).default("自动判断"),
  priority: z.enum(["高", "普通", "低"]).default("普通"),
}).passthrough().refine((data) => [data.company, data.role, data.jd, data.sourceUrl, data.screenshotFileId].some((value) => Boolean(value.trim())), { message: "请至少保存岗位链接、截图或一项岗位信息" });

export const EvidenceDataSchema = z.object({
  title: z.string().trim().min(1).max(240), source: text(500), status: z.enum(["confirmed", "draft"]).default("draft"),
  context: z.string().trim().min(1).max(12000), action: z.string().trim().min(1).max(12000), result: text(12000),
  skills: z.array(z.string().max(120)).max(100).default([]), sourceResumeId: text(120), sourceQuote: text(4000),
}).passthrough();

export const InterviewDataSchema = z.object({
  company: z.string().trim().min(1).max(240), role: z.string().trim().min(1).max(240), round: text(120),
  scheduledAt: optionalDate, jd: text(30000), notes: text(12000), transcript: text(100000),
}).passthrough();

export const OfferDataSchema = z.object({
  company: z.string().trim().min(1).max(240), role: z.string().trim().min(1).max(240), city: text(240),
  baseMonthly: z.number().min(0).max(10_000_000).default(0), months: z.number().min(0).max(36).default(12),
  bonus: z.number().min(0).max(100_000_000).default(0), equity: z.number().min(0).max(100_000_000).default(0),
  allowance: z.number().min(0).max(100_000_000).default(0), growth: z.number().min(0).max(10).default(0),
  platform: z.number().min(0).max(10).default(0), balance: z.number().min(0).max(10).default(0),
  outlook: z.number().min(0).max(10).default(0), commute: text(240), hours: text(240), deadline: optionalDate, risk: text(12000),
}).passthrough();

export const ReminderDataSchema = z.object({
  title: z.string().trim().min(1).max(240), type: z.enum(["网申截止", "笔试", "面试", "OFFER 截止", "跟进", "其他"]).default("其他"),
  dueAt: z.string().min(1).max(40), durationMinutes: z.number().int().min(0).max(1440).default(60), notes: text(4000),
}).passthrough();

const schemas: Record<string, z.ZodTypeAny> = {
  ...metadataDataSchemas,
  ...jdDataSchemas,
  applications: ApplicationDataSchema,
  saved_jobs: SavedJobDataSchema,
  evidence: EvidenceDataSchema,
  interviews: InterviewDataSchema,
  offers: OfferDataSchema,
  reminders: ReminderDataSchema,
  tasks: ActionTaskSchema,
};

const LegacyApplicationReadSchema = ApplicationDataSchema.omit({stage:true}).extend({stage:z.string().max(120).nullish()});
export function validateRecordData(kind: string, data: Record<string, unknown>, options: { preserveLegacyStage?: boolean } = {}) {
  const schema = kind === "applications" && options.preserveLegacyStage ? LegacyApplicationReadSchema : schemas[kind];
  const parsed = schema ? schema.parse(data) as Record<string, unknown> : data;
  if (kind === "applications" && parsed.appliedAtStatus && parsed.appliedAtStatus !== (parsed.appliedAt ? "known" : "unknown")) throw new z.ZodError([{code:"custom",message:"实际投递时间与未知状态不一致",path:["appliedAtStatus"]}]);
  return parsed;
}
