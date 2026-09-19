import { percentile } from "@/lib/ai-contracts";
import { mapAIJob } from "@/lib/ai-jobs";
import { apiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    const id = (await context.params).id;
    const rows = await getDatabase().prepare("SELECT * FROM ai_jobs WHERE owner_id = ? AND batch_id = ? ORDER BY created_at ASC").bind(userId, id).all<Record<string, unknown>>();
    const jobs = rows.results.map(mapAIJob);
    const metrics = jobs.filter((job) => job.status === "succeeded").map((job) => ((job.result || {}) as unknown as Record<string, unknown>).evaluation as Record<string, unknown>).filter(Boolean);
    const matchedExpected = metrics.reduce((sum, item) => sum + Number(item.matchedExpected || 0), 0);
    const matchedPredicted = metrics.reduce((sum, item) => sum + Number(item.matchedPredicted || 0), 0);
    const expected = metrics.reduce((sum, item) => sum + Number(item.expectedCount || 0), 0);
    const predicted = metrics.reduce((sum, item) => sum + Number(item.predictedCount || 0), 0);
    const precision = predicted ? matchedPredicted / predicted : 0;
    const recall = expected ? matchedExpected / expected : 0;
    const attempts = await getDatabase().prepare("SELECT job_id, attempt_number, status, token_usage FROM ai_job_attempts WHERE owner_id = ? AND job_id IN (SELECT id FROM ai_jobs WHERE batch_id = ? AND owner_id = ?) ORDER BY job_id, attempt_number").bind(userId, id, userId).all<Record<string, unknown>>();
    const totalTokens = attempts.results.reduce((sum, row) => { const usage = safeJson<Record<string, unknown>>(String(row.token_usage || "{}"), {}); return sum + Number(usage.total_tokens || 0); }, 0);
    const attemptsByJob = new Map<string, Array<Record<string, unknown>>>();
    for (const attempt of attempts.results) attemptsByJob.set(String(attempt.job_id), [...(attemptsByJob.get(String(attempt.job_id)) || []), attempt]);
    const firstAttemptSuccesses = jobs.filter((job) => attemptsByJob.get(job.id)?.[0]?.status === "succeeded").length;
    const retriedJobs = jobs.filter((job) => (attemptsByJob.get(job.id)?.length || 0) > 1);
    const retrySuccesses = retriedJobs.filter((job) => job.status === "succeeded").length;
    const elapsed = jobs.filter((job) => job.elapsedMs != null).map((job) => Number(job.elapsedMs));
    const unsupportedFacts = metrics.flatMap((item) => (item.unsupportedFacts || []) as unknown[]);
    const invalidReferences = jobs.reduce((sum, job) => sum + Number(((job.result || {}) as unknown as Record<string, unknown>).invalidReferenceCount || 0), 0);
    const passed = jobs.length === 20 && jobs.every((job) => job.status === "succeeded") && (precision + recall ? 2 * precision * recall / (precision + recall) : 0) >= 0.9 && unsupportedFacts.length === 0 && invalidReferences === 0;
    return Response.json({ evaluation: { id, syntheticOnly: true, total: jobs.length, completed: jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length, succeeded: jobs.filter((job) => job.status === "succeeded").length, failed: jobs.filter((job) => job.status === "failed").length, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, unsupportedFactCount: unsupportedFacts.length, invalidReferenceCount: invalidReferences, schemaPassRate: metrics.length ? metrics.filter((item) => item.schemaValid).length / metrics.length : 0, firstAttemptSuccessRate: jobs.length ? firstAttemptSuccesses / jobs.length : 0, retrySuccessRate: retriedJobs.length ? retrySuccesses / retriedJobs.length : 1, p50Ms: percentile(elapsed, 0.5), p95Ms: percentile(elapsed, 0.95), totalTokens, passed }, jobs });
  } catch (error) { return apiError(error); }
}
