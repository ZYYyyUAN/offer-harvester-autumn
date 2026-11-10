import { z } from "zod";
import { apiError, getDatabase, requireApiUser, safeJson } from "@/lib/server-data";
import { listKind } from "@/lib/jd-store";
import { closureStatistics } from "@/lib/closure-statistics";
import { JobSearchSettingsSchema } from "@/lib/workflow-contracts";
export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default("");
    const input = z.object({ from: date, to: date }).strict().refine((value) => !value.from || !value.to || value.from <= value.to, { message: "开始日期不能晚于结束日期" }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const profile = await getDatabase().prepare("SELECT data FROM profiles WHERE owner_id = ?").bind(userId).first<{ data: string }>();
    const settings = JobSearchSettingsSchema.parse(profile ? safeJson<Record<string, any>>(profile.data, {}).jobSearchSettings || {} : {});
    return Response.json(closureStatistics(await listKind(userId, "applications"), settings.minimumSample, input.from, input.to));
  } catch (error) { return apiError(error); }
}
