import { z } from "zod";

export const FEISHU_PROVIDER = "feishu" as const;
export const FEISHU_CALLBACK_URL = "https://offer-harvester-autumn.zyyuan0913.chatgpt.site/api/integrations/feishu/callback";
export const FEISHU_API_ORIGIN = "https://open.feishu.cn/open-apis";

export const checklistFieldMap = {
  researched: "背调",
  analyzed: "岗位分析",
  linkedResume: "关联简历",
  optimized: "简历优化",
  submitted: "完成投递",
  followedUp: "完成跟进",
  interviewScheduled: "安排面试",
} as const;

export const applicationFieldMap = {
  localId: "OFFER 收割机记录 ID",
  company: "公司",
  role: "岗位",
  direction: "岗位方向",
  location: "地点",
  salary: "薪资",
  stage: "当前阶段",
  priority: "优先级",
  channel: "投递渠道",
  deadline: "截止日期",
  sourceUrl: "岗位链接",
  contactName: "联系人",
  contactRole: "联系人身份",
  contactValue: "联系方式",
  lastContactAt: "最后联系时间",
  nextFollowUpAt: "下次跟进时间",
  resumeName: "关联简历名称",
  notes: "备注",
  localVersion: "本地版本号",
  localUpdatedAt: "本地更新时间",
} as const;

export const syncDecisionSchema = z.object({
  itemId: z.string().min(1),
  action: z.enum(["local", "remote", "skip"]),
}).strict();

export const syncCommitSchema = z.object({
  version: z.number().int().positive(),
  decisions: z.array(syncDecisionSchema).max(500),
}).strict();

export const resumeImportSchema = z.object({
  remoteFileToken: z.string().min(1),
  name: z.string().min(1).max(240),
  type: z.string().max(40),
  size: z.number().int().nonnegative().max(20 * 1024 * 1024).optional(),
}).strict();

export const reportExportSchema = z.object({
  recordId: z.string().min(1),
  kind: z.enum(["analyses", "research", "interviews"]),
  mode: z.enum(["update", "copy"]).default("copy"),
}).strict();

export const reportImportSchema = z.object({
  documentToken: z.string().min(1),
  documentType: z.string().max(40).default("docx"),
  title: z.string().min(1).max(180),
  entityType: z.enum(["applications", "saved_jobs", "research", "interviews"]),
  entityId: z.string().min(1),
}).strict();

export const minutesPreviewSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().max(500_000).optional(),
  title: z.string().max(180).optional(),
}).refine((value) => Boolean(value.url || value.text?.trim()), "请提供妙记链接或转写文本");

export const minutesCommitSchema = z.object({
  runId: z.string().uuid(),
  runVersion: z.number().int().positive(),
  interviewId: z.string().min(1),
}).strict();

export type FeishuWorkspaceConfig = {
  rootFolderToken?: string;
  rootFolderUrl?: string;
  resumeFolderToken?: string;
  reportFolderToken?: string;
  interviewFolderToken?: string;
  bitableAppToken?: string;
  bitableUrl?: string;
  tableId?: string;
  fieldIds?: Record<string, string>;
  minutesAvailable?: boolean;
  bootstrappedAt?: string;
};

export type LocalApplication = {
  id: string;
  version: number;
  updatedAt: string;
  data: Record<string, unknown>;
};

export type RemoteApplication = {
  recordId: string;
  fields: Record<string, unknown>;
};

export type SyncMapping = {
  id: string;
  localId: string | null;
  remoteId: string | null;
  localHash: string | null;
  remoteHash: string | null;
};

export type SyncPreviewItem = {
  id: string;
  type: "local_only" | "remote_only" | "push" | "pull" | "conflict" | "unchanged" | "deletion_warning" | "invalid_remote";
  localId: string | null;
  remoteId: string | null;
  localVersion: number | null;
  localHash: string | null;
  remoteHash: string | null;
  local: Record<string, unknown> | null;
  remote: Record<string, unknown> | null;
  message: string;
  defaultDecision: "local" | "remote" | "skip";
};

export function normalizeApplicationData(data: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(applicationFieldMap)) {
    if (["localId", "localVersion", "localUpdatedAt"].includes(key)) continue;
    const value = data[key];
    normalized[key] = value == null ? "" : value;
  }
  const rawChecklist = data.checklist && typeof data.checklist === "object" ? data.checklist as Record<string, unknown> : {};
  normalized.checklist = Object.fromEntries(Object.keys(checklistFieldMap).map((key) => {
    const raw = rawChecklist[key];
    const done = typeof raw === "boolean" ? raw : Boolean(raw && typeof raw === "object" && (raw as Record<string, unknown>).done);
    return [key, done];
  }));
  return normalized;
}

export function applicationToFeishuFields(application: LocalApplication) {
  const data = normalizeApplicationData(application.data);
  const fields: Record<string, unknown> = {
    [applicationFieldMap.localId]: application.id,
    [applicationFieldMap.localVersion]: application.version,
    [applicationFieldMap.localUpdatedAt]: application.updatedAt,
  };
  for (const [key, label] of Object.entries(applicationFieldMap)) {
    if (["localId", "localVersion", "localUpdatedAt"].includes(key)) continue;
    fields[label] = data[key];
  }
  const checklist = data.checklist as Record<string, boolean>;
  for (const [key, label] of Object.entries(checklistFieldMap)) fields[label] = Boolean(checklist[key]);
  return fields;
}

function scalar(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" && item ? ((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).name ?? "") : item).join(", ");
  if (value && typeof value === "object") return (value as Record<string, unknown>).text ?? (value as Record<string, unknown>).link ?? "";
  return value ?? "";
}

export function feishuFieldsToApplication(fields: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [key, label] of Object.entries(applicationFieldMap)) {
    if (["localId", "localVersion", "localUpdatedAt"].includes(key)) continue;
    data[key] = scalar(fields[label]);
  }
  data.checklist = Object.fromEntries(Object.entries(checklistFieldMap).map(([key, label]) => [key, Boolean(fields[label])]));
  return data;
}

export function remoteLocalId(fields: Record<string, unknown>) {
  const value = scalar(fields[applicationFieldMap.localId]);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isRemoteImportable(data: Record<string, unknown>) {
  return Boolean(String(data.company ?? "").trim() && String(data.role ?? "").trim());
}
