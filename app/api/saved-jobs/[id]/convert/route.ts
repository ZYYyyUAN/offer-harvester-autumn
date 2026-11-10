import { z } from "zod";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { ApplicationDataSchema } from "@/lib/data-contracts";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";
import { applicationSaveStatements } from "@/lib/application-submission";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), id = (await context.params).id;
    const body = z.object({ version: z.number().int().positive(), idempotencyKey: z.string().min(1).max(200) }).strict().parse(await request.json());
    const saved = await ownedRecord(userId, id, "saved_jobs");
    const converted = (await listKind(userId, "applications")).filter((r) => r.data.savedJobId === id);
    if (converted.length > 1) throw new ApiError(409, "此收藏已有多条投递，请先核对现有记录");
    if (converted.length === 1) return Response.json({ record: converted[0], reused: true });
    if (!String(saved.data.company || "").trim() || !String(saved.data.role || "").trim()) throw new ApiError(422, "请先编辑收藏，补充公司与岗位名称后再转入投递");
    if (saved.version !== body.version) throw new ApiError(409, "收藏岗位已更新，请刷新");
    const applicationId = crypto.randomUUID();
    const data = ApplicationDataSchema.parse({ ...saved.data, stage: "待投递", appliedAt: null, savedJobId: id, conversionKey: id, conversionOperationId: body.idempotencyKey, converted: undefined, convertedAt: undefined, convertedApplicationId: undefined, checklist: {}, jobMetadata: saved.data.jobMetadata ? { ...saved.data.jobMetadata, actualSubmission: null } : undefined });
    await atomicBatch([
      versionGuard(userId, id, saved.version),
      ...(await applicationSaveStatements(userId, applicationId, data, null, body.idempotencyKey)),
      updateRecordStatement(userId, saved, { ...saved.data, converted: true, convertedAt: new Date().toISOString(), convertedApplicationId: applicationId }),
      insertRecord(userId, "activity_events", "收藏转入待投递", { entityType: "applications", entityId: applicationId, savedJobId: id, action: "saved_job_converted" }),
    ]);
    return Response.json({ record: await ownedRecord(userId, applicationId), reused: false }, { status: 201 });
  } catch (error) { return apiError(error); }
}
