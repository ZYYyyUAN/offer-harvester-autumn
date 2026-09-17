import { apiError, requireApiUser } from "@/lib/server-data";
import { cancelAIJob } from "@/lib/ai-jobs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await cancelAIJob(userId, (await context.params).id));
  } catch (error) { return apiError(error); }
}
