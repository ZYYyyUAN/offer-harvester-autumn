"use client";

import { useEffect, useState } from "react";
import { Download, Eye, FileText, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, Field, fileSize } from "@/components/workspace/shared";
import type { Kind, RecordItem, StoredFile } from "@/components/workspace/types";

const stageOrder = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"];
const editorFields: Record<Kind, Array<{ key: string; label: string; type?: string; options?: string[]; required?: boolean }>> = {
  applications: [
    { key: "companyType", label: "公司类别", type: "select", options: ["unknown", "large_tech", "mid_size", "startup", "soe_bank", "foreign", "outsourcing", "other"] },
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "direction", label: "岗位方向" }, { key: "location", label: "工作地点" }, { key: "stage", label: "当前阶段", type: "select", options: stageOrder }, { key: "priority", label: "优先级", type: "select", options: ["高", "普通", "低"] }, { key: "recruitmentMode", label: "招聘方式", type: "select", options: ["自动判断", "滚动招聘", "固定截止"] }, { key: "deadline", label: "网申截止日期", type: "date" }, { key: "salary", label: "薪资范围" }, { key: "sourceUrl", label: "岗位链接", type: "url" }, { key: "channel", label: "投递渠道" }, { key: "contactName", label: "联系人 / 内推人" }, { key: "contactRole", label: "联系人身份" }, { key: "contactValue", label: "联系方式" }, { key: "lastContactAt", label: "最后联系时间", type: "datetime-local" }, { key: "nextFollowUpAt", label: "下次跟进时间", type: "datetime-local" }, { key: "resumeId", label: "关联简历", type: "resume" }, { key: "jd", label: "职位描述", type: "textarea" }, { key: "notes", label: "备注", type: "textarea" },
  ],
  saved_jobs: [],
  evidence: [
    { key: "title", label: "事实标题", required: true }, { key: "source", label: "来源简历 / 项目" }, { key: "status", label: "确认状态", type: "select", options: ["confirmed", "draft"] }, { key: "context", label: "背景与任务", type: "textarea", required: true }, { key: "action", label: "你的行动", type: "textarea", required: true }, { key: "result", label: "结果与证据", type: "textarea" }, { key: "skills", label: "能力标签（逗号分隔）" },
  ],
  interviews: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "round", label: "面试轮次" }, { key: "scheduledAt", label: "面试时间", type: "datetime-local" }, { key: "jd", label: "岗位描述", type: "textarea" }, { key: "notes", label: "准备重点", type: "textarea" },
  ],
  offers: [
    { key: "company", label: "公司", required: true }, { key: "role", label: "岗位", required: true }, { key: "city", label: "城市" }, { key: "baseMonthly", label: "月基本薪资（元）", type: "number" }, { key: "months", label: "薪资月数", type: "number" }, { key: "bonus", label: "年度现金奖金（元）", type: "number" }, { key: "equity", label: "年化股票（元）", type: "number" }, { key: "allowance", label: "年度补贴（元）", type: "number" }, { key: "growth", label: "成长空间 1–10", type: "number" }, { key: "platform", label: "公司平台 1–10", type: "number" }, { key: "balance", label: "工作生活 1–10", type: "number" }, { key: "outlook", label: "行业前景 1–10", type: "number" }, { key: "commute", label: "通勤" }, { key: "hours", label: "典型工时" }, { key: "deadline", label: "接受截止", type: "date" }, { key: "risk", label: "已知风险", type: "textarea" },
  ],
  reminders: [
    { key: "title", label: "日程标题", required: true }, { key: "type", label: "类型", type: "select", options: ["网申截止", "笔试", "面试", "OFFER 截止", "跟进", "其他"] }, { key: "dueAt", label: "日期与时间", type: "datetime-local", required: true }, { key: "durationMinutes", label: "持续时间（分钟）", type: "number" }, { key: "notes", label: "备注", type: "textarea" },
  ],
  tasks: [], analyses: [], research: [],
};

export function RecordEditor({ editor, resumes, onClose, onSaved }: { editor: { kind: Kind; item?: RecordItem } | null; resumes: StoredFile[]; onClose: () => void; onSaved: (kind: Kind) => void }) {
  const [saving, setSaving] = useState(false);
  if (!editor) return null;
  const currentEditor = editor;
  const labels: Record<Kind, string> = { applications: "投递", saved_jobs: "收藏岗位", tasks: "行动任务", evidence: "事实", interviews: "面试", offers: "OFFER", reminders: "日程", analyses: "分析", research: "背调" };
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget); const data: Record<string, any> = { ...(currentEditor.item?.data || {}) };
    for (const field of editorFields[currentEditor.kind]) { const value = form.get(field.key); data[field.key] = field.type === "number" ? Number(value || 0) : String(value || ""); }
    if (currentEditor.kind === "evidence") data.skills = String(data.skills || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    if (currentEditor.kind === "applications") data.resumeName = resumes.find((file) => file.id === data.resumeId)?.metadata.displayName || resumes.find((file) => file.id === data.resumeId)?.filename || "";
    try {
      if (currentEditor.item) await api("/api/records", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: currentEditor.item.id, version: currentEditor.item.version, data }) });
      else await api("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: currentEditor.kind, data }) });
      onSaved(currentEditor.kind);
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{currentEditor.item ? "编辑" : "新增"}{labels[currentEditor.kind]}</DialogTitle><DialogDescription>保存后会立即同步到你的私人云端空间。</DialogDescription></DialogHeader><form onSubmit={submit}><div className="editor-grid">{editorFields[currentEditor.kind].map((field) => <Field key={field.key} label={field.label}>{field.type === "textarea" ? <Textarea name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || ""} /> : field.type === "select" ? <select name={field.key} required={field.required} defaultValue={currentEditor.item?.data[field.key] || field.options?.[0]}>{field.options?.map((option) => <option key={option} value={option}>{option === "confirmed" ? "已确认" : option === "draft" ? "待补充" : ({ unknown: "未知", large_tech: "大厂", mid_size: "中厂", startup: "初创", soe_bank: "国企银行", foreign: "外企", outsourcing: "外包", other: "其他" } as Record<string,string>)[option] || option}</option>)}</select> : field.type === "resume" ? <select name={field.key} defaultValue={currentEditor.item?.data[field.key] || ""}><option value="">暂不关联</option>{resumes.map((file) => <option key={file.id} value={file.id}>{file.metadata.displayName || file.filename}</option>)}</select> : <Input name={field.key} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} max={field.key === "growth" || field.key === "platform" || field.key === "balance" || field.key === "outlook" ? 10 : undefined} defaultValue={currentEditor.item?.data[field.key] || (field.key === "months" ? 12 : field.key === "durationMinutes" ? 60 : "")} />}</Field>)}</div><DialogFooter><Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <Save />}{saving ? "保存中…" : "保存"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function FilePreview({ file, onClose }: { file: StoredFile | null; onClose: () => void }) {
  const [text, setText] = useState(""); const [version, setVersion] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!file) return; setText(String(file.metadata.previewText || "")); setVersion(file.version); if (!file.mimeType.includes("pdf")) api<any>(`/api/files/preview?id=${file.id}`).then((result) => { setText(result.text || ""); setVersion(result.version || file.version); }).catch(() => undefined); }, [file]);
  if (!file) return null;
  const isPdf = file.mimeType === "application/pdf";
  async function generate() { setBusy(true); try { const result = await api<any>("/api/files/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: file!.id, version }) }); setText(result.text); setVersion(result.version); toast.success("文本预览已生成"); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="preview-dialog"><DialogHeader><DialogTitle>{file.metadata.displayName || file.filename}</DialogTitle><DialogDescription>{file.filename} · {fileSize(file.size)}</DialogDescription></DialogHeader>{isPdf ? <iframe title="简历预览" src={`/api/files/content?id=${file.id}`} /> : text ? <div className="document-text-preview"><div><small>解析文本只用于核对内容，排版请查看原文件。</small><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载原文件</a></Button></div><pre>{text}</pre></div> : <div className="doc-preview-fallback"><FileText /><h3>{file.mimeType.includes("wordprocessing") ? "DOCX" : "DOC"} 原文件已安全保存</h3><p>{file.mimeType.includes("wordprocessing") ? "点击后在应用内解析正文，不会发送给第三方。" : "旧版 DOC 无法在浏览器稳定渲染；点击后会主动调用文档解析服务，并保存只读文本快照。"}</p><div className="card-actions"><Button onClick={generate} disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Eye />}{busy ? "正在解析…" : "生成文本预览"}</Button><Button variant="outline" asChild><a href={`/api/files/content?id=${file.id}&download=true`}><Download />下载原文件</a></Button></div></div>}</DialogContent></Dialog>;
}

