import { z } from "zod";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { CaptureDraftSchema } from "@/lib/job-metadata";
import { validateCaptureDraftReferences, validateJobMetadata } from "@/lib/job-metadata-store";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";

export async function GET(request: Request) {
  try { const { userId } = await requireApiUser(); const id = new URL(request.url).searchParams.get("id"); return Response.json(id ? { record: await ownedRecord(userId, id, "job_capture_drafts") } : { records: await listKind(userId, "job_capture_drafts") }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(), data = CaptureDraftSchema.parse(await request.json());
    await validateCaptureDraftReferences(userId, data);
    data.metadata = (await validateJobMetadata(userId, { ...data.values, jobMetadata: data.metadata })).jobMetadata;
    const id = crypto.randomUUID(); await atomicBatch([insertRecord(userId, "job_capture_drafts", "岗位收集草稿", data, id)]);
    return Response.json({ record: await ownedRecord(userId, id) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { userId } = await requireApiUser(), body = z.object({ id: z.string().uuid(), version: z.number().int().positive(), data: CaptureDraftSchema }).strict().parse(await request.json());
    const current = await ownedRecord(userId, body.id, "job_capture_drafts");
    if (current.version !== body.version || current.data.confirmedSavedJobId) throw new ApiError(409, "草稿已更新或已收藏，请刷新");
    await validateCaptureDraftReferences(userId, body.data);
    body.data.metadata = (await validateJobMetadata(userId, { ...body.data.values, jobMetadata: body.data.metadata }, { ...current.data.values, jobMetadata: current.data.metadata })).jobMetadata;
    await atomicBatch([versionGuard(userId, body.id, body.version), updateRecordStatement(userId, current, body.data)]);
    return Response.json({ record: await ownedRecord(userId, body.id) });
  } catch (error) { return apiError(error); }
}
