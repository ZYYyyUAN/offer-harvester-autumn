"use client";
import { useEffect, useState } from "react";
import { ApplicationClosureSchema, closureOutcomeLabels, closureStageLabels } from "@/lib/application-closure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, Field } from "./shared";
import type { RecordItem } from "./types";
import type { z } from "zod";

export type Closure = z.infer<typeof ApplicationClosureSchema>;
export function newClosure() { return ApplicationClosureSchema.parse({ cycleId: crypto.randomUUID(), source: "user", recordedAt: new Date().toISOString() }); }
export function closureLabel(closure?: Closure | null) {
  if (!closure) return "结束信息待补充";
  const rounds = { first: "一面", second: "二面", final: "终面", hr: "HR 面", custom: closure.customRound || "自定义面试" };
  return `${closureOutcomeLabels[closure.outcome]} · ${closure.stage === "interview" && closure.round ? rounds[closure.round] : closureStageLabels[closure.stage]}${closure.confirmation === "needs_review" ? "（待核对）" : ""}`;
}
export function ClosureFields({ value, onChange, previousStage }: { value: Closure; onChange: (value: Closure) => void; previousStage?: string }) {
  const update = (patch: Partial<Closure>) => onChange({ ...value, ...patch, source: "user", confirmation: "confirmed" });
  const stageSuggestions: Record<string, Closure["stage"]> = { 待投递: "before_submission", 已投递: "resume_screening", 笔试中: "written_test", 面试中: "interview", OFFER: "offer" };
  const suggested = previousStage ? stageSuggestions[previousStage] : undefined;
  return <section className="metadata-editor" aria-label="机会结束信息"><h3>结束结果与阶段</h3><p>未知也可以保存。最后停留的阶段不代表已在该阶段被拒；无反馈不会自动判定失败。</p>{suggested && <p>上次记录阶段：{previousStage}。<Button type="button" variant="outline" onClick={() => update({ stage: suggested })}>确认采用该结束阶段</Button></p>}<div className="editor-grid">
    <Field label="结束结果"><select aria-label="结束结果" value={value.outcome} onChange={(e) => update({ outcome: e.target.value as Closure["outcome"] })}>{Object.entries(closureOutcomeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="结束阶段"><select aria-label="结束阶段" value={value.stage} onChange={(e) => update({ stage: e.target.value as Closure["stage"], round: null, customRound: "" })}>{Object.entries(closureStageLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    {value.stage === "interview" && <Field label="面试轮次"><select aria-label="面试轮次" value={value.round || ""} onChange={(e) => update({ round: (e.target.value || null) as Closure["round"] })}>{Object.entries({ "": "未知 / 不填写", first: "一面", second: "二面", final: "终面", hr: "HR 面", custom: "自定义" }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>}
    {value.round === "custom" && <Field label="自定义轮次"><Input value={value.customRound} onChange={(e) => update({ customRound: e.target.value })} /></Field>}
    <Field label="实际结束时间（可留空）"><Input aria-label="实际结束时间" type="datetime-local" value={value.endedAt ? new Date(new Date(value.endedAt).getTime() - new Date(value.endedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(e) => update({ endedAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
    <Field label="结束原因（可选）"><Textarea value={value.reason} onChange={(e) => update({ reason: e.target.value })} /></Field><Field label="复盘备注（可选）"><Textarea value={value.notes} onChange={(e) => update({ notes: e.target.value })} /></Field>
  </div></section>;
}
export function useClosureConfirmation() {
  const [pending, setPending] = useState<{ item: RecordItem; resolve: (value: Closure | null) => void } | null>(null);
  const [value, setValue] = useState<Closure | null>(null);
  function ask(item: RecordItem) { setValue(newClosure()); return new Promise<Closure | null>((resolve) => setPending({ item, resolve })); }
  function close(confirm: boolean) { pending?.resolve(confirm && value ? { ...value, confirmation: "confirmed", source: "user" } : null); setPending(null); }
  const dialog = pending && value && <Dialog open onOpenChange={(open) => !open && close(false)}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>确认结束这个机会</DialogTitle><DialogDescription>{pending.item.data.company} · {pending.item.data.role}。结束不会删除 JD、投递简历或历史到达阶段。</DialogDescription></DialogHeader><ClosureFields value={value} onChange={setValue} previousStage={pending.item.data.stage} /><DialogFooter><Button variant="outline" onClick={() => close(false)}>取消</Button><Button onClick={() => close(true)}>保存结束信息</Button></DialogFooter></DialogContent></Dialog>;
  return { ask, dialog };
}
export function ClosureStatistics({ revision }: { revision: string }) {
  const [result, setResult] = useState<any>(null), [error, setError] = useState("");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  useEffect(() => { let active = true; setResult(null); api<any>(`/api/applications/outcomes?from=${from}&to=${to}`).then((data) => { if (active) { setResult(data); setError(""); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [revision, from, to]);
  return <section className="panel metadata-statistics"><h2>机会结束分析</h2><p>按当前已结束的独立岗位计数；重新开启不计入。历史周期保留在时间线。阶段分布只统计被拒记录，不代表通过率。</p><div className="editor-grid"><Field label="结束日期起"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="结束日期止"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>{error && <p role="alert">{error}</p>}{!result && !error && <p role="status">正在计算结束记录…</p>}{result && <><p>当前已结束 {result.totalClosed} 个 · 筛选结果 {result.filteredCount} 个 · 结束时间未知 {result.unknownDateCount} 个 · 待补全 {result.needsReviewCount} 个</p><div className="segment-grid"><div><h3>结束结果</h3>{result.outcomes.map((r: any) => <p key={r.key}>{r.label}：{r.count}{r.percentage !== null && `（${r.percentage}%）`}</p>)}</div><div><h3>被拒的结束阶段</h3><p>分母：{result.rejectedCount} 个被拒岗位；阶段未知独列。</p>{result.stages.map((r: any) => <p key={r.key}>{r.label}：{r.count}{r.percentage !== null && `（${r.percentage}%）`}</p>)}</div></div>{!result.totalClosed && <p>还没有结束记录，标记结束后会在这里汇总。</p>}</>}</section>;
}
