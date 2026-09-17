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
    const tp = metrics.reduce((sum, item) => sum + Number(item.truePositive || 0), 0);
    const expected = metrics.reduce((sum, item) => sum + Number(item.expectedCount || 0), 0);
    const predicted = metrics.reduce((sum, item) => sum + Number(item.predictedCount || 0), 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = expected ? tp / expected : 0;
    const attempts = await getDatabase().prepare("SELECT token_usage FROM ai_job_attempts WHERE owner_id = ? AND job_id IN (SELECT id FROM ai_jobs WHERE batch_id = ? AND owner_id = ?)").bind(userId, id, userId).all<Record<string, unknown>>();
    const totalTokens = attempts.results.reduce((sum, row) => { const usage = safeJson<Record<string, unknown>>(String(row.token_usage || "{}"), {}); return sum + Number(usage.total_tokens || 0); }, 0);
    const elapsed = jobs.filter((job) => job.elapsedMs != null).map((job) => Number(job.elapsedMs));
    const unsupportedFacts = metrics.flatMap((item) => (item.unsupportedFacts || []) as unknown[]);
    const invalidReferences = jobs.reduce((sum, job) => sum + Number(((job.result || {}) as unknown as Record<string, unknown>).invalidReferenceCount || 0), 0);
    const passed = jobs.length === 20 && jobs.every((job) => job.status === "succeeded") && (precision + recall ? 2 * precision * recall / (precision + recall) : 0) >= 0.9 && unsupportedFacts.length === 0 && invalidReferences === 0;
    return Response.json({ evaluation: { id, syntheticOnly: true, total: jobs.length, completed: jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length, succeeded: jobs.filter((job) => job.status === "succeeded").length, failed: jobs.filter((job) => job.status === "failed").length, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, unsupportedFactCount: unsupportedFacts.length, invalidReferenceCount: invalidReferences, schemaPassRate: metrics.length ? metrics.filter((item) => item.schemaValid).length / metrics.length : 0, p50Ms: percentile(elapsed, 0.5), p95Ms: percentile(elapsed, 0.95), totalTokens, passed }, jobs });
  } catch (error) { return apiError(error); }
}
