import { z } from "zod";
import { checklistKeys } from "@/lib/workflow-contracts";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { ownedRecord } from "@/lib/jd-store";
import { saveApplication } from "@/lib/application-submission";
import { JobMetadataSchema } from "@/lib/job-metadata";
import { validateJobMetadata } from "@/lib/job-metadata-store";
const Input = z.object({ id: z.string().min(1), key: z.enum(checklistKeys), done: z.boolean(), version: z.number().int().positive(), jobMetadata: JobMetadataSchema.optional() }).strict();
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const input = Input.parse(await request.json());
    const current = await ownedRecord(userId, input.id, "applications");
    if (current.version !== input.version) throw new ApiError(409, "投递记录已更新", "VERSION_CONFLICT", false, { currentVersion: current.version });
    const data: Record<string, any> = { ...current.data, checklist: { ...current.data.checklist, [input.key]: { done: input.done, at: new Date().toISOString() } } };
    if (input.key === "submitted" && input.done && data.stage === "待投递") data.stage = "已投递";
    if (input.jobMetadata) data.jobMetadata = (await validateJobMetadata(userId, { ...data, jobMetadata: input.jobMetadata }, current.data)).jobMetadata;
    const record = await saveApplication(userId, current.id, data, current);
    return Response.json({ ok: true, checklist: record.data.checklist, stage: record.data.stage });
  } catch (error) { return apiError(error); }
}
