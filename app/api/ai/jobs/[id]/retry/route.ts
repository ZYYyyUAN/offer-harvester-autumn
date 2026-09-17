import { apiError, requireApiUser } from "@/lib/server-data";
import { retryAIJob } from "@/lib/ai-jobs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await retryAIJob(userId, (await context.params).id));
  } catch (error) { return apiError(error); }
}
