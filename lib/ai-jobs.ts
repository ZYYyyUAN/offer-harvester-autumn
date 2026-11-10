import { ApiError, getBindings, getDatabase, safeJson } from "@/lib/server-data";
import { aiErrorDetails, analyzeResumeFile, ocrImage, responsesSearch, structuredChat, transcribeAudio } from "@/lib/qwen";
import { CompanyResearchSchema, deterministicScore, filterEvidenceIds, ForeignInterviewReviewSchema, foreignInterviewJsonSchema, InterviewReviewSchema, interviewJsonSchema, JobAnalysisSchema, companyJsonSchema, requirementJsonSchema, ResumeSuggestionSchema, resumeJsonSchema, type AIJobType } from "@/lib/ai-contracts";
import { getEvaluationCase } from "@/lib/ai-evaluation-cases";
import { jobCaptureJsonSchema, normalizeJobCapture } from "@/lib/workflow-contracts";
import { atomicBatch, insertRecord, versionGuard } from "@/lib/jd-store";
import { executeJDJob } from "@/lib/jd-feature";
import { publicAtsSource } from "@/lib/job-source-contracts";
import { readPublicAtsJob } from "@/lib/job-source";
import { ZodError } from "zod";
import { CaptureProfileSchema, type CaptureTrace } from "./capture-contracts";

type JobRow = Record<string, unknown>;
type Evidence = { id: string; title?: string; sourceQuote?: string; detail?: string; status?: string };
function normalizeCaptureResponse(value: unknown, sourceUrl = "") {
  try { return normalizeJobCapture(value, sourceUrl); }
  catch (error) {
    if (error instanceof ZodError) throw new ApiError(502, "岗位提取结果未通过结构校验，原输入已保留，请重试或手动填写", "SCHEMA_INVALID");
    throw error;
  }
}
const classificationInstructions = "classificationClues 应完整提取页面明确记载的公司性质、行业/发展阶段标签及本岗位用工形式，并逐项附原文 quote。companyNature 使用 state_owned/private/foreign_invested/public_institution/other；employmentType 使用 direct_hire/outsourced/labor_dispatch；companyTags 使用 banking（银行业）、internet（互联网）、manufacturing（制造业）、healthcare（医疗）、startup（初创）或其他原文标签。原文明示‘行业：制造业’时必须提取 manufacturing；明示‘公司性质：民营企业’时提取 private。不得根据公司名称、英文名、技术栈或印象补全；银行不等于国企，上市不等于大厂，提供外包服务不等于本岗位外包。没有明确记载则不输出该字段；未披露不是否定，也不能猜测。行业标签必须有明确行业原文，软件外包服务不能推断互联网；大厂、中厂只由用户确认，不输出。若截图明确写有“平台：BOSS直聘”等当前平台标识，可输出 linkPlatform（boss/xiaohongshu/maimai/nowcoder/liepin/zhaopin/51job/lagou/shixiseng/linkedin），引用该完整标识；正文提到的平台或转载来源不能证明当前平台。不得从平台推断用户最初发现来源、实际投递或内推。";

const modelFor: Record<AIJobType, string> = {
  jd_requirements_extract: "qwen3.8-max", resume_text_extract: "qwen-doc-turbo", resume_gap_analysis: "qwen3.8-max",
  job_analysis: "qwen3.8-max", resume_suggestions: "qwen-doc-turbo", company_research: "qwen3.8-max",
  interview_review: "qwen3.8-max", transcription: "qwen3-asr-flash", evaluation_case: "qwen3.8-max",
  foreign_interview_review: "qwen3.8-max",
  job_capture_url: "qwen3.8-max", job_capture_image: "qwen3.5-ocr",
};
const promptFor: Record<AIJobType, string> = {
  jd_requirements_extract: "jd-requirements-v2", resume_text_extract: "resume-text-v1", resume_gap_analysis: "resume-gap-v4",
  job_analysis: "job-analysis-v2", resume_suggestions: "resume-suggestions-v2", company_research: "company-research-v3",
  interview_review: "interview-review-v2", transcription: "transcription-v2", evaluation_case: "evaluation-job-analysis-v2",
  foreign_interview_review: "foreign-interview-review-v1",
  job_capture_url: "job-capture-url-v5", job_capture_image: "job-capture-image-v4",
};

export function mapAIJob(row: JobRow) {
  return {
    id: String(row.id), batchId: row.batch_id ? String(row.batch_id) : null, type: String(row.type), status: String(row.status),
    phase: row.phase ? String(row.phase) : null,
    inputSnapshot: safeJson(String(row.input_snapshot ?? "{}"), {}), sourceRefs: safeJson(String(row.source_refs ?? "[]"), []),
    model: String(row.model), promptVersion: String(row.prompt_version), result: safeJson(String(row.result ?? "null"), null),
    resultRecordId: row.result_record_id ? String(row.result_record_id) : null, confidence: row.confidence ? String(row.confidence) : null,
    elapsedMs: row.elapsed_ms == null ? null : Number(row.elapsed_ms), errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null, version: Number(row.version ?? 1),
    createdAt: String(row.created_at), startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null, updatedAt: String(row.updated_at),
  };
}

export function mapAttempt(row: JobRow) {
  return { id: String(row.id), jobId: String(row.job_id), attemptNumber: Number(row.attempt_number), model: String(row.model), status: String(row.status), telemetry: safeJson(String(row.telemetry ?? "{}"), {}), tokenUsage: safeJson(String(row.token_usage ?? "{}"), {}), responseSummary: row.response_summary ? String(row.response_summary) : null, errorCode: row.error_code ? String(row.error_code) : null, errorMessage: row.error_message ? String(row.error_message) : null, startedAt: String(row.started_at), finishedAt: row.finished_at ? String(row.finished_at) : null };
}

export async function createAIJob(ownerId: string, type: AIJobType, input: Record<string, unknown>, options: { batchId?: string; sourceRefs?: unknown[]; captureKey?: string } = {}) {
  const id = crypto.randomUUID();
  const publicSource = type === "job_capture_url" && input.readStrategy !== "model" && publicAtsSource(String(input.sourceUrl || ""));
  const model = publicSource ? "public-ats-parser" : type === "job_capture_url" && input.executionProfile === "capture-flash-v1" ? "qwen3.8-flash" : modelFor[type];
  const inserted = await getDatabase().prepare("INSERT INTO ai_jobs (id, owner_id, batch_id, type, status, input_snapshot, source_refs, model, prompt_version, capture_key, phase) SELECT ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ? WHERE ? IS NULL OR NOT EXISTS (SELECT 1 FROM ai_jobs WHERE owner_id = ? AND capture_key = ? AND status IN ('queued','running'))")
    .bind(id, ownerId, options.batchId ?? null, type, JSON.stringify(input), JSON.stringify(options.sourceRefs ?? []), model, publicSource ? "public-ats-v2" : promptFor[type], options.captureKey ?? null, options.captureKey ? "queued" : null, options.captureKey ?? null, ownerId, options.captureKey ?? null).run();
  if (!inserted.meta.changes) {
    const existing = await getDatabase().prepare("SELECT id FROM ai_jobs WHERE owner_id = ? AND capture_key = ? AND status IN ('queued','running')").bind(ownerId, options.captureKey!).first<{ id: string }>();
    if (!existing) throw new ApiError(409, "同一岗位任务状态已改变，请重新读取任务列表");
    return getAIJob(ownerId, existing.id);
  }
  return getAIJob(ownerId, id);
}

export async function getAIJob(ownerId: string, id: string) {
  const row = await getDatabase().prepare("SELECT * FROM ai_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<JobRow>();
  if (!row) throw new ApiError(404, "AI 任务不存在");
  const attempts = await getDatabase().prepare("SELECT * FROM ai_job_attempts WHERE job_id = ? AND owner_id = ? ORDER BY attempt_number ASC").bind(id, ownerId).all<JobRow>();
  return { job: mapAIJob(row), attempts: attempts.results.map(mapAttempt), serverNow: new Date().toISOString() };
}

function cleanAnalysis(data: Record<string, unknown>, evidence: Evidence[]) {
  const validIds = new Set(evidence.filter((item) => item.status === "confirmed").map((item) => item.id));
  let invalidReferenceCount = 0;
  const requirements = (data.requirements as Array<Record<string, unknown>>).map((item) => {
    const original = (item.evidenceIds as string[]) || [];
    const filtered = filterEvidenceIds(original, validIds); const evidenceIds = filtered.valid;
    invalidReferenceCount += filtered.rejected.length;
    return { ...item, evidenceIds, coverage: evidenceIds.length ? (item.coverage === "strong" ? "strong" : "partial") : "missing" };
  }) as Array<{ label: string; importance: "must" | "important" | "bonus"; evidenceIds: string[]; coverage: "strong" | "partial" | "missing"; reason: string }>;
  const suggestions = (data.suggestions as Array<Record<string, unknown>>).map((item) => {
    const original = (item.evidenceIds as string[]) || [];
    const filtered = filterEvidenceIds(original, validIds); const evidenceIds = filtered.valid;
    invalidReferenceCount += filtered.rejected.length;
    return { ...item, evidenceIds };
  }).filter((item) => (item.evidenceIds as string[]).length > 0);
  return { summary: data.summary, requirements, suggestions, score: deterministicScore(requirements), invalidReferenceCount: 0, rejectedReferenceCount: invalidReferenceCount, citationCoverage: 1 };
}

function normalize(value: string) { return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }

function evaluationMetrics(result: Record<string, unknown>, caseId: string) {
  const fixture = getEvaluationCase(caseId)!;
  const requirementTexts = ((result.requirements || []) as Array<Record<string, unknown>>).map((item) => normalize(`${String(item.label || "")} ${String(item.reason || "")}`));
  const expectedMatched = fixture.expected.filter((expected) => expected.aliases.some((alias) => requirementTexts.some((text) => text.includes(normalize(alias))))).length;
  const predictedMatched = requirementTexts.filter((text) => fixture.expected.some((expected) => expected.aliases.some((alias) => text.includes(normalize(alias))))).length;
  const precision = requirementTexts.length ? predictedMatched / requirementTexts.length : 0;
  const recall = fixture.expected.length ? expectedMatched / fixture.expected.length : 1;
  const unsupportedFacts = fixture.forbiddenFacts.filter((fact) => normalize(JSON.stringify(result)).includes(normalize(fact)));
  return {
    caseId,
    expectedCount: fixture.expected.length,
    predictedCount: requirementTexts.length,
    matchedExpected: expectedMatched,
    matchedPredicted: predictedMatched,
    precision,
    recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    unsupportedFacts,
    schemaValid: true,
    citationCoverage: Number(result.citationCoverage ?? 0),
  };
}

async function execute(ownerId: string, type: AIJobType, input: Record<string, unknown>, trace: CaptureTrace) {
  if (type === "job_capture_url") {
    const sourceUrl = String(input.sourceUrl || "").trim();
    try { const parsed = new URL(sourceUrl); if (!/^https?:$/.test(parsed.protocol)) throw new Error(); } catch { throw new ApiError(400, "请输入有效的公开岗位链接"); }
    const publicSource = input.readStrategy !== "model" && publicAtsSource(sourceUrl);
    trace.telemetry.route = publicSource ? "public_" + publicSource.kind : "model_url";
    if (publicSource) return { result: await trace.measure("reading_page", () => readPublicAtsJob(publicSource, sourceUrl)), usage: {}, confidence: "high", record: null };
    const profile = CaptureProfileSchema.parse(input.executionProfile);
    const response = await trace.measure("extracting", () => responsesSearch({
      model: profile === "capture-flash-v1" ? "qwen3.8-flash" : "qwen3.8-max",
      system: "你是严格的岗位信息提取器。只提取指定页面正文，缺失字段为空，evidence 引用原文。" + classificationInstructions,
      prompt: `仅访问并抽取这个岗位页面：${sourceUrl}\n提取公司、岗位、地点、薪资、截止日期（YYYY-MM-DD）、完整 JD。若网页要求登录、出现验证码或正文不可访问，在 warnings 中说明，不要改用其他职位。sourceUrl 原样返回。`,
      schemaName: "job_capture_url_v1", schema: jobCaptureJsonSchema,
    }));
    trace.telemetry.usage.structured = response.raw.usage ?? null;
    const normalized = await trace.measure("validating", async () => normalizeCaptureResponse(response.data, sourceUrl));
    if (!normalized.company && !normalized.role && !normalized.jd) throw new ApiError(422, "未能读取这个岗位链接的正文。请上传 JD 截图或粘贴岗位职责与任职要求；已经填写的信息会保留。", "PAGE_CONTENT_UNAVAILABLE");
    return { result: { ...normalized, sources: response.sources }, usage: response.usage, confidence: response.sources.length && normalized.company && normalized.role ? "medium" : "low", record: null };
  }
  if (type === "job_capture_image") {
    const fileId = String(input.fileId || ""); const { db, bucket } = getBindings();
    const file = await db.prepare("SELECT object_key, mime_type FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(fileId, ownerId).first<JobRow>();
    if (!file) throw new ApiError(404, "岗位截图不存在");
    const object = await bucket.get(String(file.object_key)); if (!object) throw new ApiError(404, "岗位截图内容不存在");
    trace.telemetry.route = "ocr_image";
    const ocr = await trace.measure("reading_image", async () => ocrImage({ bytes: await object.arrayBuffer(), mimeType: String(file.mime_type) }));
    trace.telemetry.usage.ocr = ocr.raw.usage ?? null;
    const response = await trace.measure("extracting", () => structuredChat({ model: "qwen3.8-flash", system: "你是严格的岗位截图字段提取器。只能使用 OCR 原文，缺失字段为空，evidence 必须提供原文。" + classificationInstructions, prompt: `截图 OCR 原文：\n${ocr.text}\n\n提取公司、岗位、地点、薪资、截止日期（YYYY-MM-DD）和完整 JD。sourceUrl 返回空字符串。`, schemaName: "job_capture_image_v1", schema: jobCaptureJsonSchema, maxTokens: 4200 }));
    trace.telemetry.usage.structured = response.raw.usage ?? null;
    const normalized = await trace.measure("validating", async () => normalizeCaptureResponse(response.data));
    return { result: { ...normalized, ocrText: ocr.text, screenshotFileId: fileId }, usage: response.usage, confidence: normalized.company && normalized.role ? "medium" : "low", record: null };
  }
  if (type === "job_analysis" || type === "evaluation_case") {
    const fixture = type === "evaluation_case" ? getEvaluationCase(String(input.caseId || "")) : null;
    if (type === "evaluation_case" && !fixture) throw new ApiError(400, "评测样本不存在");
    const jd = fixture?.jd ?? String(input.jd || "").trim();
    const evidence = fixture?.evidence ?? (Array.isArray(input.evidence) ? input.evidence as Evidence[] : []);
    if (jd.length < 20) throw new ApiError(400, "职位描述过短，无法分析");
    const response = await structuredChat({ model: "qwen3.8-max", system: "你是证据优先的求职分析师。完整提取岗位的必备项、重要项和加分项。requirements 中每一项只能表示一个具体技能或职责；label 必须写具体要求，禁止使用‘必备项’‘重要项’‘加分项’等类别词作为 label。reason 保持简洁。只能引用提供的已确认事实；没有证据必须标记 missing。不得虚构候选人的经历、数字、教育或技能。最多输出三条建议，每条建议必须引用至少一条有效事实，否则不要输出。", prompt: `职位描述：\n${jd}\n\n已确认事实（ID 必须原样引用）：\n${JSON.stringify(evidence)}`, schemaName: "job_evidence_analysis_v3", schema: requirementJsonSchema, validator: JobAnalysisSchema, maxTokens: 2200 });
    const result = cleanAnalysis(response.data, evidence);
    return { result: type === "evaluation_case" ? { ...result, evaluation: evaluationMetrics(result, String(input.caseId)) } : result, usage: response.usage, confidence: "high", record: type === "job_analysis" ? { kind: "analyses", title: String(input.jobTitle || "岗位证据分析") } : null };
  }
  if (type === "resume_suggestions") {
    const fileId = String(input.fileId || "");
    const { db, bucket } = getBindings();
    const file = await db.prepare("SELECT object_key, filename FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'resume' AND deleted_at IS NULL").bind(fileId, ownerId).first<JobRow>();
    if (!file) throw new ApiError(404, "未找到简历文件");
    const object = await bucket.get(String(file.object_key));
    if (!object) throw new ApiError(404, "简历文件内容不存在");
    const output = await analyzeResumeFile({ bytes: await object.arrayBuffer(), filename: String(file.filename) }, `目标岗位描述：${String(input.jd || "未提供")}。提取可验证事实，并给出原文位置、问题、建议表达、引用原文与风险提示。禁止增加文档中不存在的事实。`, resumeJsonSchema, ResumeSuggestionSchema);
    const facts = (output.facts as Array<Record<string, unknown>>).map((item) => ({ ...item, status: "pending", sourceFileId: fileId }));
    return { result: { ...output, facts }, usage: {}, confidence: "medium", record: null };
  }
  if (type === "company_research") {
    const company = String(input.company || "").trim();
    if (!company) throw new ApiError(400, "请输入公司名称");
    const researchStage = ["screening", "interview", "offer"].includes(String(input.researchStage)) ? String(input.researchStage) : "screening";
    const companyType = String(input.companyType || "unknown").slice(0, 80);
    const targetRole = String(input.targetRole || "").slice(0, 200);
    const businessLine = String(input.businessLine || "").slice(0, 300);
    const personalFindings = String(input.personalFindings || "").slice(0, 6000);
    const offerDetails = String(input.offerDetails || "").slice(0, 6000);
    const response = await responsesSearch({
      system: "你是证据优先的求职者公司背调研究员。必须区分已核实事实、基于事实的推断、匿名员工口碑；不得把匿名评价当作事实。只使用联网检索结果，不生成链接，不给伪精确分数。每条 finding 的 sourceIndexes 必须引用当前搜索结果中从 0 开始的有效编号；无法核实时不要下结论，写入 limitations。工商、司法和劳动用工结论优先采用官方来源，近期动态必须写明日期。用户个人发现属于未核验线索，不得擅自升级为事实。",
      prompt: `对“${company}”做应届秋招求职者视角的三阶段尽职调查。当前重点阶段：${researchStage}；公司类型：${companyType}；目标岗位：${targetRole || "未提供"}；目标部门/业务线：${businessLine || "未提供"}。\n\n必须覆盖：\n1. 公司基本信息：准确主体、经营状态、成立时间、注册资本与实缴、参保人数、地址；无法查到就明确缺失。\n2. 主营业务与产品、商业模式、融资/重大合作，以及发展前景的正向信号和不确定性。\n3. 员工待遇：薪资福利、工时、发薪、人员流动、技术氛围；匿名口碑统一标记 review_claim 并提示样本偏差。\n4. 最新动态：优先最近 12 个月，必须有日期和来源。\n5. 合规风险：经营异常、行政处罚、劳动争议、被执行/失信/限制消费；不能仅凭同名主体下结论。\n6. 岗位与业务线：是否核心、技术栈、外包/派遣/招转培/毁约/强制轮岗等招聘风险。\n7. Offer 核验：签约主体、薪资构成、社保公积金、试用期、部门地点、三方与书面承诺。法律口径必须谨慎，不得声称三方违约金全国统一不超过 5000 元；试用期上限取决于劳动合同期限。\n8. 综合评价、应聘建议、面试建议、Offer 前建议、风险提示和可直接向 HR/面试官确认的问题。\n\n个人发现（未核验，仅作为检索线索）：${personalFindings || "无"}\nOffer/口头承诺（仅作为待核对输入）：${offerDetails || "无"}\n\n不同阶段调整深度：投递前优先合法性与基本盘；面试前优先真实工作状态、业务线和招聘风评；Offer 前优先主体、条款、薪资福利和岗位一致性。不要因为资料缺失而补全。`,
      schemaName: "company_research_v4", schema: companyJsonSchema, validator: CompanyResearchSchema,
    });
    const sources = response.sources;
    const findings = (response.data.findings as Array<Record<string, unknown>>).map((finding) => ({
      ...finding,
      sourceIndexes: ((finding.sourceIndexes as number[]) || []).filter((index) => Number.isInteger(index) && index >= 0 && index < sources.length),
    })).filter((finding) => (finding.sourceIndexes as number[]).length > 0);
    const rejectedFindingCount = (response.data.findings as Array<unknown>).length - findings.length;
    const risks = [...(response.data.risks as string[])];
    if (sources.length < 2) risks.unshift("可核验来源少于两个，本报告仅作为线索，不应据此作出关键决策。");
    if (rejectedFindingCount > 0) risks.unshift(`${rejectedFindingCount} 条未能关联有效来源的模型发现已被系统过滤。`);
    const noEvidence = sources.length === 0 || findings.length === 0;
    return { result: { ...response.data, overview: noEvidence ? "公开检索未返回足够且可关联的来源，当前不能形成可信的公司结论。请使用下方官方工具手动核查，或稍后重试。" : response.data.overview, verdict: noEvidence ? "insufficient_information" : response.data.verdict, overallEvaluation: noEvidence ? "信息不足，暂不建议仅依据本次自动背调决定是否投递、面试或签约。" : response.data.overallEvaluation, findings, risks, sources, company, researchStage, companyType, targetRole, businessLine, personalFindings, offerDetails, rejectedFindingCount, generatedAt: new Date().toISOString(), confidence: sources.length < 2 ? "low" : response.data.confidence }, usage: response.usage, confidence: sources.length < 2 ? "low" : String(response.data.confidence), record: { kind: "research", title: company } };
  }
  if (type === "interview_review") {
    const transcript = String(input.transcript || "").trim();
    if (transcript.length < 30) throw new ApiError(400, "复盘文本太短，无法形成有效点评");
    const response = await structuredChat({ model: "qwen3.8-max", system: "你是严格引用原话的面试复盘教练。只能基于转写文本和上下文，不得补写候选人经历。quotes 必须逐字复制转写中的连续片段。", prompt: `岗位：${String(input.role || "未指定")}\nJD：${String(input.jd || "未提供")}\n转写：${transcript}`, schemaName: "interview_review_v2", schema: interviewJsonSchema, validator: InterviewReviewSchema });
    const quotes = (response.data.quotes as string[]).filter((quote) => quote.length > 0 && transcript.includes(quote));
    return { result: { ...response.data, quotes, rejectedQuoteCount: (response.data.quotes as string[]).length - quotes.length }, usage: response.usage, confidence: "medium", record: null };
  }
  if (type === "foreign_interview_review") {
    const question = String(input.question || "").trim();
    const answer = String(input.answer || "").trim();
    if (question.length < 5 || answer.length < 20) throw new ApiError(400, "请先填写完整英文问题和至少 20 个字符的回答");
    const response = await structuredChat({
      model: "qwen3.8-max",
      system: "你是严谨的 Java 后端应届生英文技术面试教练。只评价用户提供的问题、回答和上下文，不得补写候选人的学校、项目、年限、指标或技能。优先判断技术内容是否准确、表达是否清晰、结构是否完整，再给出简洁自然的英文修订稿。不要追求华丽词汇，不因口音或简单语法扣分。发现回答中无法由输入支持的经历或数字，逐条放入 unsupportedClaims。所有反馈使用中文，correctedAnswer 和 followUpQuestions 使用英文。",
      prompt: `目标岗位：${String(input.role || "Java Backend New Graduate")}\n岗位上下文：${String(input.jd || "未提供").slice(0, 8000)}\n面试问题：${question}\n候选人回答：${answer}`,
      schemaName: "foreign_interview_review_v1", schema: foreignInterviewJsonSchema, validator: ForeignInterviewReviewSchema, maxTokens: 2400,
    });
    return { result: response.data, usage: response.usage, confidence: "medium", record: null };
  }
  if (type === "transcription") {
    const fileId = String(input.fileId || "");
    const { db, bucket } = getBindings();
    const file = await db.prepare("SELECT object_key, filename, mime_type FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'audio' AND deleted_at IS NULL").bind(fileId, ownerId).first<JobRow>();
    if (!file) throw new ApiError(404, "录音文件不存在");
    const object = await bucket.get(String(file.object_key));
    if (!object) throw new ApiError(404, "录音内容不存在");
    const output = await transcribeAudio({ bytes: await object.arrayBuffer(), filename: String(file.filename), mimeType: String(file.mime_type) });
    return { result: { text: output.text, segmentIndex: Number(input.segmentIndex || 0) }, usage: (output.raw.usage || {}) as Record<string, unknown>, confidence: "medium", record: null };
  }
  throw new ApiError(400, "不支持的 AI 任务");
}

export async function runAIJob(ownerId: string, id: string) {
  const db = getDatabase();
  const row = await db.prepare("SELECT * FROM ai_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<JobRow>();
  if (!row) throw new ApiError(404, "AI 任务不存在");
  if (row.status === "cancelled") throw new ApiError(409, "任务已取消");
  if (row.status === "succeeded") return getAIJob(ownerId, id);
  if (row.status === "running") return getAIJob(ownerId, id);
  const jobInput = safeJson<Record<string, unknown>>(String(row.input_snapshot), {});
  if (row.type === "job_capture_url" && jobInput.readStrategy !== "model" && publicAtsSource(String(jobInput.sourceUrl || ""))) {
    row.model = "public-ats-parser"; row.prompt_version = "public-ats-v2";
  }
  const started = Date.now();
  const claimed = await db.prepare("UPDATE ai_jobs SET status = 'running', model = ?, prompt_version = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP, error_code = NULL, error_message = NULL, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ? AND status = 'queued'").bind(String(row.model), String(row.prompt_version), id, ownerId, Number(row.version)).run();
  if (!claimed.meta.changes) return getAIJob(ownerId, id);
  const runVersion = Number(row.version) + 1;
  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM ai_job_attempts WHERE job_id = ?").bind(id).first<JobRow>();
  let nextAttempt = Number(countRow?.count || 0) + 1;
  for (let automaticAttempt = 0; automaticAttempt < 3; automaticAttempt++, nextAttempt++) {
    if (automaticAttempt > 0) {
      const active = await db.prepare("SELECT status, version FROM ai_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<JobRow>();
      if (active?.status !== "running" || Number(active.version) !== runVersion) return getAIJob(ownerId, id);
    }
    const isCapture = ["job_capture_url", "job_capture_image"].includes(String(row.type));
    const trace: CaptureTrace = { telemetry: { profile: String(jobInput.executionProfile || "legacy"), route: "", phases: [], usage: {} },
      async measure<T>(phase: string, action: () => Promise<T>): Promise<T> {
        const start = Date.now();
        await db.prepare("UPDATE ai_jobs SET phase = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND id = ? AND status = 'running' AND version = ?").bind(phase, ownerId, id, runVersion).run();
        try { return await action(); }
        finally { trace.telemetry.phases.push({ phase, startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(), elapsedMs: Date.now() - start }); }
      } };
    const attemptId = crypto.randomUUID();
    await db.prepare("INSERT INTO ai_job_attempts (id, job_id, owner_id, attempt_number, model, status) VALUES (?, ?, ?, ?, ?, 'running')").bind(attemptId, id, ownerId, nextAttempt, String(row.model)).run();
    try {
      const featureType = ["jd_requirements_extract", "resume_text_extract", "resume_gap_analysis"].includes(String(row.type));
      const output = featureType ? await executeJDJob(ownerId, id, String(row.type), jobInput) : await execute(ownerId, String(row.type) as AIJobType, jobInput, trace);
      const current = await db.prepare("SELECT status, version FROM ai_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<JobRow>();
      if (current?.status !== "running" || Number(current.version) !== runVersion) {
        await db.prepare("UPDATE ai_job_attempts SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP, response_summary = ?, telemetry = ? WHERE id = ?").bind("本次执行已取消或失效，迟到结果已丢弃", JSON.stringify(trace.telemetry), attemptId).run();
        return getAIJob(ownerId, id);
      }
      let resultRecordId: string | null = null;
      const payload = { ...(output.result as Record<string, unknown>), model: String(row.model), promptVersion: String(row.prompt_version), elapsedMs: Date.now() - started };
      const resultWrites: D1PreparedStatement[] = "writes" in output ? output.writes : [];
      if ("resultId" in output) resultRecordId = output.resultId;
      if (output.record) { resultRecordId = crypto.randomUUID(); resultWrites.push(insertRecord(ownerId, output.record.kind, output.record.title, payload, resultRecordId)); }
      const sourceRefs = [...safeJson<unknown[]>(String(row.source_refs), []), ...(Array.isArray((output.result as Record<string, unknown>).sources) ? (output.result as Record<string, unknown>).sources as unknown[] : [])];
      const savingStartedAt = new Date().toISOString();
      const persist = () => atomicBatch([
        versionGuard(ownerId, id, runVersion, "ai_jobs", "running"), ...resultWrites,
        db.prepare("UPDATE ai_job_attempts SET status = 'succeeded', token_usage = ?, response_summary = ?, telemetry = json_insert(?, '$.phases[#]', json_object('phase', 'saving_result', 'startedAt', ?, 'finishedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'elapsedMs', max(0, CAST((julianday('now') - julianday(?)) * 86400000 AS INTEGER)))), finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(output.usage || {}), JSON.stringify(payload).slice(0, 1000), JSON.stringify(trace.telemetry), savingStartedAt, savingStartedAt, attemptId),
        db.prepare("UPDATE ai_jobs SET status = 'succeeded', phase = 'completed', result = ?, result_record_id = ?, source_refs = ?, confidence = ?, elapsed_ms = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND status = 'running'").bind(JSON.stringify(payload), resultRecordId, JSON.stringify(sourceRefs), output.confidence, Date.now() - started, id, ownerId),
      ]);
      await persist();
      return getAIJob(ownerId, id);
    } catch (error) {
      const current = await db.prepare("SELECT status, version FROM ai_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<JobRow>();
      if (current?.status !== "running" || Number(current.version) !== runVersion) {
        await db.prepare("UPDATE ai_job_attempts SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP, response_summary = ?, telemetry = ? WHERE id = ? AND owner_id = ? AND status = 'running'").bind("本次执行已取消或失效，未修改新一轮任务", JSON.stringify(trace.telemetry), attemptId, ownerId).run();
        return getAIJob(ownerId, id);
      }
      const detail = aiErrorDetails(error);
      if (isCapture) await db.batch([db.prepare("UPDATE ai_job_attempts SET telemetry = ? WHERE id = ? AND owner_id = ?").bind(JSON.stringify(trace.telemetry), attemptId, ownerId), db.prepare("UPDATE ai_jobs SET phase = 'failed' WHERE id = ? AND owner_id = ? AND status = 'running' AND version = ?").bind(id, ownerId, runVersion)]);
      await db.prepare("UPDATE ai_job_attempts SET status = 'failed', error_code = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(detail.code, detail.message, attemptId).run();
      if (detail.retryable && automaticAttempt < 2) continue;
      await db.prepare("UPDATE ai_jobs SET status = 'failed', error_code = ?, error_message = ?, elapsed_ms = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND status = 'running' AND version = ?").bind(detail.code, detail.message, Date.now() - started, id, ownerId, runVersion).run();
      throw error;
    }
  }
  return getAIJob(ownerId, id);
}

export async function cancelAIJob(ownerId: string, id: string) {
  const result = await getDatabase().prepare("UPDATE ai_jobs SET status = 'cancelled', phase = 'cancelled', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND status IN ('queued','running','failed')").bind(id, ownerId).run();
  if (!result.meta.changes) throw new ApiError(409, "任务无法取消或不存在");
  return getAIJob(ownerId, id);
}

export async function retryAIJob(ownerId: string, id: string) {
  const result = await getDatabase().prepare("UPDATE ai_jobs SET status = 'queued', result = NULL, result_record_id = NULL, error_code = NULL, error_message = NULL, finished_at = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND owner_id = ? AND status IN ('failed','cancelled') AND (capture_key IS NULL OR NOT EXISTS (SELECT 1 FROM ai_jobs AS active WHERE active.owner_id = ai_jobs.owner_id AND active.capture_key = ai_jobs.capture_key AND active.status IN ('queued','running')))").bind(id, ownerId).run();
  if (!result.meta.changes) throw new ApiError(409, "仅失败或已取消任务可重试；同一岗位已有运行任务时请先查看该任务");
  return runAIJob(ownerId, id);
}

export async function expireStaleJobs(ownerId: string) {
  await getDatabase().prepare("UPDATE ai_jobs SET status = 'failed', error_code = 'STALE_TIMEOUT', error_message = '任务超过 10 分钟没有更新，可手动重试', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE owner_id = ? AND status = 'running' AND updated_at < datetime('now', '-10 minutes')").bind(ownerId).run();
}
