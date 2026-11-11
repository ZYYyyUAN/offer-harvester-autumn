import { IntakeConfirmationV2Schema } from "@/lib/submission-intake-contracts";
import { confirmSubmissionIntake } from "@/lib/submission-intake";
import { apiError, requireApiUser } from "@/lib/server-data";
import { CaptureConfirmationSchema, saveCapturedJob } from "@/lib/job-capture-save";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireApiUser(), body = await request.json(), draftId = (await context.params).id;
    if (body && typeof body === "object" && "requestVersion" in body) return Response.json(await confirmSubmissionIntake(userId, draftId, IntakeConfirmationV2Schema.parse(body)));
    const input = { ...CaptureConfirmationSchema.parse(body), draftId };
    return Response.json(await saveCapturedJob(userId, input, {}));
  } catch (error) { return apiError(error); }
}
