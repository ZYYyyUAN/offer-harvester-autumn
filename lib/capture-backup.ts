import { z } from "zod";
const Job = z.object({ id: z.string().min(1), capture_key: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(), phase: z.string().nullable().optional() });
const Telemetry = z.object({ profile: z.string(), route: z.string(), phases: z.array(z.object({ phase: z.string(), startedAt: z.string().datetime(), finishedAt: z.string().datetime(), elapsedMs: z.number().nonnegative() })), usage: z.record(z.string(), z.unknown()) });
export function validateCaptureAuditBackup(jobs: Record<string, unknown>[], attempts: Record<string, unknown>[]) {
  const ids = new Set<string>();
  for (const raw of jobs) { const job = Job.parse(raw); if (ids.has(job.id)) throw new Error("备份 AI 任务 ID 重复"); ids.add(job.id); }
  const attemptIds = new Set<string>();
  for (const attempt of attempts) {
    const id = z.string().min(1).parse(attempt.id);
    if (attemptIds.has(id) || !ids.has(String(attempt.job_id))) throw new Error("备份 AI 尝试重复或缺少所属任务");
    attemptIds.add(id);
    const telemetry = JSON.parse(String(attempt.telemetry || "{}"));
    if (Object.keys(telemetry).length) Telemetry.parse(telemetry);
  }
}
