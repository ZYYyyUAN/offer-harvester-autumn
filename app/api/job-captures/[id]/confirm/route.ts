import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";
import { CaptureConfirmationSchema, saveCapturedJob } from "@/lib/job-capture-save";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), jobId = (await context.params).id;
    const input = CaptureConfirmationSchema.parse(await request.json());
    const job = await getDatabase().prepare("SELECT status, result, version FROM ai_jobs WHERE id = ? AND owner_id = ? AND type IN ('job_capture_url','job_capture_image')").bind(jobId, userId).first<{ status: string; result: string; version: number }>();
    if (!job || job.status !== "succeeded") throw new ApiError(409, "岗位提取尚未成功完成");
    return Response.json(await saveCapturedJob(userId, input, JSON.parse(job.result), jobId, job.version), { status: 201 });
  } catch (error) { return apiError(error); }
}
