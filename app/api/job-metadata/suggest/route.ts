import { z } from "zod";
import { apiError, requireApiUser } from "@/lib/server-data";
import { JobMetadataSchema } from "@/lib/job-metadata";
import { suggestJobMetadata } from "@/lib/job-metadata-store";

export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser();
    const data = z.object({ company: z.string().max(240), sourceUrl: z.string().max(2000), companyType: z.string().optional(), channel: z.string().optional(), extractionJobId: z.string().uuid().optional(), jobMetadata: JobMetadataSchema.optional() }).strict().parse(await request.json());
    return Response.json(await suggestJobMetadata(userId, data));
  } catch (error) { return apiError(error); }
}
