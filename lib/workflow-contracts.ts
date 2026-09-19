import { z } from "zod";

export const JobCaptureDraftSchema = z.object({
  company: z.string().max(240).default(""),
  role: z.string().max(240).default(""),
  location: z.string().max(240).default(""),
  salary: z.string().max(240).default(""),
  deadline: z.string().max(40).default(""),
  jd: z.string().max(30000).default(""),
  sourceUrl: z.string().max(2000).default(""),
  evidence: z.array(z.object({ field: z.string(), quote: z.string().max(1200) }).strict()).max(30).default([]),
  warnings: z.array(z.string().max(800)).max(20).default([]),
}).strict();

export const jobCaptureJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["company", "role", "location", "salary", "deadline", "jd", "sourceUrl", "evidence", "warnings"],
  properties: {
    company: { type: "string" }, role: { type: "string" }, location: { type: "string" }, salary: { type: "string" }, deadline: { type: "string" }, jd: { type: "string" }, sourceUrl: { type: "string" },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "quote"], properties: { field: { type: "string" }, quote: { type: "string" } } } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export const ActionTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  category: z.enum(["resume", "evidence", "application", "follow_up", "interview", "deadline", "custom"]),
  status: z.enum(["todo", "doing", "done", "dismissed"]).default("todo"),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  dueAt: z.string().max(40).default(""),
  notes: z.string().max(4000).default(""),
  entityType: z.string().max(80).default(""),
  entityId: z.string().max(120).default(""),
  applicationId: z.string().max(120).default(""),
  checklistKey: z.string().max(80).default(""),
  createdBy: z.enum(["user", "ai", "system"]).default("user"),
  aiJobId: z.string().max(120).default(""),
  sourceRefs: z.array(z.object({ type: z.string(), id: z.string(), quote: z.string().optional() }).passthrough()).max(30).default([]),
}).strict();

export const JobSearchSettingsSchema = z.object({
  cycleEndDate: z.string().max(40).default(""),
  cycleConfirmed: z.boolean().default(false),
  savedStaleDays: z.number().int().min(1).max(90).default(7),
  pendingStaleDays: z.number().int().min(1).max(90).default(3),
  appliedStaleDays: z.number().int().min(1).max(90).default(7),
  processStaleDays: z.number().int().min(1).max(90).default(5),
  deadlineRiskDays: z.number().int().min(1).max(30).default(3),
  minimumSample: z.number().int().min(2).max(20).default(5),
}).strict();

export const defaultJobSearchSettings = JobSearchSettingsSchema.parse({ cycleEndDate: "2027-01-31", cycleConfirmed: false });
export const checklistKeys = ["research", "analysis", "resumeSelected", "resumeOptimized", "submitted", "followedUp", "interviewScheduled"] as const;

export function normalizeJobUrl(value: string) {
  try { const url = new URL(value); url.hash = ""; ["utm_source", "utm_medium", "utm_campaign", "spm", "from"].forEach((key) => url.searchParams.delete(key)); return url.toString().replace(/\/$/, "").toLowerCase(); }
  catch { return value.trim().toLowerCase(); }
}

export function jobFingerprint(data: Record<string, unknown>) {
  const url = normalizeJobUrl(String(data.sourceUrl || ""));
  if (url) return `url:${url}`;
  const clean = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  return `job:${clean(data.company)}:${clean(data.role)}:${clean(data.location)}`;
}

export function riskForRecord(kind: string, data: Record<string, unknown>, updatedAt: string, settings = defaultJobSearchSettings, now = new Date()) {
  const updatedDays = Math.floor((now.getTime() - new Date(updatedAt).getTime()) / 86400000);
  const deadline = data.deadline || data.dueAt || data.nextFollowUpAt;
  if (deadline) {
    const days = Math.ceil((new Date(String(deadline)).getTime() - now.getTime()) / 86400000);
    if (Number.isFinite(days) && days >= 0 && days <= settings.deadlineRiskDays) return { level: days <= 1 ? "high" : "medium", reason: `${days === 0 ? "今天" : `${days} 天后`}截止` };
  }
  if (kind === "saved_jobs" && updatedDays >= settings.savedStaleDays) return { level: "medium", reason: `收藏 ${updatedDays} 天未处理` };
  if (kind === "applications") {
    const stage = String(data.stage || "待投递");
    const limit = stage === "待投递" ? settings.pendingStaleDays : stage === "已投递" ? settings.appliedStaleDays : ["笔试中", "面试中"].includes(stage) ? settings.processStaleDays : 9999;
    if (updatedDays >= limit) return { level: "medium", reason: `${stage} ${updatedDays} 天无更新` };
  }
  return null;
}

export function csvEscape(value: unknown) { const text = typeof value === "string" ? value : JSON.stringify(value ?? ""); return `"${text.replace(/"/g, '""')}"`; }
