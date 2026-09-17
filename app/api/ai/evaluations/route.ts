import { evaluationCases } from "@/lib/ai-evaluation-cases";
import { createAIJob } from "@/lib/ai-jobs";
import { apiError, getDatabase, requireApiUser } from "@/lib/server-data";

export async function POST() {
  try {
    const { userId } = await requireApiUser();
    const batchId = crypto.randomUUID();
    const recordId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await getDatabase().prepare("INSERT INTO records (id, owner_id, kind, title, data) VALUES (?, ?, 'ai_evaluations', ?, ?)").bind(recordId, userId, `20 组合成回归 · ${createdAt.slice(0, 10)}`, JSON.stringify({ batchId, title: "AI 可信度回归", syntheticOnly: true, caseCount: evaluationCases.length, createdAt })).run();
    const jobs = [];
    for (const fixture of evaluationCases) jobs.push((await createAIJob(userId, "evaluation_case", { caseId: fixture.id }, { batchId, sourceRefs: [{ type: "synthetic_fixture", id: fixture.id }] })).job);
    return Response.json({ evaluation: { id: batchId, recordId, syntheticOnly: true, caseCount: jobs.length }, jobs }, { status: 201 });
  } catch (error) { return apiError(error); }
}
