"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, Field, PageHead } from "./shared";
import type { StoredFile } from "./types";

async function post(path: string, body: unknown) {
  const result = await api<any>("/api/jd/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (result.job) {
    toast.info("任务已保存，可在 AI 任务中心查看或取消");
    return api<any>("/api/ai/jobs/" + result.job.id + "/run", { method: "POST" });
  }
  return result;
}
const levelNames: Record<string, string> = { must: "必备", important: "重要", bonus: "加分", unspecified: "未明确" };
export function ResumeImprovementLinks({ resumes }: { resumes: StoredFile[] }) {
  const [items, setItems] = useState<any[]>([]), [error, setError] = useState("");
  useEffect(() => { api<any>("/api/jd/gaps").then((r) => setItems(r.suggestions)).catch((e) => setError(e.message)); }, []);
  return <section className="panel"><h2>来自 JD 技能画像的改进</h2><p>上传修改稿后，在原建议中关联文件；完成任务不代表已经掌握技能。</p>{error && <p role="alert">{error}</p>}
    {!items.length && !error && <p>尚无差距建议。先选择岗位样本与简历，生成待确认的改进方向。</p>}
    {items.map((s) => <article className="jd-source-item" key={s.id}><b>{s.data.suggestion.category} · {s.data.suggestion.issue}</b><p>目标简历：{resumes.find((r) => r.id === s.data.targetResumeFileId)?.filename || "历史版本"} · {({pending:"待确认",accepted:"已采纳",completed:"已完成",ignored:"已忽略"} as any)[s.data.status]}{s.data.taskId && " · 已关联行动任务"}{s.data.resultResumeFileId && " · 已关联手动修改稿"}</p><a href={"/?view=skillProfile&jdTab=gaps&jdResume=" + encodeURIComponent(s.data.targetResumeFileId)}>查看来源、任务与修改稿</a></article>)}
    <Link href="/?view=skillProfile&jdTab=gaps">分析岗位样本与简历</Link>
  </section>;
}
export function JDArchivePanel({ sourceId }: { sourceId: string }) {
  const [data, setData] = useState<any>(null), [detail, setDetail] = useState<any>(null), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false);
  const [jd, setJd] = useState(""), [reason, setReason] = useState("");
  const [edit, setEdit] = useState<any>(null);
  const load = useCallback(async () => {
    const result = await api<any>("/api/jd/sources/" + sourceId); setData(result); setJd(result.source.data.jd || "");
    const latest = [...result.snapshots].sort((a: any,b: any) => b.data.revision - a.data.revision)[0];
    if (latest) setDetail(await api("/api/jd/snapshots/" + latest.id)); else setDetail(null);
  }, [sourceId]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    try { await post(path, body); await load(); toast.success("已保存"); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  const snapshot = detail?.snapshot;
  const extraction = detail?.extractions?.find((e: any) => e.id === snapshot?.data.activeExtractionId);
  return <section className="jd-archive-section"><h3>JD 原文与历史归档</h3>
    <p className="muted">历史正文不会被当前岗位编辑覆盖；补录会标记实际归档时间。投递时间未知时保持未知。</p>
    <div className="card-actions"><Button variant="outline" onClick={() => setEditing(true)} disabled={!data}>补录 / 纠正 JD</Button>
      {snapshot && <Button disabled={busy || !snapshot.data.jdText.trim()} onClick={() => act("snapshots/" + snapshot.id + "/extract", { version: snapshot.version })}>提取岗位要求</Button>}
      {snapshot && <Button variant="outline" disabled={busy} onClick={() => act("snapshots/" + snapshot.id + "/ignore", { version: snapshot.version, ignored: !snapshot.data.ignored })}>{snapshot.data.ignored ? "恢复统计" : "忽略此样本"}</Button>}
    </div>
    {data?.snapshots?.length > 0 && <Field label="历史快照版本"><select value={snapshot?.id || ""} onChange={async (e) => { try { setDetail(await api("/api/jd/snapshots/" + e.target.value)); } catch (err) { toast.error((err as Error).message); } }}>
      {[...data.snapshots].reverse().map((s: any) => <option value={s.id} key={s.id}>v{s.data.revision} · {s.data.captureReason === "late_entry" ? "投递后补录" : s.data.captureReason === "correction" ? "纠正版" : "归档"} · {s.data.capturedAt}</option>)}
    </select></Field>}
    {snapshot ? <><dl className="jd-facts"><div><dt>实际投递</dt><dd>{snapshot.data.appliedAt || "未知"}</dd></div><div><dt>投递时简历</dt><dd>{snapshot.data.resumeDisplayName || "未记录"}{snapshot.data.resumeSha256 && <small title={snapshot.data.resumeSha256}> · SHA-256 {snapshot.data.resumeSha256.slice(0, 12)}</small>}</dd></div></dl>
      <pre className="jd-original">{snapshot.data.jdText || "待补充 JD"}</pre>
      {detail.extractions.length > 1 && <Field label="有效提取版本（原人工修订保留在原版本）"><select value={extraction?.id || ""} disabled={busy} onChange={(e) => act("extractions/" + e.target.value + "/activate", { version: snapshot.version, revisionDecision: "keep_previous" })}>
        <option value="">请选择提取版本</option>{detail.extractions.map((e: any) => <option key={e.id} value={e.id}>{e.createdAt} · {e.id.slice(-8)}</option>)}
      </select></Field>}
      {detail.extractions.length > 1 && <details><summary>比较其他提取版本与当前有效版本</summary><p>切换前先核对差异；原人工修订仍保留在原提取版本。</p>{detail.extractions.filter((e: any) => e.id !== extraction?.id).map((candidate: any) => <article key={candidate.id}><h4>{candidate.createdAt}</h4>{candidate.data.output.requirements.map((r: any) => {
        const previous = extraction?.data.output.requirements.find((p: any) => p.skillId === r.skillId && p.type === r.type);
        const changed = previous && ["importance","condition","polarity","anyGroup","depth"].some((key) => previous[key] !== r[key]);
        return <p key={r.key}>{!previous ? "新增" : changed ? "发生变化" : "保持"} · {r.proposedName} · {levelNames[r.importance]} · {r.anyGroup ? "可选要求" : r.condition || "直接要求"} · {r.polarity === "required" ? "正向" : "否定"}<br />{r.citations.map((c: any) => c.quote).join("；")}</p>;
      })}{extraction?.data.output.requirements.filter((r: any) => !candidate.data.output.requirements.some((p: any) => p.skillId === r.skillId && p.type === r.type)).map((r: any) => <p key={r.key}>此版本移除 · {r.proposedName}</p>)}</article>)}</details>}
      {extraction && <div className="jd-requirement-list">{extraction.data.output.requirements.map((r: any) => {
        const correction = detail.edits.filter((e: any) => e.data.extractionId === extraction.id && e.data.requirementKey === r.key).sort((a: any,b: any) => b.data.revision - a.data.revision)[0];
        const current = { ...r, ...correction?.data.patch };
        return <article key={r.key}><div><b>{current.proposedName}</b><span>{levelNames[current.importance]} · {current.anyGroup ? "替代组，可选技术" : current.condition || "直接要求"} · {current.polarity === "required" ? "正向要求" : "否定 / 不要求"}{current.ignored ? " · 已忽略" : ""}</span></div>
          {current.citations.map((c: any, i: number) => <blockquote key={i}>{c.quote}<small>原文位置 {c.start}–{c.end}</small></blockquote>)}
          {current.reviewReason && <p>待确认：{current.reviewReason}</p>}
          <Button variant="outline" disabled={busy} onClick={() => setEdit({ ...current, extractionId: extraction.id, snapshotVersion: snapshot.version, reason: correction?.data.reason || "" })}>纠正 / 忽略</Button>
        </article>;
      })}</div>}
    </> : <p>尚无历史快照。可以先补录；系统不会把今天的 JD 冒充为投递当天的内容。</p>}
    {editing && <Dialog open onOpenChange={setEditing}><DialogContent><DialogHeader><DialogTitle>补录或纠正 JD</DialogTitle><DialogDescription>已有快照时会创建修订版，保留原文及原投递简历。</DialogDescription></DialogHeader>
      <Field label="完整 JD"><Textarea rows={12} value={jd} onChange={(e) => setJd(e.target.value)} /></Field>
      <Field label="补录 / 纠正原因"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <DialogFooter><Button variant="outline" onClick={() => setEditing(false)}>取消</Button><Button disabled={busy || !reason.trim()} onClick={async () => { if (await act("sources/" + sourceId + "/archive", { version: data.source.version, jd, reason })) setEditing(false); }}>保存新归档</Button></DialogFooter>
    </DialogContent></Dialog>}
    {edit && <Dialog open onOpenChange={(open) => !open && setEdit(null)}><DialogContent><DialogHeader><DialogTitle>人工纠正要求</DialogTitle><DialogDescription>修订单独保存；原模型输出不会改变。</DialogDescription></DialogHeader>
      <Field label="标准名称"><Input value={edit.proposedName} onChange={(e) => setEdit({ ...edit, proposedName: e.target.value })} /></Field>
      <Field label="要求类型"><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{Object.entries({ technical_skill: "技术技能", business_scenario: "业务场景", responsibility: "岗位职责", engineering_practice: "工程实践", qualification: "资格条件" }).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      <Field label="重要程度"><select value={edit.importance} onChange={(e) => setEdit({ ...edit, importance: e.target.value })}>{Object.entries(levelNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      <Field label="待确认原因（核实后可清空）"><Input value={edit.reviewReason} onChange={(e) => setEdit({ ...edit, reviewReason: e.target.value })} /></Field>
      <label><input type="checkbox" checked={Boolean(edit.ignored)} onChange={(e) => setEdit({ ...edit, ignored: e.target.checked })} />忽略本条要求</label>
      <Field label="修订原因"><Input value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
      <DialogFooter><Button disabled={busy || !edit.reason.trim() || !edit.proposedName.trim()} onClick={async () => {
        if (await act("extractions/" + edit.extractionId + "/edit", { version: edit.snapshotVersion, requirementKey: edit.key,
          patch: { proposedName: edit.proposedName, type: edit.type, importance: edit.importance, ignored: Boolean(edit.ignored), reviewReason: edit.reviewReason }, reason: edit.reason })) setEdit(null);
      }}>保存修订</Button></DialogFooter>
    </DialogContent></Dialog>}
  </section>;
}

const initialFilters = { scope: "applied", direction: "", city: "", companyType: "", stage: "", reached: "", from: "", to: "", resumeId: "", state: "", sort: "count" };
export function SkillProfileView({ resumes }: { resumes: StoredFile[] }) {
  const [filters, setFilters] = useState(initialFilters), [tab, setTab] = useState("skills"), [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<any>(null), [gaps, setGaps] = useState<any>(null), [selected, setSelected] = useState(""), [resumeId, setResumeId] = useState("");
  const [busy, setBusy] = useState(false), [resultFiles, setResultFiles] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const restore = () => {
      const url = new URL(window.location.href); const f = { ...initialFilters };
      for (const key of Object.keys(f) as Array<keyof typeof f>) f[key] = url.searchParams.get("jd_" + key) || initialFilters[key];
      setFilters(f); setTab(url.searchParams.get("jdTab") || "skills"); setSelected(url.searchParams.get("jdSource") || ""); setResumeId(url.searchParams.get("jdResume") || ""); setReady(true);
    };
    restore(); window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore);
  }, []);
  const filterKey = JSON.stringify(filters);
  const load = useCallback(async () => {
    const [p,g] = await Promise.all([api("/api/jd?" + new URLSearchParams(JSON.parse(filterKey))), api("/api/jd/gaps")]); setProfile(p); setGaps(g); setFailure("");
  }, [filterKey]);
  useEffect(() => { if (ready) load().catch((e) => setFailure(e.message)); }, [ready, load]);
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href); for (const [key,value] of Object.entries(filters)) { if (value) url.searchParams.set("jd_" + key, value); else url.searchParams.delete("jd_" + key); }
    url.searchParams.set("jdTab", tab); if (selected) url.searchParams.set("jdSource", selected); else url.searchParams.delete("jdSource"); if (resumeId) url.searchParams.set("jdResume", resumeId); else url.searchParams.delete("jdResume");
    window.history.replaceState({}, "", url);
  }, [filters, tab, selected, resumeId, ready]);
  async function act(path: string, body: unknown) {
    setBusy(true);
    try { await post(path, body); await load(); toast.success("操作完成"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const file = resumes.find((r) => r.id === resumeId);
  const text = gaps?.texts?.find((t: any) => t.data.fileId === resumeId);
  return <div className="jd-profile"><PageHead eyebrow="JD 归档与技能画像" title="从投递要求找到简历改进方向" description="统计只描述你选择的岗位样本；每项要求和建议都可以追溯原文。" />
    <div className="card-actions"><Button variant={tab === "skills" ? "default" : "outline"} onClick={() => setTab("skills")}>技能统计</Button><Button variant={tab === "gaps" ? "default" : "outline"} onClick={() => setTab("gaps")}>简历差距</Button><Button variant="outline" disabled={busy} onClick={() => load().catch((e) => setFailure(e.message))}>刷新数据</Button></div>
    {failure && <p role="alert">{failure}</p>}
    <details className="panel jd-filter-panel"><summary>筛选岗位样本 · {filters.scope === "applied" ? "实际投递" : "收藏岗位"}{filters.city && " · " + filters.city}{filters.direction && " · " + filters.direction}</summary><div className="jd-filter-grid">
      <Field label="样本范围"><select value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value })}><option value="applied">实际投递</option><option value="saved">收藏岗位（独立样本）</option></select></Field>
      <Field label="岗位方向"><Input value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })} /></Field>
      <Field label="城市"><Input value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} /></Field>
      <Field label="公司类别"><select value={filters.companyType} onChange={(e) => setFilters({ ...filters, companyType: e.target.value })}><option value="">全部</option>{["unknown","large_tech","mid_size","startup","soe_bank","foreign","outsourcing","other"].map((v) => <option key={v} value={v}>{({ unknown: "未知", large_tech: "大厂", mid_size: "中厂", startup: "初创", soe_bank: "国企银行", foreign: "外企", outsourcing: "外包", other: "其他" } as any)[v]}</option>)}</select></Field>
      <Field label="当前阶段"><select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}><option value="">全部</option>{["待投递","已投递","笔试中","面试中","OFFER","已结束"].map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="历史到达"><select value={filters.reached} onChange={(e) => setFilters({ ...filters, reached: e.target.value })}><option value="">全部（旧记录可能未知）</option>{["已投递","笔试中","面试中","OFFER"].map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="开始日期"><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
      <Field label="结束日期"><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
      <Field label="投递时简历"><select value={filters.resumeId} onChange={(e) => setFilters({ ...filters, resumeId: e.target.value })}><option value="">全部</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.metadata.displayName || r.filename}</option>)}</select></Field>
      <Field label="归档状态"><select value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}>{[["","全部"],["missing","缺失 JD"],["pending","待提取"],["valid","有效"],["ignored","已忽略"],["failed","失败"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="排序"><select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="count">出现岗位数</option><option value="weight">必备3 / 重要2 / 加分1</option></select></Field>
    </div></details>
    {profile && <><section className="jd-stats">{[["岗位",profile.statistics.total],["有效分析",profile.statistics.valid],["缺失 JD",profile.statistics.missing],["待提取",profile.statistics.pending],["失败",profile.statistics.failed],["忽略",profile.statistics.ignored],["待确认要求",profile.statistics.pendingRequirements]].map(([name,count]) => <div key={name}><span>{name}</span><strong>{count}</strong></div>)}</section>
      {tab === "skills" ? <div className="jd-two-column"><section className="panel"><h2>技能需求</h2><p>{profile.statistics.valid < 5 ? "有效样本不足五个，只显示数量。" : "比例分母为当前有效分析的独立岗位数。"}可选技术不等同于必备；相关技能父级按岗位去重。</p>
        {profile.statistics.skills.length ? profile.statistics.skills.map((s: any) => <details key={s.skillId}><summary><b>{s.name}</b> · {s.count} 个岗位{s.ratio !== null && " · " + Math.round(s.ratio * 100) + "%"} · 可选 {s.optionalCount} · 条件 {s.conditionalCount}</summary>
          <p>必备 {s.importance.must} / 重要 {s.importance.important} / 加分 {s.importance.bonus} / 未明确 {s.importance.unspecified}</p>
          {s.sources.map((src: any) => <p key={src.snapshotId}>{src.company} · {src.role} <Button variant="outline" onClick={() => { const a = profile.archives.find((a: any) => a.id === src.snapshotId); setSelected(a.data.applicationId || a.data.savedJobId); }}>查看原文</Button></p>)}
        </details>) : <p>还没有有效技能统计。先归档 JD，再主动提取岗位要求。</p>}
      </section><section className="panel"><h2>岗位归档</h2>{profile.archives.map((s: any) => <article className="jd-source-item" key={s.id}><b>{s.data.company} · {s.data.role}</b><p>{s.data.appliedAt || "投递时间未知"} · v{s.data.revision}{s.ignored ? " · 已忽略" : ""}</p><Button variant="outline" onClick={() => setSelected(s.data.applicationId || s.data.savedJobId)}>查看 JD 与要求</Button></article>)}
        {profile.legacy.length > 0 && <><h3>尚未归档 / 旧记录</h3>{profile.legacy.map((s: any) => <article className="jd-source-item" key={s.id}><b>{s.data.company} · {s.data.role}</b><Button variant="outline" onClick={() => setSelected(s.id)}>补录归档</Button></article>)}</>}
      </section></div> : <section className="panel"><h2>选择简历，建立改进清单</h2>
        <Field label="用于比较的简历版本"><select value={resumeId} onChange={(e) => setResumeId(e.target.value)}><option value="">请选择</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.metadata.displayName || r.filename}</option>)}</select></Field>
        <div className="card-actions"><Button variant="outline" disabled={!file || busy} onClick={() => act("resumes/" + file!.id + "/parse", { version: file!.version })}>解析 / 查看正文</Button>
          <Button disabled={!file || !text?.data.confirmedAt || !profile.statistics.valid || busy} onClick={() => act("gaps", { resumeFileId: file!.id, resumeFileVersion: file!.version, filters, sampleDigest: profile.sampleDigest })}>分析所选简历与岗位样本</Button></div>
        {text && <details open={!text.data.confirmedAt}><summary>核对解析文本 · {text.data.confirmedAt ? "已确认" : "待确认"}</summary><pre className="jd-original">{text.data.text}</pre><Button disabled={busy || Boolean(text.data.confirmedAt)} onClick={() => act("texts/" + text.id + "/confirm", { version: text.version })}>确认与原件一致</Button></details>}
        {gaps?.analyses?.map((analysis: any) => <article className="jd-gap-report" key={analysis.id}><h3>简历差距报告 · {analysis.createdAt}</h3><p>{analysis.data.input.samples.length} 个岗位样本 · 简历 SHA-256 {analysis.data.input.resumeSha256.slice(0,12)}</p>
          <details><summary>同一样本的简历版本对比</summary><p>以下仅比较建议数量，不代表技能已经掌握或录用概率变化。</p>{gaps.analyses.filter((a: any) => a.data.input.sampleDigest === analysis.data.input.sampleDigest).map((a: any) => <p key={a.id}>{a.id === analysis.id ? "当前报告" : a.createdAt} · 简历 {a.data.input.resumeSha256.slice(0,12)} · {(["A","B","C"] as const).map((category) => category + " " + a.data.output.suggestions.filter((s: any) => s.category === category).length).join(" / ")}</p>)}</details>
          {gaps.suggestions.filter((s: any) => s.data.analysisId === analysis.id).map((s: any) => <div className="jd-suggestion" key={s.id}><b>{s.data.suggestion.category} · {s.data.suggestion.issue}</b><p>{({ pending:"待确认",accepted:"已采纳",completed:"已完成",ignored:"已忽略" } as any)[s.data.status]}</p>
            <p>{s.data.suggestion.suggestedExpression || (s.data.suggestion.category === "C" ? "资料不足，先确认是否掌握。" : "请根据真实项目补充表达和证据；未测量的指标保持未知。")}</p>{s.data.suggestion.questions.map((q: string) => <p key={q}>{q}</p>)}
            <details><summary>查看要求与个人证据</summary><pre className="jd-original">{JSON.stringify({ requirements: analysis.data.input.requirements.filter((r: any) => s.data.suggestion.requirementRefs.includes(r.requirementId)), evidence: analysis.data.input.evidence.filter((e: any) => s.data.suggestion.evidenceRefs.includes(e.id)), resumeQuotes: s.data.suggestion.resumeQuotes }, null, 2)}</pre></details>
            <div className="card-actions">{s.data.suggestion.category === "C" && <><Button variant="outline" disabled={busy} onClick={() => act("suggestions/" + s.id, { version: s.version, status: "accepted", capabilityDecision: "has_evidence" })}>已掌握，补充事实</Button><Button variant="outline" disabled={busy} onClick={() => act("suggestions/" + s.id, { version: s.version, status: "accepted", capabilityDecision: "needs_practice" })}>尚未掌握，安排实践</Button></>}
              {s.data.suggestion.category !== "C" && s.data.status === "pending" && <Button disabled={busy} onClick={() => act("suggestions/" + s.id, { version: s.version, status: "accepted", capabilityDecision: s.data.capabilityDecision })}>采纳建议</Button>}
              <Button variant="outline" disabled={busy} onClick={() => act("suggestions/" + s.id, { version: s.version, status: s.data.status === "ignored" ? "pending" : "ignored", capabilityDecision: s.data.capabilityDecision })}>{s.data.status === "ignored" ? "恢复待确认" : "忽略"}</Button>
              {s.data.status === "accepted" && <Button disabled={busy || Boolean(s.data.taskId)} onClick={() => act("suggestions/" + s.id + "/task", { version: s.version })}>{s.data.taskId ? "已创建任务" : "加入行动清单"}</Button>}
            </div>
            <Field label="手动修改后的简历"><select value={resultFiles[s.id] || s.data.resultResumeFileId || ""} onChange={(e) => setResultFiles({ ...resultFiles, [s.id]: e.target.value })}><option value="">上传修改稿到简历库后选择</option>{resumes.map((r) => <option value={r.id} key={r.id}>{r.metadata.displayName || r.filename}</option>)}</select></Field>
            <div className="card-actions"><Button variant="outline" disabled={busy || !resultFiles[s.id]} onClick={() => { const f = resumes.find((r) => r.id === resultFiles[s.id])!; return act("suggestions/" + s.id + "/result", { version: s.version, fileId: f.id, fileVersion: f.version }); }}>关联修改稿</Button>
              <Button variant="outline" disabled={busy || s.data.status === "completed" || (s.data.suggestion.category !== "C" && !s.data.resultResumeFileId)} onClick={() => act("suggestions/" + s.id, { version: s.version, status: "completed", capabilityDecision: s.data.capabilityDecision })}>标记完成</Button></div>
          </div>)}
        </article>)}
      </section>}
    </>}
    {selected && <Dialog open onOpenChange={(open) => !open && setSelected("")}><DialogContent className="jd-detail-dialog"><DialogHeader><DialogTitle>岗位 JD 归档</DialogTitle><DialogDescription>原文、历史和提取证据</DialogDescription></DialogHeader><JDArchivePanel sourceId={selected} /></DialogContent></Dialog>}
  </div>;
}

