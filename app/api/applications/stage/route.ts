import { z } from "zod";
import { apiError, requireApiUser, ApiError } from "@/lib/server-data";
import { ownedRecord } from "@/lib/jd-store";
import { saveApplication } from "@/lib/application-submission";
const Input = z.object({ id: z.string().min(1), version: z.number().int().positive(), stage: z.enum(["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"]), appliedAt: z.string().datetime().nullable().optional() }).strict();
export async function POST(request: Request) {
  try {
    const { userId } = await requireApiUser(); const input = Input.parse(await request.json());
    const current = await ownedRecord(userId, input.id, "applications");
    if (current.version !== input.version) throw new ApiError(409, "投递记录已更新", "VERSION_CONFLICT", false, { currentVersion: current.version });
    const record = await saveApplication(userId, current.id, { ...current.data, stage: input.stage, ...(input.appliedAt !== undefined ? { appliedAt: input.appliedAt } : {}) }, current);
    return Response.json({ ok: true, stage: record.data.stage });
  } catch (error) { return apiError(error); }
}
