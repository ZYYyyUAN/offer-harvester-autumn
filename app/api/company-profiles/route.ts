import { z } from "zod";
import { ApiError, apiError, requireApiUser } from "@/lib/server-data";
import { atomicBatch, insertRecord, listKind, ownedRecord, updateRecordStatement, versionGuard } from "@/lib/jd-store";
import { CompanyProfileSchema } from "@/lib/job-metadata";

export async function GET() {
  try { const { userId } = await requireApiUser(); return Response.json({ records: await listKind(userId, "company_profiles") }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(), data = CompanyProfileSchema.omit({ confirmedAt: true }).parse(await request.json());
    if (data.researchRecordId) await ownedRecord(userId, data.researchRecordId, "research");
    const id = crypto.randomUUID();
    await atomicBatch([insertRecord(userId, "company_profiles", data.legalName, { ...data, confirmedAt: new Date().toISOString() }, id), insertRecord(userId, "activity_events", "确认公司主体资料", { entityType: "company_profiles", entityId: id, action: "company_profile_confirmed" })]);
    return Response.json({ record: await ownedRecord(userId, id) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { userId } = await requireApiUser(), body = z.object({ id: z.string().uuid(), version: z.number().int().positive(), data: CompanyProfileSchema.omit({ confirmedAt: true }) }).strict().parse(await request.json());
    const record = await ownedRecord(userId, body.id, "company_profiles");
    if (record.version !== body.version) throw new ApiError(409, "公司资料已更新，请刷新后重试");
    if (body.data.researchRecordId) await ownedRecord(userId, body.data.researchRecordId, "research");
    await atomicBatch([versionGuard(userId, record.id, body.version), updateRecordStatement(userId, record, { ...body.data, confirmedAt: new Date().toISOString() }), insertRecord(userId, "activity_events", "修订公司主体资料", { entityType: "company_profiles", entityId: record.id, action: "company_profile_updated", previousVersion: record.version })]);
    return Response.json({ record: await ownedRecord(userId, record.id) });
  } catch (error) { return apiError(error); }
}
