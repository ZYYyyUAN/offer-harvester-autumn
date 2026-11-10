import { z } from "zod";

export const closureOutcomeLabels = { rejected: "被拒", withdrawn: "主动退出", position_closed: "岗位关闭", no_response: "长期无反馈", offer_declined: "拒绝 OFFER", offer_accepted: "接受 OFFER", joined: "已入职", other: "其他", unknown: "未知" } as const;
export const closureStageLabels = { before_submission: "投递前", resume_screening: "简历筛选", written_test: "笔试", interview: "面试", offer: "OFFER 沟通", unknown: "未知" } as const;
export const ApplicationClosureSchema = z.object({
  cycleId: z.string().uuid(),
  outcome: z.enum(Object.keys(closureOutcomeLabels) as [keyof typeof closureOutcomeLabels, ...Array<keyof typeof closureOutcomeLabels>]).default("unknown"),
  stage: z.enum(Object.keys(closureStageLabels) as [keyof typeof closureStageLabels, ...Array<keyof typeof closureStageLabels>]).default("unknown"),
  round: z.enum(["first", "second", "final", "hr", "custom"]).nullable().default(null), customRound: z.string().max(120).default(""),
  endedAt: z.string().datetime().nullable().default(null), reason: z.string().max(2000).default(""), notes: z.string().max(4000).default(""),
  confirmation: z.enum(["confirmed", "needs_review"]).default("needs_review"), source: z.enum(["user", "feishu", "import", "legacy", "unknown"]).default("unknown"), recordedAt: z.string().datetime(),
}).strict();

export function closureTransition(previous: Record<string, any> | null, next: Record<string, any>, now: string, cycleId: string) {
  if (next.stage === "已结束" && previous?.stage !== "已结束") {
    const supplied = next.closure && next.closure.cycleId !== previous?.closure?.cycleId ? next.closure : {};
    const closure = { ...ApplicationClosureSchema.parse({ ...supplied, cycleId, recordedAt: now }), cycleId, recordedAt: now };
    return { data: { ...next, closure }, event: { action: "application_closed", closure } };
  }
  if (previous?.stage === "已结束" && next.stage !== "已结束") return { data: { ...next, closure: null }, event: { action: "application_reopened", cycleId: previous.closure?.cycleId || null } };
  if (next.stage !== "已结束") return { data: { ...next, closure: null }, event: null };
  const closure = next.closure ? { ...next.closure, cycleId: previous?.closure?.cycleId || cycleId } : previous?.closure || null;
  if (JSON.stringify(previous?.closure || null) === JSON.stringify(closure)) return { data: { ...next, closure }, event: null };
  const corrected = { ...closure, recordedAt: now };
  return { data: { ...next, closure: corrected }, event: { action: "application_closure_corrected", previousClosure: previous?.closure || null, closure: corrected } };
}
