import { z } from "zod";
import { apiError, ApiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";
import { DefaultSubmissionResumeSchema } from "@/lib/submission-intake-contracts";
import { readSubmissionDefaults, validateDefaultSubmissionResume, submissionProfileVersionGuard } from "@/lib/submission-defaults";
import { atomicBatch, versionGuard } from "@/lib/jd-store";

export async function GET() { try { const { userId } = await requireApiUser(); return Response.json(await readSubmissionDefaults(userId)); } catch(error) { return apiError(error); } }
export async function PATCH(request: Request) {
  try {
    const { userId, email } = await requireApiUser();
    const input = z.object({ version: z.number().int().nonnegative(), defaultSubmissionResume: DefaultSubmissionResumeSchema }).strict().parse(await request.json());
    const db = getDatabase(), row = await db.prepare("SELECT data, version FROM profiles WHERE owner_id = ?").bind(userId).first<{data: string; version: number}>();
    if ((row?.version || 0) !== input.version) throw new ApiError(409,"个人设置已改变，请刷新后重试","VERSION_CONFLICT",false,{currentVersion:row?.version||0});
    await validateDefaultSubmissionResume(userId,input.defaultSubmissionResume);
    const data = { ...(row ? safeJson<Record<string, unknown>>(row.data,{}) : {email}), defaultSubmissionResume:input.defaultSubmissionResume };
    const guard = submissionProfileVersionGuard(userId,input.version);
    await atomicBatch([guard,...(input.defaultSubmissionResume?[versionGuard(userId,input.defaultSubmissionResume.fileId,input.defaultSubmissionResume.version,"stored_files")]:[]),row?db.prepare("UPDATE profiles SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND version = ?").bind(JSON.stringify(data),userId,input.version):db.prepare("INSERT INTO profiles(owner_id,data,version) VALUES(?,?,1)").bind(userId,JSON.stringify(data))]);
    return Response.json(await readSubmissionDefaults(userId));
  } catch(error) { return apiError(error); }
}
