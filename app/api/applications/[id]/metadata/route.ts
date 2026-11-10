import { apiError, requireApiUser } from "@/lib/server-data";
import { MetadataChangeSchema, validateJobMetadata } from "@/lib/job-metadata-store";
import { ApiError } from "@/lib/server-data";
import { ownedRecord } from "@/lib/jd-store";
import { saveApplication } from "@/lib/application-submission";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), input = MetadataChangeSchema.parse(await request.json()), current = await ownedRecord(userId, (await context.params).id, "applications");
    if (current.version !== input.version) throw new ApiError(409, "投递记录已更新，请刷新");
    const data = await validateJobMetadata(userId, { ...current.data, jobMetadata: input.jobMetadata }, current.data);
    return Response.json({ record: await saveApplication(userId, current.id, data, current) });
  } catch (error) { return apiError(error); }
}
