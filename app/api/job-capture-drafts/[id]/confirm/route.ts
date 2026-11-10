import { apiError, requireApiUser } from "@/lib/server-data";
import { CaptureConfirmationSchema, saveCapturedJob } from "@/lib/job-capture-save";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), input = { ...CaptureConfirmationSchema.parse(await request.json()), draftId: (await context.params).id };
    return Response.json(await saveCapturedJob(userId, input, {}));
  } catch (error) { return apiError(error); }
}
