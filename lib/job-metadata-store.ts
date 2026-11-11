import { z } from "zod";
import { ApiError, getDatabase } from "./server-data";
import { listKind, ownedRecord } from "./jd-store";
import { applyMetadataSuggestions, canonicalCompanyTag, CompanyProfileSchema, explicitClassificationClue, freezeSubmissionMetadata, JobMetadataSchema, legacyMetadata, linkSuggestions, metadataContext, metadataFields, metadataRuleVersion, screenshotPlatformClues, type JobMetadata, type MetadataSuggestion } from "./job-metadata";

export async function suggestJobMetadata(ownerId: string, data: Record<string, any>) {
  const now = new Date().toISOString(), company = String(data.company || ""), sourceUrl = String(data.sourceUrl || "");
  const contextKey = metadataContext(company, sourceUrl);
  const legacy = legacyMetadata(data, company, sourceUrl, now);
  let metadata: JobMetadata = data.jobMetadata ? structuredClone(data.jobMetadata) : legacy.metadata;
  const suggestions: MetadataSuggestion[] = [...linkSuggestions(sourceUrl, company, now), ...(!data.jobMetadata ? legacy.suggestions : [])];
  if (data.extractionJobId) {
    const job = await getDatabase().prepare("SELECT type, result, prompt_version FROM ai_jobs WHERE id = ? AND owner_id = ? AND status = 'succeeded' AND type IN ('job_capture_url','job_capture_image')").bind(data.extractionJobId, ownerId).first<{ type: string; result: string; prompt_version: string }>();
    if (!job) throw new ApiError(404, "已完成的岗位提取任务不存在");
    const result = JSON.parse(job.result);
    const text = job.type === "job_capture_image" ? String(result.ocrText || "") : [result.jd || "", ...(result.evidence || []).map((e: { quote: string }) => e.quote)].join("\n");
    const sameSource = (!result.company || result.company === company) && (!result.sourceUrl || result.sourceUrl === sourceUrl);
    const clues = [...result.classificationClues || [], ...(job.type === "job_capture_image" ? screenshotPlatformClues(text) : [])];
    for (const rawClue of sameSource ? clues : []) {
      const clue = { ...rawClue, value: rawClue.field === "companyTags" ? canonicalCompanyTag(rawClue.value) : rawClue.value };
      if (!clue.quote || !text.includes(clue.quote) || !explicitClassificationClue(clue, company)) continue;
      const shape = clue.field === "companyTags" ? { [clue.field]: [clue.value] } : { [clue.field]: clue.value };
      if (!JobMetadataSchema.safeParse(shape).success) continue;
      const tags = clue.field === "companyTags" ? suggestions.find((s) => s.field === "companyTags" && s.evidence.sourceRef === data.extractionJobId) : null;
      if (tags) { tags.value = [...new Set([...(tags.value as string[]), clue.value])]; tags.evidence.additionalQuotes = [...(tags.evidence.additionalQuotes || []), clue.quote]; }
      else suggestions.push({ field: clue.field, value: clue.field === "companyTags" ? [clue.value] : clue.value, status: "suggested", evidence: { sourceType: job.type === "job_capture_image" ? "ocr_explicit" : "ai_inference", sourceRef: String(data.extractionJobId), quote: clue.quote, obtainedAt: now, version: job.prompt_version, ruleVersion: metadataRuleVersion, contextKey } });
    }
  }
  let profileId = metadata.companyProfileId;
  if (!profileId) {
    const matches = (await listKind(ownerId, "company_profiles")).filter((record) => [record.data.legalName, ...(record.data.confirmedAliases || [])].includes(company.trim()) && !metadata.profileRejections.some((rejection) => rejection.id === record.id && rejection.contextKey === contextKey));
    metadata.companyProfileCandidate = matches.length === 1 ? { id: matches[0].id, version: matches[0].version, legalName: matches[0].data.legalName, identityBasis: matches[0].data.legalName === company.trim() ? "exact_name" : "confirmed_alias", contextKey } : null;
    if (!metadata.companyProfileCandidate) {
      for (const field of ["companyNature", "companyTags"] as const) if (metadata.fieldStates[field]?.status === "suggested" && metadata.fieldStates[field]?.evidence?.sourceType === "confirmed_profile") {
        if (field === "companyNature") metadata.companyNature = "unknown"; else metadata.companyTags = [];
        metadata.fieldStates[field] = { status: "unset", contextKey, rejectedValues: metadata.fieldStates[field]?.rejectedValues || [] };
      }
      metadata.suggestions = metadata.suggestions.map((suggestion) => suggestion.status === "suggested" && suggestion.evidence.sourceType === "confirmed_profile" ? { ...suggestion, status: "stale" } : suggestion);
    }
    profileId = metadata.companyProfileCandidate?.id || null;
  }
  else metadata.companyProfileCandidate = null;
  if (profileId) {
    const record = await ownedRecord(ownerId, profileId, "company_profiles");
    const profile = CompanyProfileSchema.parse(record.data);
    if (![profile.legalName, ...profile.confirmedAliases].includes(company.trim())) throw new ApiError(422, "公司名称与所关联主体不一致，请解除关联或重新核对主体");
    for (const field of ["companyNature", "companyTags"] as const) {
      if ((field === "companyNature" && profile.companyNature === "unknown") || (field === "companyTags" && !profile.companyTags.length)) continue;
      suggestions.push({ field, value: profile[field], status: "suggested", evidence: { sourceType: "confirmed_profile", sourceRef: record.id, quote: profile.legalName, obtainedAt: now, version: metadataRuleVersion, contextKey, profileVersion: record.version } });
    }
  }
  metadata = applyMetadataSuggestions(metadata, suggestions, contextKey);
  return { metadata, contextKey };
}

// The browser chooses values; provenance claiming a rule or company profile is checked at the server boundary.
export async function validateJobMetadata(ownerId: string, data: Record<string, any>, current?: Record<string, any>) {
  if (!data.jobMetadata) return data;
  const contextKey = metadataContext(String(data.company || ""), String(data.sourceUrl || ""));
  const metadata = applyMetadataSuggestions(data.jobMetadata, [], contextKey);
  const priorMetadata = current?.jobMetadata ? applyMetadataSuggestions(current.jobMetadata, [], contextKey) : null;
  if (metadata.companyVerificationJobId && metadata.companyVerificationJobId !== priorMetadata?.companyVerificationJobId) {
    const task = await getDatabase().prepare("SELECT id FROM ai_jobs WHERE id = ? AND owner_id = ? AND type = 'company_metadata_verify'").bind(metadata.companyVerificationJobId, ownerId).first();
    if (!task) throw new ApiError(404, "公司核实任务不存在");
  }
  if (metadata.actualSubmission && JSON.stringify(metadata.actualSubmission) !== JSON.stringify(priorMetadata?.actualSubmission)) metadata.actualSubmission.confirmedAt = new Date().toISOString();
  if (metadata.companyProfileCandidate && metadata.companyProfileCandidate.contextKey !== contextKey) metadata.companyProfileCandidate = null;
  if (current && current.company !== data.company && metadata.companyProfileId === current.jobMetadata?.companyProfileId) metadata.companyProfileId = null;
  if (metadata.companyProfileId) {
    const profile = await ownedRecord(ownerId, metadata.companyProfileId, "company_profiles");
    if (![profile.data.legalName, ...(profile.data.confirmedAliases || [])].includes(String(data.company || "").trim())) throw new ApiError(422, "请先解除不匹配的公司主体关联");
  }
  if (metadata.companyProfileCandidate) {
    const candidate = metadata.companyProfileCandidate, profile = await ownedRecord(ownerId, candidate.id, "company_profiles");
    if (profile.version !== candidate.version || profile.data.legalName !== candidate.legalName) throw new ApiError(409, "公司资料候选已变化，请重新识别");
    if (![profile.data.legalName, ...(profile.data.confirmedAliases || [])].includes(String(data.company || "").trim())) throw new ApiError(422, "公司资料候选不属于当前公司主体");
    candidate.identityBasis = profile.data.legalName === String(data.company || "").trim() ? "exact_name" : "confirmed_alias";
  }
  const rules = linkSuggestions(String(data.sourceUrl || ""), String(data.company || ""), new Date().toISOString());
  for (const field of metadataFields) {
    const state = metadata.fieldStates[field];
    if (!state) continue;
    if (state.contextKey !== contextKey && ["manual", "confirmed", "suggested"].includes(state.status)) state.status = "needs_review";
    const prior = priorMetadata?.fieldStates[field];
    if (prior && ["manual", "cleared", "rejected"].includes(prior.status) && state.status === "suggested") throw new ApiError(409, "人工选择不能被自动建议覆盖");
    // Unchanged confirmed data has already crossed the validation boundary; a notes edit must not re-authorize its old source.
    if (priorMetadata && JSON.stringify(prior) === JSON.stringify(state) && JSON.stringify(priorMetadata[field]) === JSON.stringify(metadata[field])) continue;
    if (!["suggested", "confirmed"].includes(state.status)) continue;
    if (state.evidence?.sourceType === "url_rule" && !rules.some((s) => s.field === field && JSON.stringify(s.value) === JSON.stringify(metadata[field]) && s.evidence.contextKey === state.contextKey && s.evidence.version === state.evidence?.version && s.evidence.quote === state.evidence.quote)) throw new ApiError(422, "链接规则依据已失效，请重新识别");
    if (state.evidence?.sourceType === "confirmed_profile") {
      const profile = await ownedRecord(ownerId, state.evidence.sourceRef, "company_profiles");
      if (profile.id !== (metadata.companyProfileId || metadata.companyProfileCandidate?.id) || profile.version !== state.evidence.profileVersion || JSON.stringify(profile.data[field]) !== JSON.stringify(metadata[field])) throw new ApiError(409, "公司资料已变化，请重新核对建议");
    }
    if (state.evidence && ["page_explicit", "ocr_explicit", "ai_inference"].includes(state.evidence.sourceType)) {
      const job = await getDatabase().prepare("SELECT result, type, prompt_version FROM ai_jobs WHERE id = ? AND owner_id = ? AND status = 'succeeded' AND type IN ('job_capture_url','job_capture_image','company_research','company_metadata_verify')").bind(state.evidence.sourceRef, ownerId).first<{ result: string; type: string; prompt_version: string }>();
      if (!job || job.prompt_version !== state.evidence.version || (state.evidence.sourceType === "ocr_explicit" && job.type !== "job_capture_image") || (state.evidence.sourceType === "page_explicit" && job.type !== "job_capture_url")) throw new ApiError(422, "分类建议缺少有效提取依据");
      const result = JSON.parse(job.result), quotes = [state.evidence.quote, ...(state.evidence.additionalQuotes || [])];
      if (state.evidence.sourceType === "page_explicit" && result.captureMethod !== "public_ats_api") throw new ApiError(422, "网页线索尚未取得可核对原文，只能作为 AI 待核实建议");
      if ((result.company && result.company !== String(data.company || "")) || (result.sourceUrl && result.sourceUrl !== String(data.sourceUrl || ""))) throw new ApiError(422, "分类依据属于其他公司或岗位链接");
      const sourceText = String(result.ocrText || [result.jd || "", ...(result.evidence || []).map((e: { quote: string }) => e.quote)].join("\n"));
      const clues = [...result.classificationClues || [], ...(job.type === "job_capture_image" ? screenshotPlatformClues(sourceText) : [])];
      const values = Array.isArray(metadata[field]) ? metadata[field] as string[] : [metadata[field]];
      if (quotes.some((q) => !q || !sourceText.includes(q)) || values.some((value) => !clues.some((clue: { field: string; value: string; quote: string }) => {
        const normalized = { ...clue, value: field === "companyTags" ? canonicalCompanyTag(clue.value) : clue.value };
        return normalized.field === field && normalized.value === value && quotes.includes(clue.quote) && explicitClassificationClue(normalized, String(data.company || ""));
      }))) throw new ApiError(422, "分类建议的值或引用不属于该提取结果");
    }
  }
  return { ...data, jobMetadata: metadata };
}
export const MetadataChangeSchema = z.object({
  version: z.number().int().positive(), jobMetadata: JobMetadataSchema,
}).strict();
export function submissionMetadata(data: Record<string, any>) {
  return freezeSubmissionMetadata(data.jobMetadata, String(data.company || ""), String(data.sourceUrl || ""));
}
export async function validateCaptureDraftReferences(ownerId: string, data: { confirmedSavedJobId: string | null; confirmation?: unknown; extractionJobId: string; values: Record<string, unknown> }) {
  if (data.confirmation) throw new ApiError(422, "确认凭据只能通过核对确认接口写入");
  if (data.confirmedSavedJobId) throw new ApiError(422, "草稿收藏状态只能通过核对确认接口写入");
  const db = getDatabase();
  if (data.extractionJobId && !await db.prepare("SELECT id FROM ai_jobs WHERE owner_id = ? AND id = ? AND type IN ('job_capture_url','job_capture_image')").bind(ownerId, data.extractionJobId).first()) throw new ApiError(404, "岗位提取任务不存在");
  if (data.values.screenshotFileId && !await db.prepare("SELECT id FROM stored_files WHERE owner_id = ? AND id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(ownerId, String(data.values.screenshotFileId)).first()) throw new ApiError(404, "草稿截图不存在");
}
