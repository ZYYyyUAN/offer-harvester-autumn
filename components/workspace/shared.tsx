"use client";

import { useCallback, useState, type ReactNode } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(payload.error || "请求失败，请稍后重试");
  return payload as T;
}

export function formatDate(value: unknown, withTime = false) {
  if (!value) return "未设置";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: any; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function StatusPill({ children, tone = "blue" }: { children: ReactNode; tone?: string }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<{ title: string; description: string; destructive?: boolean; resolve: (value: boolean) => void } | null>(null);
  const ask = useCallback((title: string, description: string, destructive = false) => new Promise<boolean>((resolve) => setRequest({ title, description, destructive, resolve })), []);
  const close = (value: boolean) => { request?.resolve(value); setRequest(null); };
  const dialog = request ? <Dialog open onOpenChange={(open) => !open && close(false)}><DialogContent><DialogHeader><DialogTitle>{request.title}</DialogTitle><DialogDescription>{request.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => close(false)}>取消</Button><Button variant={request.destructive ? "destructive" : "default"} onClick={() => close(true)}>{request.destructive ? <Trash2 /> : <CheckCircle2 />}确认</Button></DialogFooter></DialogContent></Dialog> : null;
  return { ask, dialog };
}
