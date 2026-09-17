import { apiError, requireApiUser } from "@/lib/server-data";
import { runAIJob } from "@/lib/ai-jobs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser();
    return Response.json(await runAIJob(userId, (await context.params).id));
  } catch (error) { return apiError(error); }
}
