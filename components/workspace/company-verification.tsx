"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "./shared";
import type { AIJob } from "./types";
import { useCaptureTask } from "./use-capture-task";
import { applyMetadataSuggestions, metadataContext, natureLabels, type JobMetadata } from "@/lib/job-metadata";
import { companyVerificationSuggestions, type verifiedCompanyResult } from "@/lib/company-verification";

export function CompanyVerification({ company, sourceUrl, metadata, onChange }: { company: string; sourceUrl: string; metadata: JobMetadata; onChange: (value: JobMetadata) => void }) {
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
  useEffect(() => {
    if (!matches || !result || result.entityStatus !== "matched" || result.conflicts.length) return;
    const suggestions = companyVerificationSuggestions(result, id, task.job!.promptVersion).filter(item => item.field === "companyNature");
    const next = applyMetadataSuggestions(metadata, suggestions, metadataContext(company, sourceUrl));
    if (JSON.stringify(next) !== JSON.stringify(metadata)) onChange(next);
  }, [matches, result, id, task.job, metadata, company, sourceUrl, onChange]);
  return <section className="company-verification" aria-label="公司性质核实"><p className="muted">先复用已确认资料；仍不清楚时再点击联网核实。有效结果自动预填公司性质，保存前统一核对；来源可在下方查看。</p><Button type="button" variant="outline" disabled={!company.trim() || creating || task.busy} onClick={start}>{creating ? "创建核实任务…" : "核实性质"}</Button>
    {id && <div role="status"><p>公司核实：{task.phase} · 已耗时 {task.elapsed} 秒 <a href={`?view=aiCenter&job=${id}`} target="_blank" rel="noreferrer">查看任务与来源</a></p>{task.busy && <Button type="button" variant="outline" onClick={task.cancel}>取消公司核实</Button>}{["failed", "cancelled"].includes(task.job?.status || "") && <Button type="button" variant="outline" onClick={task.retry}>重试公司核实</Button>}{task.error && <Button type="button" variant="outline" onClick={task.reload}>重新读取核实状态</Button>}</div>}
    {(error || task.error || task.job?.errorMessage) && <p role="alert">{error || task.error || task.job?.errorMessage}</p>}
    {id && task.job && !matches && <p>公司或链接已经变化，此任务不用于当前岗位，请重新核实。</p>}
    {matches && result && <details className="metadata-details"><summary>查看公司性质来源</summary><div><p><b>候选主体：{result.legalName || "未确定"}</b> · {({ matched: "模型匹配，待你核对", ambiguous: "主体存在歧义", not_found: "未找到足够资料" })[result.entityStatus]}</p>{result.registryId && <p>统一社会信用代码（待核对）：{result.registryId}</p>}
      {result.claims.filter(claim => claim.field === "companyNature").map((claim, index) => <article key={index}><b>{natureLabels[claim.value as keyof typeof natureLabels]}</b><blockquote>{claim.quote}</blockquote><a href={claim.sourceUrl} target="_blank" rel="noreferrer">打开来源核对原文</a><small>引文由模型摘录，尚未独立抓取全文校验。</small></article>)}
      {result.conflicts.map(item => <p key={item}>冲突：{item}</p>)}{result.notes.map(item => <p key={item}>待核对说明：{item}</p>)}
      <p>来源获取：{result.sources[0]?.crawledAt ? new Date(result.sources[0].crawledAt).toLocaleString() : "没有有效来源"}。不因缺少分类阻止保存。</p>
      {!result.claims.length && <p>没有可采用的分类建议，保持未知或保留你的填写。</p>}
    </div></details>}
  </section>;
}
