import { z } from "zod";

export const natureLabels = { state_owned: "国企", private: "民企", foreign_invested: "外商投资", public_institution: "事业单位", other: "其他", unknown: "未知" } as const;
export const employmentLabels = { direct_hire: "直接招聘", outsourced: "外包", labor_dispatch: "派遣", unknown: "未知" } as const;
export const channelLabels = { company_portal: "企业网申", boss: "BOSS直聘", liepin: "猎聘", zhaopin: "智联招聘", "51job": "前程无忧", lagou: "拉勾", shixiseng: "实习僧", nowcoder: "牛客", linkedin: "LinkedIn", xiaohongshu: "小红书", maimai: "脉脉", campus_portal: "学校就业平台", email: "邮件", offline_event: "线下招聘会", friend: "朋友推荐", other: "其他", unknown: "未知" } as const;
export const tagLabels = { banking: "银行", internet: "互联网", manufacturing: "制造", healthcare: "医疗", startup: "初创", large: "大厂（个人标签）", mid: "中厂（个人标签）" } as const;
export const discoveryLabels = { ...channelLabels, company_portal: "企业官网", campus_portal: "学校就业网", offline_event: "宣讲会 / 招聘会" } as const;
export const platformLabels: Record<string, string> = { greenhouse_ats: "企业网申托管系统（Greenhouse）", feishu_ats: "企业网申托管系统（飞书招聘，与飞书同步连接无关）", moka_ats: "企业网申托管系统（Moka）", ...channelLabels };
const screenshotBrands: Record<string, string> = { boss: "BOSS直聘", xiaohongshu: "小红书", maimai: "脉脉", nowcoder: "牛客", liepin: "猎聘", zhaopin: "智联招聘", "51job": "前程无忧", lagou: "拉勾", shixiseng: "实习僧", linkedin: "LinkedIn" };
export const metadataRuleVersion = "job-metadata-v2";
export const metadataFields = ["companyNature", "companyTags", "employmentType", "linkPlatform", "discoverySource", "submissionChannel", "referralStatus", "referralCode"] as const;
export type MetadataField = typeof metadataFields[number];
const NatureSchema = z.enum(Object.keys(natureLabels) as [keyof typeof natureLabels, ...Array<keyof typeof natureLabels>]);
const ChannelSchema = z.enum(Object.keys(channelLabels) as [keyof typeof channelLabels, ...Array<keyof typeof channelLabels>]);
export const SubmissionChannelSchema = ChannelSchema.exclude(["friend", "xiaohongshu", "maimai"]);
const MetadataContextSchema = z.string().max(3000).refine((value) => {
  try { const pair: unknown = JSON.parse(value); return Array.isArray(pair) && pair.length === 2 && pair.every((item) => typeof item === "string"); }
  catch { return false; }
}, "分类上下文无效");
export const MetadataValueSchema = z.union([z.string().max(500), z.array(z.string().min(1).max(100)).max(30)]);
export const MetadataEvidenceSchema = z.object({
  sourceType: z.enum(["manual", "confirmed_profile", "url_rule", "page_explicit", "ocr_explicit", "ai_inference", "legacy"]),
  sourceRef: z.string().max(2000), quote: z.string().max(2000), obtainedAt: z.string().datetime(), version: z.string().max(120),
  contextKey: MetadataContextSchema, profileVersion: z.number().int().positive().optional(),
  additionalQuotes: z.array(z.string().min(1).max(2000)).max(20).optional(),
  ruleVersion: z.string().max(120).optional(),
  sourceDeleted: z.boolean().optional(),
}).strict();
export const MetadataSuggestionSchema = z.object({ field: z.enum(metadataFields), value: MetadataValueSchema, evidence: MetadataEvidenceSchema, status: z.enum(["suggested", "accepted", "rejected", "stale"]).default("suggested") }).strict();
export const FieldStateSchema = z.object({
  status: z.enum(["unset", "suggested", "confirmed", "manual", "cleared", "rejected", "needs_review"]),
  evidence: MetadataEvidenceSchema.optional(), contextKey: MetadataContextSchema,
  rejectedValues: z.array(MetadataValueSchema).max(100).default([]), confirmedAt: z.string().datetime().optional(),
}).strict().superRefine((state, context) => {
  if (["suggested", "confirmed", "manual", "cleared"].includes(state.status) && !state.evidence) context.addIssue({ code: "custom", message: "字段状态缺少来源依据", path: ["evidence"] });
  if (["manual", "cleared"].includes(state.status) && state.evidence?.sourceType !== "manual") context.addIssue({ code: "custom", message: "人工填写或清空必须记录为人工来源", path: ["evidence", "sourceType"] });
});
export const JobMetadataSchema = z.object({
  schemaVersion: z.literal(1).default(1), companyProfileId: z.string().max(200).nullable().default(null),
  companyProfileCandidate: z.object({ id: z.string().uuid(), version: z.number().int().positive(), legalName: z.string().max(240), identityBasis: z.enum(["exact_name", "confirmed_alias"]), contextKey: MetadataContextSchema }).nullable().default(null),
  profileRejections: z.array(z.object({ id: z.string().uuid(), contextKey: MetadataContextSchema }).strict()).max(100).default([]),
  companyNature: NatureSchema.default("unknown"), companyTags: z.array(z.string().min(1).max(100)).max(30).default([]),
  employmentType: z.enum(Object.keys(employmentLabels) as [keyof typeof employmentLabels, ...Array<keyof typeof employmentLabels>]).default("unknown"),
  linkPlatform: z.string().max(120).default("unknown"), discoverySource: ChannelSchema.default("unknown"), submissionChannel: SubmissionChannelSchema.default("unknown"),
  referralStatus: z.enum(["yes", "no", "unknown"]).default("unknown"), referralCode: z.string().max(240).default(""),
  actualSubmission: z.object({ channel: SubmissionChannelSchema, customLabel: z.string().max(240).default(""), contextKey: MetadataContextSchema, confirmedAt: z.string().datetime() }).nullable().default(null),
  customLabels: z.object({ discoverySource: z.string().max(240).default(""), submissionChannel: z.string().max(240).default("") }).prefault({}),
  fieldStates: z.partialRecord(z.enum(metadataFields), FieldStateSchema).prefault({}), suggestions: z.array(MetadataSuggestionSchema).max(100).default([]),
  legacy: z.object({ companyType: z.string().max(500).default(""), channel: z.string().max(500).default(""), migratedAt: z.string().datetime().optional() }).prefault({}),
}).strict();
export type JobMetadata = z.infer<typeof JobMetadataSchema>;
export type MetadataSuggestion = z.infer<typeof MetadataSuggestionSchema>;
export const CompanyProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(240), registryId: z.string().max(100).default(""),
  confirmedAliases: z.array(z.string().min(1).max(240)).max(30).default([]),
  companyNature: NatureSchema.default("unknown"), companyTags: z.array(z.string().min(1).max(100)).max(30).default([]),
  evidence: z.array(MetadataEvidenceSchema).max(30).default([]), researchRecordId: z.string().max(200).default(""),
  confirmedAt: z.string().datetime(), deletionBatchId: z.string().optional(),
}).strict();
export const MetadataRevisionSchema = z.object({
  applicationId: z.string().min(1), submissionId: z.string().min(1), revision: z.number().int().positive(), previousRevisionId: z.string().nullable(),
  metadata: JobMetadataSchema, reason: z.string().trim().min(1).max(1000), recordedAt: z.string().datetime(), deletionBatchId: z.string().optional(),
}).strict();
export const CaptureDraftSchema = z.object({
  values: z.record(z.string(), z.unknown()), metadata: JobMetadataSchema, extractionJobId: z.string().uuid().or(z.literal("")).default(""),
  confirmedSavedJobId: z.string().nullable().default(null), deletionBatchId: z.string().optional(),
}).strict();
export const metadataKinds = ["company_profiles", "job_capture_drafts", "submission_metadata_revisions", "metadata_migrations"] as const;
const MetadataMigrationSchema = z.object({
  entries: z.array(z.object({ id: z.string().uuid(), kind: z.enum(["applications", "saved_jobs"]), title: z.string().max(240), version: z.number().int().positive(), metadata: JobMetadataSchema, suggestions: z.array(MetadataSuggestionSchema).max(100), warning: z.string().max(2000) }).strict()).max(20000),
  status: z.enum(["preview", "committed"]), expiresAt: z.string().datetime(), migrated: z.number().int().nonnegative().optional(), deletionBatchId: z.string().optional(),
}).strict();
export const metadataDataSchemas: Record<string, z.ZodTypeAny> = { company_profiles: CompanyProfileSchema, job_capture_drafts: CaptureDraftSchema, submission_metadata_revisions: MetadataRevisionSchema, metadata_migrations: MetadataMigrationSchema };

export function metadataContext(company: string, sourceUrl: string) {
  return JSON.stringify([company.trim(), sourceUrl.trim()]);
}
function hasPositivePhrase(text: string, expression: RegExp) {
  for (const match of text.matchAll(new RegExp(expression.source, expression.flags + "g"))) {
    if (!/(?:并非|不是|不属于|不为|不采用|不提供|无需|非|not(?:\s+an?)?)\s*$/i.test(text.slice(0, match.index))) return true;
  }
  return false;
}
export function explicitClassificationClue(clue: { field: string; value: string; quote: string }, company: string) {
  if (!clue.quote.trim() || clue.quote.trim() === company.trim()) return false;
  const nature: Record<string, RegExp> = {
    state_owned: /国有企业|国企|国有独资|国有控股|state[- ]owned/i,
    private: /民营企业|私营企业|民营公司|私营公司|privately[- ]owned|private company/i,
    foreign_invested: /外商投资|外商独资|外资企业|外资公司|外资银行|中外合资|foreign[- ](?:invested|owned)/i,
    public_institution: /事业单位|public institution/i,
  };
  if (clue.field === "companyNature") return Boolean(nature[clue.value] && hasPositivePhrase(clue.quote, nature[clue.value]));
  if (clue.field === "employmentType") {
    const expression = ({ direct_hire: /直接招聘|企业直招|公司直招|直接签约|直接劳动合同|direct hire/i, outsourced: /本岗(?:位)?(?:为|是)外包|外包岗位|外包职位|outsourced (?:role|position)/i, labor_dispatch: /本岗(?:位)?(?:为|是)派遣|劳务派遣|labor dispatch/i } as Record<string, RegExp>)[clue.value];
    return Boolean(expression && hasPositivePhrase(clue.quote, expression));
  }
  if (clue.field === "linkPlatform") {
    return Boolean(screenshotBrands[clue.value] && new RegExp("^(?:当前)?平台[：: ]+" + screenshotBrands[clue.value] + "[。.!！\\s]*$", "i").test(clue.quote.trim()));
  }
  if (clue.field !== "companyTags") return false;
  // Industry and size are separate claims: a genuine quote must also support its label.
  const tags: Record<string, RegExp> = {
    banking: /银行业|银行机构|外资银行|商业银行|银行(?:公司)?性质|行业[：: ]*银行|banking industry/i,
    internet: /互联网(?:行业|企业|公司|平台)|行业[：: ]*互联网|internet (?:company|industry|platform)/i,
    manufacturing: /制造业|制造企业|制造行业|manufacturing/i,
    healthcare: /医疗健康|医疗行业|医疗企业|行业[：: ]*(?:医疗|医药)|healthcare/i,
    startup: /初创企业|初创公司|创业公司|start[- ]up (?:company|business)/i,
  };
  if (["large", "mid"].includes(clue.value)) return false;
  if (tags[clue.value]) return hasPositivePhrase(clue.quote, tags[clue.value]);
  return clue.quote.includes(clue.value) && /(?:行业|领域|标签|industry|sector)[：: ]/i.test(clue.quote);
}
export function screenshotPlatformClues(text: string) {
  return text.split(/\r?\n/).flatMap((line) => Object.keys(screenshotBrands).flatMap((value) => {
    const clue = { field: "linkPlatform" as const, value, quote: line.trim() };
    return explicitClassificationClue(clue, "") ? [clue] : [];
  }));
}
export function canonicalCompanyTag(value: string) {
  const aliases: Record<string, string> = { "银行": "banking", "银行业": "banking", "互联网": "internet", "制造": "manufacturing", "制造业": "manufacturing", "医疗": "healthcare", "医疗健康": "healthcare", "初创": "startup", "大厂": "large", "中厂": "mid" };
  return aliases[value.trim()] || value.trim();
}
export function manualMetadataEdit(metadata: JobMetadata, field: MetadataField, value: string | string[], contextKey: string, now: string) {
  const cleared = value === "" || value === "unknown" || (Array.isArray(value) && value.length === 0);
  return JobMetadataSchema.parse({ ...metadata, [field]: value,
    fieldStates: { ...metadata.fieldStates, [field]: { status: cleared ? "cleared" : "manual", contextKey, confirmedAt: now,
      evidence: { sourceType: "manual", sourceRef: "user", quote: Array.isArray(value) ? value.join("、") : value, obtainedAt: now, version: metadataRuleVersion, contextKey },
      rejectedValues: metadata.fieldStates[field]?.rejectedValues || [] } } });
}
export function applyMetadataSuggestions(metadata: JobMetadata, suggestions: MetadataSuggestion[], contextKey: string) {
  const next: JobMetadata = structuredClone(metadata);
  if (next.companyProfileCandidate && next.companyProfileCandidate.contextKey !== contextKey) next.companyProfileCandidate = null;
  if (next.actualSubmission && next.actualSubmission.contextKey !== contextKey) next.actualSubmission = null;
  for (const field of metadataFields) {
    const state = next.fieldStates[field];
    if (state && state.contextKey !== contextKey) {
      const sameCompany = JSON.parse(state.contextKey)[0] === JSON.parse(contextKey)[0];
      const companyScoped = ["companyNature", "companyTags"].includes(field) && ["manual", "confirmed_profile"].includes(state.evidence?.sourceType || "");
      const userSource = ["discoverySource", "referralStatus", "referralCode"].includes(field) && state.evidence?.sourceType === "manual";
      if (sameCompany && (companyScoped || userSource)) {
        state.contextKey = contextKey;
        if (state.evidence) state.evidence.contextKey = contextKey;
      }
      else if (["manual", "cleared", "confirmed", "needs_review"].includes(state.status)) state.status = "needs_review";
      else { (next as Record<string, unknown>)[field] = field === "companyTags" ? [] : field === "referralCode" ? "" : "unknown"; state.status = "unset"; }
    }
  }
  next.suggestions = next.suggestions.map((s) => s.evidence.contextKey === contextKey ? s : { ...s, status: "stale" });
  for (const suggestion of suggestions) {
    if (suggestion.evidence.contextKey !== contextKey) continue;
    const existing = next.suggestions.find((s) => s.field === suggestion.field && JSON.stringify(s.value) === JSON.stringify(suggestion.value) && s.evidence.contextKey === contextKey && s.evidence.sourceRef === suggestion.evidence.sourceRef && s.evidence.version === suggestion.evidence.version && s.evidence.profileVersion === suggestion.evidence.profileVersion);
    if (existing?.status === "rejected") continue;
    if (!existing) next.suggestions.push(suggestion);
    const state = next.fieldStates[suggestion.field];
    if (state && state.status !== "unset" && state.status !== "suggested") continue;
    if (state?.rejectedValues.some((v) => JSON.stringify(v) === JSON.stringify(suggestion.value))) continue;
    (next as Record<string, unknown>)[suggestion.field] = suggestion.value;
    next.fieldStates[suggestion.field] = { status: "suggested", contextKey, evidence: suggestion.evidence, rejectedValues: state?.rejectedValues || [] };
  }
  return next;
}
export function decideMetadataSuggestion(metadata: JobMetadata, index: number, accept: boolean, contextKey: string, now: string) {
  const next = structuredClone(metadata), suggestion = next.suggestions[index];
  if (!suggestion || suggestion.evidence.contextKey !== contextKey || suggestion.status === "stale") throw new Error("建议已失效，请重新识别");
  suggestion.status = accept ? "accepted" : "rejected";
  if (accept && suggestion.evidence.sourceType === "confirmed_profile") { next.companyProfileId = suggestion.evidence.sourceRef; next.companyProfileCandidate = null; }
  const state = next.fieldStates[suggestion.field];
  if (!accept && state && ["manual", "cleared", "confirmed", "needs_review"].includes(state.status)) {
    state.rejectedValues = [...state.rejectedValues, suggestion.value];
    return next;
  }
  next.fieldStates[suggestion.field] = { status: accept ? "confirmed" : "rejected", contextKey, evidence: suggestion.evidence,
    rejectedValues: accept ? [] : [...(next.fieldStates[suggestion.field]?.rejectedValues || []), suggestion.value], ...(accept ? { confirmedAt: now } : {}) };
  (next as Record<string, unknown>)[suggestion.field] = accept ? suggestion.value : suggestion.field === "companyTags" ? [] : "unknown";
  return next;
}

// Host and route identify the current link, never the user's first discovery or completed submission.
export function linkSuggestions(sourceUrl: string, company: string, now: string): MetadataSuggestion[] {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return []; }
  if (url.protocol === "mailto:" && !url.host && z.string().email().safeParse(url.pathname).success) {
    const contextKey = metadataContext(company, sourceUrl);
    return [{ field: "submissionChannel", value: "email", status: "suggested", evidence: { sourceType: "url_rule", sourceRef: sourceUrl, quote: "mailto 邮件链接（仅建议计划渠道）", obtainedAt: now, version: metadataRuleVersion, contextKey } }];
  }
  if (!["https:", "http:"].includes(url.protocol) || url.port || url.username || url.password) return [];
  const host = url.hostname.toLowerCase(), path = url.pathname;
  const matches = (domain: string) => host === domain || host.endsWith("." + domain);
  let platform = "", channel = "", route = "";
  if (/^[a-z0-9-]+\.jobs\.feishu\.cn$/.test(host) && /^\/[^/]+\/position\/\d+\/detail\/?$/.test(path)) { platform = "feishu_ats"; channel = "company_portal"; route = "企业职位详情由飞书招聘系统承载"; }
  else if (matches("mokahr.com")) { if (/\/apply\//.test(path) || /\/job\//.test(path)) { platform = "moka_ats"; channel = "company_portal"; route = "企业网申职位路径"; } }
  else if (matches("zhipin.com")) { platform = "boss"; if (/\/job_detail\//.test(path)) channel = "boss"; }
  else if (matches("liepin.com")) { platform = "liepin"; if (/\/job\//.test(path)) channel = "liepin"; }
  else if (matches("zhaopin.com")) { platform = "zhaopin"; if (/\/jobdetail\//.test(path) || host === "jobs.zhaopin.com") channel = "zhaopin"; }
  else if (matches("51job.com")) { platform = "51job"; if (host === "jobs.51job.com" && /\.html$/.test(path)) channel = "51job"; }
  else if (matches("lagou.com")) { platform = "lagou"; if (/\/jobs\/\d+/.test(path)) channel = "lagou"; }
  else if (matches("shixiseng.com")) { platform = "shixiseng"; if (/\/intern\//.test(path)) channel = "shixiseng"; }
  else if (matches("nowcoder.com")) { platform = "nowcoder"; }
  else if (matches("xiaohongshu.com") || host === "xhslink.com") { platform = "xiaohongshu"; }
  else if (matches("maimai.cn")) { platform = "maimai"; }
  else if (matches("linkedin.com")) { platform = "linkedin"; if (/\/jobs\/view\//.test(path)) channel = "linkedin"; }
  const contextKey = metadataContext(company, sourceUrl);
  const evidence: z.infer<typeof MetadataEvidenceSchema> = { sourceType: "url_rule", sourceRef: sourceUrl, quote: host + path + (route ? " · " + route : ""), obtainedAt: now, version: metadataRuleVersion, contextKey };
  return [...(platform ? [{ field: "linkPlatform" as const, value: platform, evidence, status: "suggested" as const }] : []), ...(channel ? [{ field: "submissionChannel" as const, value: channel, evidence, status: "suggested" as const }] : [])];
}
export function legacyMetadata(data: { companyType?: unknown; channel?: unknown }, company: string, sourceUrl: string, now: string) {
  const metadata = JobMetadataSchema.parse({ legacy: { companyType: String(data.companyType || ""), channel: String(data.channel || "") } });
  const contextKey = metadataContext(company, sourceUrl), suggestions: MetadataSuggestion[] = [];
  const evidence = { sourceType: "legacy" as const, sourceRef: "legacy_fields", quote: [metadata.legacy.companyType, metadata.legacy.channel].join(" / "), obtainedAt: now, version: metadataRuleVersion, contextKey };
  const tag = ({ large_tech: "large", mid_size: "mid", startup: "startup" } as Record<string, string>)[metadata.legacy.companyType];
  if (tag) suggestions.push({ field: "companyTags", value: [tag], evidence, status: "suggested" });
  const aliases: Record<string, keyof typeof channelLabels> = { "网申": "company_portal", "官网": "company_portal", "企业网申": "company_portal", "boss": "boss", "boss直聘": "boss", "猎聘": "liepin", "智联": "zhaopin", "智联招聘": "zhaopin", "前程无忧": "51job", "拉勾": "lagou", "实习僧": "shixiseng", "邮件": "email", "牛客": "nowcoder", "linkedin": "linkedin" };
  const channel = aliases[metadata.legacy.channel.trim().toLowerCase()];
  if (channel) suggestions.push({ field: "submissionChannel", value: channel, evidence, status: "suggested" });
  return { metadata, suggestions };
}
export function freezeSubmissionMetadata(metadata: JobMetadata | undefined, company: string, sourceUrl: string) {
  const next = structuredClone(metadata || JobMetadataSchema.parse({}));
  next.companyProfileCandidate = null;
  const contextKey = metadataContext(company, sourceUrl);
  for (const field of metadataFields) {
    const state = next.fieldStates[field];
    if (!state || !["manual", "confirmed"].includes(state.status) || state.contextKey !== contextKey) {
      (next as Record<string, unknown>)[field] = field === "companyTags" ? [] : field === "referralCode" ? "" : "unknown";
    }
  }
  if (next.actualSubmission?.contextKey !== contextKey) next.actualSubmission = null;
  return next;
}
