import { apiError, requireApiUser } from "@/lib/server-data";
import { retryAIJob } from "@/lib/ai-jobs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await retryAIJob(userId, (await context.params).id, request.signal));
  } catch (error) { return apiError(error); }
}
