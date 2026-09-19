import { evaluationCases } from "@/lib/ai-evaluation-cases";
import { createAIJob, mapAIJob, runAIJob } from "@/lib/ai-jobs";
import { percentile } from "@/lib/ai-contracts";
import { apiError, getDatabase, safeJson } from "@/lib/server-data";
import { analyzeResumeFile, ocrImage, responsesSearch, transcribeAudio } from "@/lib/qwen";
import { ResumeSuggestionSchema, resumeJsonSchema } from "@/lib/ai-contracts";

const syntheticOwner = "system_synthetic_evaluation";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; jobId?: string; audioBase64?: string; imageBase64?: string; sourceUrl?: string };
    if (body.action === "jobCaptureUrlSmoke" && body.sourceUrl) {
      const created = await createAIJob(syntheticOwner, "job_capture_url", { sourceUrl: body.sourceUrl }, { sourceRefs: [{ type: "public_url", id: body.sourceUrl }] });
      const job = await runAIJob(syntheticOwner, created.job.id);
      return Response.json({ ok: job.job.status === "succeeded", job: job.job, attempts: job.attempts });
    }
    if (body.action === "ocrSmoke" && body.imageBase64) {
      const bytes = Uint8Array.from(atob(body.imageBase64), (value) => value.charCodeAt(0)).buffer;
      const result = await ocrImage({ bytes, mimeType: "image/png" });
      return Response.json({ ok: result.text.length > 0, text: result.text });
    }
    if (body.action === "documentSmoke") {
      const bytes = new TextEncoder().encode("张晓，数据分析实习生。使用 SQL 分析课程平台留存，完成三张业务表清洗；使用 Python 构建课程预测回归模型。以上为合成测试资料。").buffer;
      const result = await analyzeResumeFile({ bytes, filename: "synthetic-resume.txt" }, "提取可验证事实并给出一条保守建议。", resumeJsonSchema, ResumeSuggestionSchema);
      return Response.json({ ok: true, factCount: Array.isArray(result.facts) ? result.facts.length : 0 });
    }
    if (body.action === "searchSmoke") {
      const result = await responsesSearch({ system: "仅总结可检索到的公开资料。", prompt: "检索阿里云官方网站，简述其大模型服务平台百炼。", schemaName: "search_smoke", schema: { type: "object", additionalProperties: false, required: ["answer"], properties: { answer: { type: "string" } } } });
      const sources = result.sources;
      return Response.json({ ok: sources.length > 0, sourceCount: sources.length, sources: sources.slice(0, 3) });
    }
    if (body.action === "asrSmoke" && body.audioBase64) {
      const bytes = Uint8Array.from(atob(body.audioBase64), (value) => value.charCodeAt(0)).buffer;
      const result = await transcribeAudio({ bytes, filename: "synthetic-speech.wav", mimeType: "audio/wav" });
      return Response.json({ ok: true, text: result.text });
    }
    if (body.action === "create") {
      const batchId = crypto.randomUUID();
      const jobs = [];
      for (const fixture of evaluationCases) jobs.push((await createAIJob(syntheticOwner, "evaluation_case", { caseId: fixture.id }, { batchId, sourceRefs: [{ type: "synthetic_fixture", id: fixture.id }] })).job);
      return Response.json({ batchId, jobs });
    }
    if (body.action === "run" && body.jobId) return Response.json(await runAIJob(syntheticOwner, body.jobId));
    return Response.json({ error: "invalid action" }, { status: 400 });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get("batchId") || "";
    const rows = await getDatabase().prepare("SELECT * FROM ai_jobs WHERE owner_id = ? AND batch_id = ? ORDER BY created_at ASC").bind(syntheticOwner, batchId).all<Record<string, unknown>>();
    const jobs = rows.results.map(mapAIJob);
    const metrics = jobs.filter((job) => job.status === "succeeded").map((job) => ((job.result || {}) as Record<string, unknown>).evaluation as Record<string, unknown>).filter(Boolean);
    const matchedExpected = metrics.reduce((sum, item) => sum + Number(item.matchedExpected || 0), 0);
    const matchedPredicted = metrics.reduce((sum, item) => sum + Number(item.matchedPredicted || 0), 0);
    const expected = metrics.reduce((sum, item) => sum + Number(item.expectedCount || 0), 0);
    const predicted = metrics.reduce((sum, item) => sum + Number(item.predictedCount || 0), 0);
    const precision = predicted ? matchedPredicted / predicted : 0; const recall = expected ? matchedExpected / expected : 0;
    const attempts = await getDatabase().prepare("SELECT token_usage, status FROM ai_job_attempts WHERE owner_id = ? AND job_id IN (SELECT id FROM ai_jobs WHERE batch_id = ? AND owner_id = ?)").bind(syntheticOwner, batchId, syntheticOwner).all<Record<string, unknown>>();
    const totalTokens = attempts.results.reduce((sum, row) => sum + Number(safeJson<Record<string, unknown>>(String(row.token_usage || "{}"), {}).total_tokens || 0), 0);
    const elapsed = jobs.flatMap((job) => job.elapsedMs == null ? [] : [job.elapsedMs]);
    const unsupportedFacts = metrics.flatMap((item) => (item.unsupportedFacts || []) as unknown[]);
    const invalidReferences = jobs.reduce((sum, job) => sum + Number(((job.result || {}) as Record<string, unknown>).invalidReferenceCount || 0), 0);
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    return Response.json({ evaluation: { batchId, total: jobs.length, completed: jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length, succeeded: jobs.filter((job) => job.status === "succeeded").length, failed: jobs.filter((job) => job.status === "failed").length, precision, recall, f1, unsupportedFactCount: unsupportedFacts.length, invalidReferenceCount: invalidReferences, schemaPassRate: metrics.length ? metrics.filter((item) => item.schemaValid).length / metrics.length : 0, firstAttemptSuccessRate: jobs.length ? jobs.filter((job) => job.status === "succeeded").length / jobs.length : 0, retrySuccessRate: jobs.length ? jobs.filter((job) => job.status === "succeeded").length / Math.max(1, jobs.filter((job) => job.status !== "queued").length) : 0, p50Ms: percentile(elapsed, .5), p95Ms: percentile(elapsed, .95), totalTokens, passed: jobs.length === 20 && jobs.every((job) => job.status === "succeeded") && f1 >= .9 && unsupportedFacts.length === 0 && invalidReferences === 0 }, jobs });
  } catch (error) { return apiError(error); }
}
