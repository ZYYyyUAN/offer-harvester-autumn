"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "./shared";
import type { AIJob } from "./types";
import { useCaptureTask } from "./use-capture-task";
import { applyMetadataSuggestions, metadataContext, natureLabels, tagLabels, type JobMetadata } from "@/lib/job-metadata";
import { companyVerificationSuggestions, type verifiedCompanyResult } from "@/lib/company-verification";

export function CompanyVerification({ company, sourceUrl, metadata, onChange, onVerified }: { company: string; sourceUrl: string; metadata: JobMetadata; onChange: (value: JobMetadata) => void; onVerified: (legalName:string,registryId:string)=>void }) {
  const latest = useRef({company,sourceUrl,metadata,onChange}); useEffect(()=>{latest.current={company,sourceUrl,metadata,onChange};},[company,sourceUrl,metadata,onChange]);
  const [creating, setCreating] = useState(false), [error, setError] = useState("");
  const id = metadata.companyVerificationJobId || "", task = useCaptureTask(id, async () => {});
  const result = task.job?.result as ReturnType<typeof verifiedCompanyResult> | null;
  const matches = task.job?.type === "company_metadata_verify" && task.job.inputSnapshot.company === company.trim() && task.job.inputSnapshot.sourceUrl === sourceUrl;
  async function start() {
    setCreating(true); setError("");
    try { const created = await api<{ job: AIJob }>("/api/ai/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "company_metadata_verify", input: { company, sourceUrl } }) }); if (metadataContext(latest.current.company,latest.current.sourceUrl)!==metadataContext(company,sourceUrl)) {setError("公司或链接已变化，本次任务保留在 AI 中心，请对当前公司重新核实");return;} latest.current.onChange({ ...latest.current.metadata, companyVerificationJobId: created.job.id }); }
    catch (failure) { setError((failure as Error).message); } finally { setCreating(false); }
  }
  const canApply = matches && result?.entityStatus === "matched" && !result.conflicts.length && result.claims.length > 0;
  return <details className="company-verification"><summary>公司性质需要进一步核实？</summary><p>先复用已确认资料；仍不清楚时再点击联网核实。结果需核对主体及原文，不影响保存投递。</p><Button type="button" variant="outline" disabled={!company.trim() || creating || task.busy} onClick={start}>{creating ? "创建核实任务…" : "联网核实公司性质"}</Button>
    {id && <div role="status"><p>公司核实：{task.phase} · 已耗时 {task.elapsed} 秒 <a href={`?view=aiCenter&job=${id}`} target="_blank" rel="noreferrer">查看任务与来源</a></p>{task.busy && <Button type="button" variant="outline" onClick={task.cancel}>取消公司核实</Button>}{["failed", "cancelled"].includes(task.job?.status || "") && <Button type="button" variant="outline" onClick={task.retry}>重试公司核实</Button>}{task.error && <Button type="button" variant="outline" onClick={task.reload}>重新读取核实状态</Button>}</div>}
    {(error || task.error || task.job?.errorMessage) && <p role="alert">{error || task.error || task.job?.errorMessage}</p>}
    {id && task.job && !matches && <p>公司或链接已经变化，此任务不用于当前岗位，请重新核实。</p>}
    {matches && result && <div className="capture-conflicts"><p><b>候选主体：{result.legalName || "未确定"}</b> · {({ matched: "模型匹配，待你核对", ambiguous: "主体存在歧义", not_found: "未找到足够资料" })[result.entityStatus]}</p>{result.registryId && <p>统一社会信用代码（待核对）：{result.registryId}</p>}
      {result.claims.map((claim, index) => <article key={index}><b>{claim.field === "companyNature" ? natureLabels[claim.value as keyof typeof natureLabels] : tagLabels[claim.value as keyof typeof tagLabels] || claim.value}</b><blockquote>{claim.quote}</blockquote><a href={claim.sourceUrl} target="_blank" rel="noreferrer">打开来源核对原文</a><small>引文由模型摘录，尚未独立抓取全文校验。</small></article>)}
      {result.conflicts.map(item => <p key={item}>冲突：{item}</p>)}{result.notes.map(item => <p key={item}>待核对说明：{item}</p>)}
      <p>来源获取：{result.sources[0]?.crawledAt ? new Date(result.sources[0].crawledAt).toLocaleString() : "没有有效来源"}。不因缺少分类阻止保存。</p>
      {canApply && <Button type="button" variant="outline" onClick={() => {onVerified(result.legalName,result.registryId);onChange(applyMetadataSuggestions(metadata, companyVerificationSuggestions(result, id, task.job!.promptVersion), metadataContext(company, sourceUrl)));}}>已核对主体与原文，加入分类建议</Button>}
      {!result.claims.length && <p>没有可采用的分类建议，保持未知或保留你的填写。</p>}
    </div>}
  </details>;
}
