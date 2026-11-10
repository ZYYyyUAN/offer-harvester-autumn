import { z } from "zod";
import { createAIJob, getAIJob, runAIJob } from "@/lib/ai-jobs";
import { ApiError, apiError, getDatabase, requireApiUser } from "@/lib/server-data";
import { captureIdentity, CaptureProfileSchema } from "@/lib/capture-contracts";
import { sha256Hex } from "@/lib/data-safety";

const InputSchema = z.object({ sourceUrl: z.string().url().max(2000).optional(), screenshotFileId: z.string().uuid().optional(), wait: z.boolean().default(true), refresh: z.boolean().default(false), executionProfile: CaptureProfileSchema, readStrategy: z.enum(["auto", "model"]).default("auto") }).strict().refine((value) => Boolean(value.sourceUrl || value.screenshotFileId), "请提供岗位链接或截图");

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const input = InputSchema.parse(await request.json());
    let screenshotSha256: string | undefined;
    if (input.screenshotFileId) {
      const file = await getDatabase().prepare("SELECT metadata FROM stored_files WHERE id = ? AND owner_id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(input.screenshotFileId, userId).first<{ metadata: string }>();
      if (!file) throw new ApiError(404, "岗位截图不存在");
      screenshotSha256 = JSON.parse(file.metadata).sha256 || input.screenshotFileId;
    }
    else if (!/^https?:\/\//i.test(input.sourceUrl!)) throw new ApiError(400, "请输入有效的公开岗位链接");
    const captureKey = await sha256Hex(new TextEncoder().encode(captureIdentity({ sourceUrl: input.sourceUrl, screenshotSha256 }, input.executionProfile + ":" + input.readStrategy)).buffer);
    const prior = await getDatabase().prepare("SELECT id, status FROM ai_jobs WHERE owner_id = ? AND capture_key = ? AND status IN ('queued','running','succeeded') ORDER BY CASE WHEN status IN ('queued','running') THEN 0 ELSE 1 END, created_at DESC LIMIT 1").bind(userId, captureKey).first<{ id: string; status: string }>();
    if (prior && (prior.status !== "succeeded" || !input.refresh)) {
      const result = input.wait && prior.status === "queued" ? await runAIJob(userId, prior.id) : await getAIJob(userId, prior.id);
      return Response.json({ ...result, reused: true, existingResultAvailable: prior.status === "succeeded" });
    }
    const type = input.screenshotFileId ? "job_capture_image" : "job_capture_url";
    const jobInput = { ...(input.screenshotFileId ? { fileId: input.screenshotFileId } : { sourceUrl: input.sourceUrl }), executionProfile: input.executionProfile, readStrategy: input.readStrategy };
    const created = await createAIJob(userId, type, jobInput, { captureKey, sourceRefs: [{ type: input.screenshotFileId ? "job_screenshot" : "job_url", id: input.screenshotFileId || input.sourceUrl }] });
    return Response.json(input.wait ? await runAIJob(userId, created.job.id) : created, { status: input.wait ? 201 : 202 });
  } catch (error) { return apiError(error); }
}
