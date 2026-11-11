import { z } from "zod";
import { apiError, ApiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";
import { submissionDisplaySql } from "@/lib/submission-display";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const row=await getDatabase().prepare("SELECT application.*, ("+submissionDisplaySql+") AS submission_display FROM records application WHERE application.id = ? AND application.owner_id = ? AND application.kind = 'applications' AND application.deleted_at IS NULL").bind(id,userId).first<Record<string,unknown>>();
    if(!row)throw new ApiError(404,"投递记录不存在");
    return Response.json({record:{...mapRecord(row),submission:row.submission_display?safeJson(String(row.submission_display),null):null}});
  } catch (error) { return apiError(error); }
}
