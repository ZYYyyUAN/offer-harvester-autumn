import { z } from "zod";
import { apiError, requireApiUser } from "@/lib/server-data";
import { resumeIdentity } from "@/lib/application-submission";
export async function GET(request: Request) {
  try { const {userId}=await requireApiUser(); const id=z.string().uuid().parse(new URL(request.url).searchParams.get("id")); const identity=await resumeIdentity(userId,id,{completedOnly:true}); return Response.json({fileId:id,version:identity.resumeFileVersion,sha256:identity.resumeSha256,displayName:identity.resumeDisplayName}); }
  catch(error) { return apiError(error); }
}
