import { z } from "zod";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { JobMetadataSchema } from "@/lib/job-metadata";
import { submissionMetadata, validateJobMetadata } from "@/lib/job-metadata-store";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), id = (await context.params).id; await ownedRecord(userId, id, "applications");
    return Response.json({ submissions: (await listKind(userId, "job_submissions")).filter((r) => r.data.applicationId === id), revisions: (await listKind(userId, "submission_metadata_revisions")).filter((r) => r.data.applicationId === id) });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), id = (await context.params).id;
    const body = z.object({ version: z.number().int().positive(), expectedRevision: z.number().int().nonnegative(), jobMetadata: JobMetadataSchema, reason: z.string().trim().min(1).max(1000) }).strict().parse(await request.json());
    const current = await ownedRecord(userId, id, "applications");
    if (current.version !== body.version) throw new ApiError(409, "投递记录已更新，请刷新");
    const submission = (await listKind(userId, "job_submissions")).find((r) => r.data.applicationId === id);
    if (!submission) throw new ApiError(422, "尚无真实投递归档，不能补录历史渠道");
    const previous = (await listKind(userId, "submission_metadata_revisions")).filter((r) => r.data.submissionId === submission.id).sort((a, b) => b.data.revision - a.data.revision)[0];
    if ((previous?.data.revision || 0) !== body.expectedRevision) throw new ApiError(409, "历史补录已变化，请刷新");
    const data = await validateJobMetadata(userId, { ...current.data, jobMetadata: body.jobMetadata });
    const revisionId = crypto.randomUUID();
    await atomicBatch([versionGuard(userId, id, body.version), updateRecordStatement(userId, current, current.data), insertRecord(userId, "submission_metadata_revisions", "投递分类与渠道补录", { applicationId: id, submissionId: submission.id, revision: body.expectedRevision + 1, previousRevisionId: previous?.id || null, metadata: submissionMetadata(data), reason: body.reason, recordedAt: new Date().toISOString() }, revisionId), insertRecord(userId, "activity_events", "补录历史投递分类与渠道", { entityType: "applications", entityId: id, action: "submission_metadata_corrected", revisionId, reason: body.reason })]);
    return Response.json({ record: await ownedRecord(userId, revisionId) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
