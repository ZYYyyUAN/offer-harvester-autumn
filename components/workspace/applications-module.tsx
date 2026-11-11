"use client";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, BriefcaseBusiness, Columns3, ExternalLink, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, EmptyState, formatDate, PageHead, StatusPill } from "./shared";
import type { Dashboard, RecordItem, StoredFile, SubmissionSummary } from "./types";
import { SubmissionMetrics, stageLabel } from "./submission-metrics";
import { submissionStageBucket, submissionStages } from "@/lib/submission-workspace";
import { channelLabels } from "@/lib/job-metadata";
import { ClosureStatistics, closureLabel } from "./application-closure";
import { JobMetadataStatistics } from "./job-metadata-statistics";
import { ApplicationDetail } from "./application-detail";

type Route = { review: "overview" | "outcomes" | "channels"; tab: "tracking" | "review"; stage: string; q: string; sort: string; mode: "board" | "list"; page: number; applicationId: string };
type Workspace = { records: RecordItem[]; summary: SubmissionSummary; filteredCount: number; filteredStageCounts: Record<string, number>; page: number; pageSize: number; serverNow: string };
function routeFromUrl(): Route {
  const q = new URL(window.location.href).searchParams;
  const stage = q.get("stage") || "all", sort = q.get("sort") || "updated", page = Number(q.get("page") || 1);
  return { review: q.get("review") === "outcomes" ? "outcomes" : q.get("review") === "channels" ? "channels" : "overview", tab: q.get("tab") === "review" ? "review" : "tracking", stage: ["all", ...submissionStages, "unknown"].includes(stage) ? stage : "all", q: (q.get("q") || "").slice(0, 240), sort: ["updated", "company", "deadline", "appliedAt"].includes(sort) ? sort : "updated", mode: q.get("mode") === "list" ? "list" : "board", page: Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1, applicationId: q.get("applicationId") || "" };
}
export function ApplicationsView({ resumes, dashboard, revision, onSummary, onAdd, onEdit, onDelete, onMove, onChecklist, onUnlink, onOptimize }: {
  resumes: StoredFile[]; dashboard: Dashboard; revision: number; onSummary: (summary: SubmissionSummary) => void; onAdd: () => void;
  onEdit: (item: RecordItem) => void; onDelete: (item: RecordItem) => Promise<void>; onMove: (item: RecordItem, stage: string) => Promise<void>;
  onChecklist: (item: RecordItem, key: string, done: boolean) => Promise<void>; onUnlink: (item: RecordItem) => Promise<void>; onOptimize: (item: RecordItem) => void;
}) {
  const [route, setRoute] = useState<Route | null>(null), [result, setResult] = useState<Workspace | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [detailBusy,setDetailBusy]=useState(false);
  const [selected, setSelected] = useState<RecordItem | null>(null), [detailError, setDetailError] = useState("");
  useEffect(() => { const restore = () => setRoute(routeFromUrl()); restore(); window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore); }, []);
  function navigate(patch: Partial<Route>, replace = false) {
    const next = { ...route!, ...patch }, url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) { if (value === "" || (key === "page" && value === 1)) url.searchParams.delete(key); else url.searchParams.set(key, String(value)); }
    window.history[replace ? "replaceState" : "pushState"](null, "", url); setRoute(next);
  }
  const query = route ? new URLSearchParams({ q: route.q, stage: route.stage, sort: route.sort, page: String(route.page), pageSize: "20" }).toString() : "";
  useEffect(() => {
    if (!query) return;
    let active = true; setBusy(true); setError("");
    api<Workspace>(`/api/applications/workspace?${query}`).then(data => { if (active) { setResult(data); onSummary(data.summary); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [query, revision, reload, onSummary]);
  const selection = route?.applicationId || "";
  useEffect(() => {
    setDetailError(""); if (!selection) { setSelected(null); return; }
    let active = true; setSelected(null);
    api<{ record: RecordItem }>(`/api/applications/${encodeURIComponent(selection)}`).then(data => { if (active) setSelected(data.record); }).catch(e => { if (active) setDetailError(e.message); });
    return () => { active = false; };
  }, [selection, result]);
  const refresh = useCallback(() => setReload(value => value + 1), []);
  const count = result?.filteredCount || 0, pages = Math.max(1, Math.ceil(count / 20));
  const availableStages = [...submissionStages, "unknown"].filter(stage => route?.stage === "all" ? Boolean(result?.filteredStageCounts[stage]) : route?.stage === stage);
  const emptyStages = submissionStages.filter(stage=>!result?.filteredStageCounts[stage]);
  async function moveDropped(event: React.DragEvent, stage: string){const item=result?.records.find(r=>r.id===event.dataTransfer.getData("text/plain"));if(item){await onMove(item,stage);refresh();}}
  function card(item: RecordItem) {
    const submitted = item.submission, current = resumes.find(r => r.id === item.data.resumeId);
    const appliedAt = Object.prototype.hasOwnProperty.call(item.data,"appliedAt") ? item.data.appliedAt : submitted?.appliedAt;
    const channel = submitted?.actualChannel || item.data.jobMetadata?.actualSubmission?.channel || "unknown";
    const name = submitted ? submitted.resumeDisplayName : current?.metadata.displayName || current?.filename;
    const version = submitted ? submitted.resumeFileVersion : current?.version;
    return <article key={item.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", item.id)} className="submission-card">
      <header><h3>{item.data.company}</h3><p>{item.data.role}</p><StatusPill>{stageLabel(item.data.stage)}</StatusPill></header>
      {item.data.stage === "已结束" && <p>{closureLabel(item.data.closure)}</p>}
      <dl><div><dt>投递</dt><dd>{appliedAt ? formatDate(appliedAt,true) : "日期未知"}{submitted && (appliedAt||null)!==(submitted.appliedAt||null) && <small>（投递后补录／更正）</small>}</dd></div><div><dt>{submitted ? "实际简历" : "关联简历"}</dt><dd>{name ? `${name}${version ? ` · v${version}` : ""}` : "当时版本未记录"}</dd></div><div><dt>实际渠道</dt><dd>{channel === "other" ? submitted?.actualChannelCustom || item.data.jobMetadata?.actualSubmission?.customLabel || "其他" : channelLabels[channel as keyof typeof channelLabels] || "未知"}</dd></div></dl>
      <footer><Button variant="outline" onClick={() => navigate({ applicationId: item.id })}>查看详情</Button><details><summary>更多</summary><div className="submission-more"><label>调整招聘阶段<select aria-label={`调整${item.data.company}的招聘阶段`} value={submissionStageBucket(item.data.stage)==="unknown"?"unknown":item.data.stage} disabled={busy} onChange={async e=>{await onMove(item,e.target.value);refresh();}}>{submissionStageBucket(item.data.stage)==="unknown"&&<option value="unknown" disabled>阶段待核对</option>}{submissionStages.map(stage=><option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label><button onClick={() => onEdit(item)}>编辑</button><button onClick={async () => { await onDelete(item); refresh(); }}>移入回收站</button>{item.data.sourceUrl && <a href={item.data.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />原岗位</a>}</div></details></footer>
    </article>;
  }
  return <><PageHead eyebrow="投递管理" title="投递记录" description="已投岗位、后续安排和结果集中管理。" action={<Button onClick={onAdd}><Bookmark />记录已投岗位</Button>} />
    {result && route?.tab !== "review" && <SubmissionMetrics summary={result.summary} />}
    <div className="pipeline-tabs submission-tabs" role="group" aria-label="投递页面"><Button variant={route?.tab === "tracking" ? "default" : "outline"} onClick={() => navigate({ tab: "tracking" })}>岗位跟进</Button><Button variant={route?.tab === "review" ? "default" : "outline"} onClick={() => navigate({ tab: "review" })}>投递复盘</Button></div>
    {route?.tab === "review" ? <section className="review-workspace"><header className="review-intro"><div><span>REVIEW</span><h2>看清进展，再调整下一步</h2><p>分别查看整体表现、结束原因与投递渠道。</p></div><p className="review-sample">{result?.summary.totalSubmitted ?? "—"}<small>累计投递样本</small></p></header><nav className="review-navigation" aria-label="复盘分析分类">{([["overview","整体表现","阶段、简历与岗位方向"],["outcomes","结束复盘","结束结果与被拒阶段"],["channels","渠道与公司","实际渠道、内推与分类"]] as const).map(([key,title,description])=><button key={key} aria-pressed={route.review===key} onClick={()=>navigate({review:key})}><b>{title}</b><small>{description}</small></button>)}</nav><div className="review-content">{route.review==="overview"?<SubmissionReview dashboard={dashboard}/>:route.review==="outcomes"?<ClosureStatistics revision={String(revision)}/>:<JobMetadataStatistics refreshToken={String(revision)}/>}</div></section> : <>
      <div className="toolbar application-toolbar"><label className="searchbox"><Search /><Input aria-label="搜索投递记录" placeholder="公司、岗位或城市" value={route?.q || ""} maxLength={240} onChange={e => navigate({ q: e.target.value, page: 1 }, true)} /></label><div className="toolbar-controls"><label>阶段<select aria-label="投递阶段筛选" value={route?.stage || "all"} onChange={e => navigate({ stage: e.target.value, page: 1 })}><option value="all">全部</option>{[...submissionStages, "unknown"].map(stage => <option key={stage} value={stage}>{stage === "unknown" ? "待核对阶段" : stageLabel(stage)}</option>)}</select></label><label>排序<select aria-label="投递排序" value={route?.sort || "updated"} onChange={e => navigate({ sort: e.target.value, page: 1 })}><option value="updated">最近更新</option><option value="appliedAt">投递时间</option><option value="company">公司名称</option><option value="deadline">截止日期</option></select></label><Button variant={route?.mode !== "list" ? "default" : "outline"} size="icon" aria-label="看板视图" onClick={() => navigate({ mode: "board" })}><Columns3 /></Button><Button variant={route?.mode === "list" ? "default" : "outline"} size="icon" aria-label="列表视图" onClick={() => navigate({ mode: "list" })}><List /></Button></div></div>
      <p role="status" className="submission-count">{result ? `全部记录 ${result.summary.totalRecords} · 当前筛选 ${count} · 本页 ${result.records.length}` : "正在读取投递记录…"}{busy && result && " · 正在更新…"}</p>
      {error && <p role="alert">{error}<Button variant="outline" onClick={refresh}>重试加载</Button></p>}
      {!busy && !error && result && !result.records.length && <EmptyState icon={BriefcaseBusiness} title={result.summary.totalRecords ? "没有符合条件的记录" : "还没有投递记录"} text={result.summary.totalRecords ? "修改筛选条件或返回第一页查看；已有记录不会被删除。" : "可使用链接、截图或手动填写，保存前核对实际投递信息。"} action={result.summary.totalRecords ? <Button onClick={() => navigate({ q: "", stage: "all", page: 1 })}>清除筛选</Button> : <Button onClick={onAdd}>记录已投岗位</Button>} />}
      {route?.stage==="all" && result && result.records.length>0 && emptyStages.length>0 && <details className="submission-empty-stages"><summary>空阶段与拖动目标（{emptyStages.length}）</summary><p>展开后可以拖入空阶段，也可在卡片“更多”中选择阶段。</p><div>{emptyStages.map(stage=><section key={stage} onDragOver={event=>event.preventDefault()} onDrop={event=>moveDropped(event,stage)}><b>{stageLabel(stage)}</b><span>拖入这里</span></section>)}</div></details>}
      {!error && result && result.records.length > 0 && <div aria-busy={busy} className={route?.mode === "list" ? "submission-list" : "kanban submission-board"}>{route?.mode === "list" ? result.records.map(card) : availableStages.map(stage => <section key={stage} onDragOver={e => { if (stage !== "unknown") e.preventDefault(); }} onDrop={async e => { const item = result.records.find(r => r.id === e.dataTransfer.getData("text/plain")); if (item && stage !== "unknown") { await onMove(item, stage); refresh(); } }}><header><b>{stage === "unknown" ? "待核对阶段" : stageLabel(stage)}</b><span>{result.filteredStageCounts[stage] || 0}</span></header>{result.records.filter(r=>submissionStageBucket(r.data.stage)===stage).length < (result.filteredStageCounts[stage]||0) && <div className="column-page-notice"><p>本页 {result.records.filter(r=>submissionStageBucket(r.data.stage)===stage).length} 条 · 此阶段共 {result.filteredStageCounts[stage]} 条</p>{route?.stage === "all" && <Button variant="outline" aria-label={`查看${stage === "unknown" ? "待核对阶段" : stageLabel(stage)}全部记录`} onClick={()=>navigate({stage,page:1})}>查看本阶段</Button>}</div>}<div>{result.records.filter(r => submissionStageBucket(r.data.stage) === stage).map(card)}</div></section>)}</div>}
      {result && count > 0 && <nav className="submission-pagination" aria-label="投递记录分页"><Button variant="outline" disabled={busy || result.page <= 1} onClick={() => navigate({ page: result.page - 1 })}>上一页</Button><span>第 {result.page} / {pages} 页 · 每页 20 条</span><Button variant="outline" disabled={busy || result.page >= pages} onClick={() => navigate({ page: result.page + 1 })}>下一页</Button></nav>}
    </>}
    {detailError && <p role="alert">详情未加载：{detailError}<Button variant="outline" onClick={refresh}>重试详情</Button><Button variant="ghost" onClick={() => navigate({ applicationId: "" })}>关闭详情</Button></p>}
    {selected && <ApplicationDetail busy={detailBusy} item={selected} resume={resumes.find(r => r.id === selected.data.resumeId)} settings={dashboard.settings} serverNow={result?.serverNow || dashboard.serverNow} onClose={() => navigate({ applicationId: "" })} onEdit={() => onEdit(selected)} onChecklist={async (key, done) => {setDetailBusy(true);try{await onChecklist(selected,key,done);try{const latest=await api<{record:RecordItem}>(`/api/applications/${selected.id}`);setSelected(latest.record);refresh();}catch(failure){setDetailError((failure as Error).message);}}finally{setDetailBusy(false);}}} onUnlink={async () => { await onUnlink(selected); refresh(); }} onOptimize={() => onOptimize(selected)} />}
  </>;
}
export function SubmissionReview({ dashboard }: { dashboard: Dashboard }) {
  const funnel = [["收藏来源", dashboard.funnel.saved], ["累计投递", dashboard.funnel.applied], ["曾到笔试", dashboard.funnel.written], ["曾到面试", dashboard.funnel.interview], ["曾获 OFFER", dashboard.funnel.offer]] as const;
  return <><section className="panel"><h2>历史到达阶段</h2><p>按独立机会统计；直接进入面试的记录也表示已投递。收藏来源与投递并非完整包含关系，不据此计算通过率。</p><div className="submission-stage-history">{funnel.map(([label, count]) => <p key={label}><span>{label}</span><strong>{count || 0}</strong></p>)}</div></section><section className="panel segment-panel"><h2>简历版本与岗位方向</h2><p>按历史到达情况描述观察结果；小于 {dashboard.settings.minimumSample || 5} 条只显示数量，不解释为因果关系。</p><div className="segment-grid">{([["resume", "投递简历版本"], ["direction", "岗位方向"]] as const).map(([key, label]) => <div key={key}><h3>{label}</h3>{dashboard.segments[key]?.length ? dashboard.segments[key].map(item => <article key={item.label}><b>{item.label} · {item.count}</b><span>{item.ratesVisible ? `面试 ${Math.round(item.interviewCount / item.count * 100)}% · OFFER ${Math.round(item.offerCount / item.count * 100)}%` : `面试 ${item.interviewCount} · OFFER ${item.offerCount}`}</span></article>) : <p>没有可比较的投递记录。</p>}</div>)}</div></section></>;
}
