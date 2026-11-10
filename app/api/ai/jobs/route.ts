import { z } from "zod";
import { AIJobTypeSchema } from "@/lib/ai-contracts";
import { createAIJob, expireStaleJobs, mapAIJob } from "@/lib/ai-jobs";
import { ApiError, apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";

const CreateSchema = z.object({
  type: AIJobTypeSchema.exclude(["evaluation_case", "jd_requirements_extract", "resume_text_extract", "resume_gap_analysis"]),
  input: z.record(z.string(), z.unknown()).default({}),
  sourceRefs: z.array(z.unknown()).optional(),
}).strict();

export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser();
    await expireStaleJobs(userId);
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const date = url.searchParams.get("date");
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || 20)));
    const where = ["owner_id = ?"];
    const values: unknown[] = [userId];
    if (type) { where.push("type = ?"); values.push(type); }
    if (status) { where.push("status = ?"); values.push(status); }
    if (date) { where.push("date(created_at) = date(?)"); values.push(date); }
    const count = await getDatabase().prepare(`SELECT COUNT(*) AS count FROM ai_jobs WHERE ${where.join(" AND ")}`).bind(...values).first<Record<string, unknown>>();
    const rows = await getDatabase().prepare(`SELECT * FROM ai_jobs WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>();
    const legacyRows = page === 1 && !type && !status && !date ? await getDatabase().prepare("SELECT id, kind, title, data, version, created_at, updated_at, deleted_at FROM records WHERE owner_id = ? AND kind IN ('analyses','research') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20").bind(userId).all<Record<string, unknown>>() : { results: [] };
    return Response.json({ jobs: rows.results.map(mapAIJob), total: Number(count?.count || 0), page, pageSize, legacy: legacyRows.results.map((row) => ({ ...mapRecord(row), legacy: true, traceabilityComplete: false, notice: "旧版记录，追溯字段不完整" })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "AI 任务参数不完整");
    const input = { ...parsed.data.input };
    const sourceRefs = [...(parsed.data.sourceRefs || [])];
    if (parsed.data.type === "job_analysis") {
      const evidenceRows = await getDatabase().prepare("SELECT id, data FROM records WHERE owner_id = ? AND kind = 'evidence' AND deleted_at IS NULL").bind(userId).all<Record<string, unknown>>();
      input.evidence = evidenceRows.results.map((row) => ({ id: String(row.id), ...safeJson<Record<string, unknown>>(String(row.data), {}) } as Record<string, unknown>)).filter((item) => item.status === "confirmed");
      sourceRefs.push(...(input.evidence as Array<Record<string, unknown>>).map((item) => ({ type: "evidence", id: item.id })));
    }
    if (parsed.data.type === "resume_suggestions") sourceRefs.push({ type: "resume", id: String(input.fileId || "") });
    if (parsed.data.type === "transcription") sourceRefs.push({ type: "audio", id: String(input.fileId || ""), segmentIndex: input.segmentIndex ?? 0 });
    if (parsed.data.type === "foreign_interview_review") sourceRefs.push({ type: "practice_answer", id: crypto.randomUUID() });
    if (parsed.data.type === "job_capture_url") sourceRefs.push({ type: "job_url", id: String(input.sourceUrl || "") });
    if (parsed.data.type === "job_capture_image") sourceRefs.push({ type: "job_screenshot", id: String(input.fileId || "") });
    const created = await createAIJob(userId, parsed.data.type, input, { sourceRefs });
    return Response.json(created, { status: 201 });
  } catch (error) { return apiError(error); }
}
