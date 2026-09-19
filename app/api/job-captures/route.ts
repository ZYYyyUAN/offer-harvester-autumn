import { z } from "zod";
import { createAIJob, runAIJob } from "@/lib/ai-jobs";
import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";

const InputSchema = z.object({ sourceUrl: z.string().url().max(2000).optional(), screenshotFileId: z.string().uuid().optional() }).refine((value) => Boolean(value.sourceUrl || value.screenshotFileId), "请提供岗位链接或截图");

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const input = InputSchema.parse(await request.json());
    if (input.screenshotFileId) {
      const file = await getDatabase().prepare("SELECT id FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(input.screenshotFileId, userId).first();
      if (!file) throw new ApiError(404, "岗位截图不存在");
    }
    const type = input.screenshotFileId ? "job_capture_image" : "job_capture_url";
    const created = await createAIJob(userId, type, input, { sourceRefs: [{ type: input.screenshotFileId ? "job_screenshot" : "job_url", id: input.screenshotFileId || input.sourceUrl }] });
    return Response.json(await runAIJob(userId, created.job.id), { status: 201 });
  } catch (error) { return apiError(error); }
}
