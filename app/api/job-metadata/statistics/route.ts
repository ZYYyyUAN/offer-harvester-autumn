import { z } from "zod";
import { apiError, getDatabase, mapRecord, requireApiUser } from "@/lib/server-data";
import { metadataStatistics } from "@/lib/job-metadata-statistics";
import { JobSearchSettingsSchema } from "@/lib/workflow-contracts";
export async function GET(request: Request) {
  try {
    const { userId } = await requireApiUser(), url = new URL(request.url);
    const filters = z.object({ discoverySource: z.string().max(100).optional(), channel: z.string().max(100).optional(), referralStatus: z.string().max(100).optional(), companyNature: z.string().max(100).optional(), companyTags: z.string().max(1000).optional(), tagMatch: z.enum(["any", "all"]).optional() }).strict().parse(Object.fromEntries(url.searchParams));
    const db = getDatabase(); const [rows, profile] = await Promise.all([db.prepare("SELECT * FROM records WHERE owner_id = ? AND deleted_at IS NULL").bind(userId).all<Record<string, unknown>>(), db.prepare("SELECT data FROM profiles WHERE owner_id = ?").bind(userId).first<{ data: string }>()]);
    const settings = JobSearchSettingsSchema.parse(profile ? JSON.parse(profile.data).jobSearchSettings || {} : {});
    return Response.json(metadataStatistics(rows.results.map(mapRecord), settings.minimumSample, { ...filters, companyTags: filters.companyTags?.split(",").filter(Boolean) }));
  } catch (error) { return apiError(error); }
}
