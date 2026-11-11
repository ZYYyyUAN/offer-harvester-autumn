import { z } from "zod";
import { JobMetadataSchema, SubmissionChannelSchema } from "./job-metadata.ts";

export const SubmissionResumeIdentitySchema = z.object({ fileId: z.string().uuid(), version: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/i).toLowerCase() }).strict();
export const DefaultSubmissionResumeSchema = SubmissionResumeIdentitySchema.nullable();
export const IntakeConfirmationV2Schema = z.object({
  requestVersion: z.literal(2), draftVersion: z.number().int().positive(), operationKey: z.string().uuid(), intent: z.enum(["submitted", "saved_only"]),
  allowDuplicate: z.boolean().default(false),
  values: z.object({
    company: z.string().trim().max(240).default(""), role: z.string().trim().max(240).default(""), direction: z.string().max(240).default(""),
    sourceUrl: z.url({ protocol: /^https?$/ }).max(2000).or(z.literal("")).default(""),
    location: z.string().max(240).default(""), salary: z.string().max(240).default(""), deadline: z.string().max(40).default(""),
    jd: z.string().max(30000).default(""), notes: z.string().max(12000).default(""), screenshotFileId: z.string().uuid().or(z.literal("")).default(""),
    priority: z.enum(["高", "普通", "低"]).default("普通"), recruitmentMode: z.enum(["自动判断", "滚动招聘", "固定截止"]).default("自动判断"),
  }).strict(),
  submission: z.object({
    appliedAt: z.string().datetime().nullable(), appliedAtStatus: z.enum(["known", "unknown"]), resumeSelection: SubmissionResumeIdentitySchema.nullable(),
    actualChannel: z.object({ value: SubmissionChannelSchema, customLabel: z.string().max(240).default("") }).strict(),
  }).strict(), jobMetadata: JobMetadataSchema,
}).strict().superRefine((input, context) => {
  if (input.submission.appliedAtStatus !== (input.submission.appliedAt ? "known" : "unknown")) context.addIssue({code:"custom",message:"实际投递日期与未知状态不一致",path:["submission","appliedAtStatus"]});
  if (input.intent === "submitted" && (!input.values.company || !input.values.role)) context.addIssue({code:"custom",message:"已投记录需要公司和岗位名称",path:["values"]});
});
export type IntakeConfirmationV2 = z.infer<typeof IntakeConfirmationV2Schema>;

// Confirmation timestamps and UI suggestion bookkeeping are not user intent.
export function intakeSemanticPayload(input: IntakeConfirmationV2) {
  const metadata = input.jobMetadata;
  return { intent: input.intent, values: input.values, submission: input.intent === "submitted" ? input.submission : null,
    classification: { companyProfileId: metadata.companyProfileId, companyNature: metadata.companyNature, companyTags: [...metadata.companyTags].sort(), employmentType: metadata.employmentType, referralStatus: metadata.referralStatus, referralCode: metadata.referralCode } };
}
