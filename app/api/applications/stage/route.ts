import { ApplicationClosureSchema } from "@/lib/application-closure";
import { z } from "zod";
import { apiError, requireApiUser, ApiError } from "@/lib/server-data";
import { ownedRecord } from "@/lib/jd-store";
import { saveApplication } from "@/lib/application-submission";
import { JobMetadataSchema } from "@/lib/job-metadata";
import { validateJobMetadata } from "@/lib/job-metadata-store";
const Input = z.object({ id: z.string().min(1), version: z.number().int().positive(), stage: z.enum(["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"]), appliedAt: z.string().datetime().nullable().optional(), jobMetadata: JobMetadataSchema.optional(), closure: ApplicationClosureSchema.optional() }).strict();
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const input = Input.parse(await request.json());
    const current = await ownedRecord(userId, input.id, "applications");
    if (current.version !== input.version) throw new ApiError(409, "投递记录已更新", "VERSION_CONFLICT", false, { currentVersion: current.version });
    const data = { ...current.data, stage: input.stage, ...(input.closure ? { closure: input.closure } : {}), ...(input.appliedAt !== undefined ? { appliedAt: input.appliedAt, appliedAtStatus:input.appliedAt?"known":"unknown" } : {}), ...(input.jobMetadata ? { jobMetadata: input.jobMetadata } : {}) }; const record = await saveApplication(userId, current.id, input.jobMetadata ? await validateJobMetadata(userId, data, current.data) : data, current);
    return Response.json({ ok: true, stage: record.data.stage });
  } catch (error) { return apiError(error); }
}
