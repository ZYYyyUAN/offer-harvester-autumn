import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { ZodError } from "zod";

export type StoredRecord = {
  id: string;
  kind: string;
  title: string;
  data: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type StoredFile = {
  id: string;
  recordId: string | null;
  purpose: string;
  filename: string;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export async function requireApiUser() {
  const h = await headers();
  const email = h.get("oai-authenticated-user-email");
  if (!email) throw new ApiError(401, "请先登录后继续");
  const userId = h.get("oai-authenticated-user-id") ?? await hashedEmailUserId(email);
  return { userId, email };
}

async function hashedEmailUserId(email: string) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `email_${hex}`;
}

export function getBindings() {
  if (!env.DB) throw new ApiError(503, "云数据库暂不可用");
  if (!env.BUCKET) throw new ApiError(503, "文件存储暂不可用");
  return { db: env.DB, bucket: env.BUCKET };
}

export function getDatabase() {
  if (!env.DB) throw new ApiError(503, "云数据库暂不可用");
  return env.DB;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "APP_ERROR", public retryable = false, public details?: Record<string, unknown>) {
    super(message);
  }
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "输入或数据结构不符合要求", code: "VALIDATION_ERROR", issues: error.issues.map((item) => ({ path: item.path, message: item.message })) }, { status: 400 });
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "服务暂时不可用";
  const details = error instanceof ApiError ? error.details : undefined;
  return Response.json({ error: message, code: error instanceof ApiError ? error.code : "INTERNAL_ERROR", ...(details || {}) }, { status });
}

export function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapRecord(row: Record<string, unknown>): StoredRecord {
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title ?? ""),
    data: safeJson(String(row.data ?? "{}"), {}),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

export function mapFile(row: Record<string, unknown>): StoredFile {
  return {
    id: String(row.id),
    recordId: row.record_id ? String(row.record_id) : null,
    purpose: String(row.purpose),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    size: Number(row.size ?? 0),
    metadata: safeJson(String(row.metadata ?? "{}"), {}),
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  };
}

export function recordTitle(kind: string, data: Record<string, unknown>) {
  const options: Record<string, unknown> = {
    applications: `${data.company ?? ""} ${data.role ?? ""}`.trim(),
    saved_jobs: `${data.company ?? ""} ${data.role ?? ""}`.trim() || data.sourceUrl,
    evidence: data.title,
    interviews: `${data.company ?? ""} ${data.role ?? ""}`.trim(),
    offers: `${data.company ?? ""} ${data.role ?? ""}`.trim(),
    reminders: data.title,
    analyses: data.jobTitle ?? data.company,
    research: data.company,
    ai_evaluations: data.title,
    tasks: data.title,
    activity_events: data.title ?? data.action,
    data_imports: data.filename ?? "数据导入预览",
    feishu_documents: data.title ?? "飞书文档快照",
  };
  return String(options[kind] ?? data.title ?? "未命名记录").slice(0, 180);
}

export const allowedKinds = new Set([
  "applications",
  "saved_jobs",
  "evidence",
  "interviews",
  "offers",
  "reminders",
  "analyses",
  "research",
  "application_events",
  "ai_evaluations",
  "tasks",
  "activity_events",
  "data_imports",
  "feishu_documents",
]);

export function normalizeKind(value: string | null) {
  if (!value || !allowedKinds.has(value)) throw new ApiError(400, "无效的数据类型");
  return value;
}
