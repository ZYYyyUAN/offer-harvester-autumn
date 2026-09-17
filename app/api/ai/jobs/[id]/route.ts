import { apiError, requireApiUser } from "@/lib/server-data";
import { getAIJob } from "@/lib/ai-jobs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await getAIJob(userId, (await context.params).id));
  } catch (error) { return apiError(error); }
}
