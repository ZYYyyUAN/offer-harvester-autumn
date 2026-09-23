"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, EmptyState, Field, formatDate, PageHead, StatusPill, useConfirmDialog } from "@/components/workspace/shared";
import type { Kind, RecordItem, StoredFile } from "@/components/workspace/types";

export function FeishuView({ resumes, records, onDataChanged }: { resumes: StoredFile[]; records: Record<Kind, RecordItem[]>; onDataChanged: () => Promise<void> }) {
  const [status, setStatus] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<any[]>([]);
  const [syncRun, setSyncRun] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [minutesText, setMinutesText] = useState("");
  const [minutesRun, setMinutesRun] = useState<any>(null);
  const [resumeImportRun, setResumeImportRun] = useState<any>(null);
  const [acceptanceRun, setAcceptanceRun] = useState<any>(null);
  const [interviewId, setInterviewId] = useState(records.interviews[0]?.id || "");
  const [documentImport, setDocumentImport] = useState({ token: "", title: "", entityId: records.applications[0]?.id || records.interviews[0]?.id || "" });
  const confirmation = useConfirmDialog();

  const reload = useCallback(async () => {
    const [connection, history, health] = await Promise.all([api<any>("/api/integrations/feishu"), api<any>("/api/integrations/feishu/runs"), api<any>("/api/integrations/feishu/diagnostics")]);
    setStatus(connection); setRuns(history.runs || []); setDiagnostic(health);
    const acceptanceRuns = (history.runs || []).filter((run: any) => run.runType === "acceptance_suite"); const actionableAcceptance = acceptanceRuns.find((run: any) => run.status !== "cleaned") || acceptanceRuns[0]; if (actionableAcceptance) setAcceptanceRun(actionableAcceptance);
  }, []);
  useEffect(() => { reload().catch((error) => toast.error(error.message)); }, [reload]);

  async function action(name: string, task: () => Promise<void>) {
    setBusy(name); try { await task(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(""); }
  }
  const connection = status?.connection;
  const config = connection?.config || {};
  const connected = connection?.status === "connected";
  const bootstrapped = Boolean(config.bitableAppToken && config.tableId && config.rootFolderToken);
  const requiredReady = Boolean(diagnostic?.requiredReady);

  async function bootstrap() {
    await action("bootstrap", async () => { await api("/api/integrations/feishu/bootstrap", { method: "POST" }); await reload(); toast.success("飞书专用空间已准备好"); });
  }
  async function previewSync() {
    await action("preview", async () => { const result = await api<any>("/api/integrations/feishu/sync/preview", { method: "POST" }); setSyncRun(result.run); setDecisions(Object.fromEntries(result.run.preview.items.map((item: any) => [item.id, item.defaultDecision]))); toast.success("同步预览已生成，尚未改动任何数据"); });
  }
  async function commitSync() {
    if (!syncRun) return;
    await action("commit", async () => { const result = await api<any>(`/api/integrations/feishu/sync/${syncRun.id}/commit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: syncRun.version, decisions: syncRun.preview.items.map((item: any) => ({ itemId: item.id, action: decisions[item.id] || item.defaultDecision })) }) }); setSyncRun(null); await Promise.all([reload(), onDataChanged()]); if (result.run.status === "partial") toast.error("部分项目未能同步，请查看审计记录后重新预览"); else toast.success("投递记录同步完成"); });
  }
  async function loadFiles() {
    await action("files", async () => { const result = await api<any>("/api/integrations/feishu/files?folder=resumes"); setRemoteFiles(result.files || []); });
  }
  async function exportResume(id: string) {
    await action(`resume-${id}`, async () => { const result = await api<any>(`/api/integrations/feishu/resumes/${id}/export`, { method: "POST" }); toast.success(result.duplicate ? "该简历已在飞书中" : "简历已导出到飞书"); await loadFiles(); });
  }
  async function importResume(file: any) {
    const type = String(file.type || file.name?.split(".").pop() || "").toLowerCase();
    await action(`remote-${file.token}`, async () => { const result = await api<any>("/api/integrations/feishu/resumes/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remoteFileToken: file.token, name: file.name, type, size: Number(file.size || 0) }) }); setResumeImportRun(result.run); toast.success("导入预览已生成，尚未保存文件"); });
  }
  async function commitResumeImport() { if (!resumeImportRun) return; await action("resume-import", async () => { await api("/api/integrations/feishu/resumes/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: resumeImportRun.id, version: resumeImportRun.version }) }); setResumeImportRun(null); await Promise.all([reload(), onDataChanged()]); toast.success("简历已导入私有文件库"); }); }
  async function runAcceptance() { await action("acceptance", async () => { const result = await api<any>("/api/integrations/feishu/acceptance", { method: "POST" }); setAcceptanceRun(result.run); await reload(); toast.success(result.run.status === "succeeded" ? "合成验收已完成" : "验收存在失败项，请查看步骤"); }); }
  async function cleanupAcceptance() { if (!acceptanceRun || !await confirmation.ask("清理本次飞书验收数据？", "只会删除当前验收批次创建的合成对象，不会触碰其他本地或飞书数据。", true)) return; await action("acceptance-cleanup", async () => { const result = await api<any>(`/api/integrations/feishu/acceptance/${acceptanceRun.id}/cleanup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, version: acceptanceRun.version }) }); setAcceptanceRun(result.run); await Promise.all([reload(), onDataChanged()]); toast.success(result.run.status === "cleaned" ? "验收数据已清理" : "部分远程对象清理失败，可重试"); }); }
  async function exportReport(item: RecordItem, mode: "update" | "copy") {
    await action(`report-${item.id}`, async () => { const result = await api<any>("/api/integrations/feishu/reports/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordId: item.id, kind: item.kind, mode }) }); toast.success(result.updated ? "原飞书文档已追加更新" : "报告已生成飞书文档"); if (result.document?.url) window.open(result.document.url, "_blank", "noopener,noreferrer"); });
  }
  async function importDocumentSnapshot() {
    const target = [...records.applications, ...records.saved_jobs, ...records.research, ...records.interviews].find((item) => item.id === documentImport.entityId);
    if (!target || !documentImport.token.trim() || !documentImport.title.trim()) return toast.error("请填写文档标识、标题并选择关联记录");
    await action("document-import", async () => { await api("/api/integrations/feishu/reports/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentToken: documentImport.token.trim(), documentType: "docx", title: documentImport.title.trim(), entityType: target.kind, entityId: target.id }) }); setDocumentImport((current) => ({ ...current, token: "", title: "" })); toast.success("飞书文档已保存为只读快照，不会进入事实库"); });
  }
  async function previewMinutes() {
    await action("minutes", async () => { const result = await api<any>("/api/integrations/feishu/minutes/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: minutesUrl || undefined, text: minutesText || undefined }) }); setMinutesRun(result.run); toast.success("妙记转写预览已生成"); });
  }
  async function previewMinutesFile(file: File) {
    await action("minutes", async () => { const form = new FormData(); form.set("file", file); const result = await api<any>("/api/integrations/feishu/minutes/preview", { method: "POST", body: form }); setMinutesRun(result.run); setMinutesText(result.run.preview.transcript || ""); toast.success("转写文件预览已生成"); });
  }
  async function commitMinutes() {
    if (!minutesRun || !interviewId) return toast.error("请选择面试记录");
    await action("minutes-commit", async () => { await api("/api/integrations/feishu/minutes/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: minutesRun.id, runVersion: minutesRun.version, interviewId }) }); setMinutesRun(null); setMinutesText(""); setMinutesUrl(""); await onDataChanged(); toast.success("转写文本已写入面试记录"); });
  }

  if (!status) return <div className="panel integration-loading"><RefreshCw className="spin" />正在读取飞书连接状态…</div>;
  return <>
    <PageHead eyebrow="FEISHU INTEGRATION" title="飞书同步中心" description="OFFER 收割机仍是唯一主数据源；所有远程变更先预览、再由你确认。" action={<Button variant="outline" onClick={() => reload()} disabled={Boolean(busy)}><RefreshCw />刷新状态</Button>} />
    {!status.configured ? <section className="panel feishu-setup"><div className="setup-icon"><AlertTriangle /></div><div><h2>尚未配置飞书自建应用</h2><p>当前页面安全可用，但连接按钮暂不显示。请在 Sites 生产环境中配置下列三项机密，然后重新发布。</p><div className="secret-list">{status.missing.map((item: string) => <code key={item}>{item}</code>)}</div><ol><li>飞书开放平台创建“中国版企业自建应用”，可用范围仅自己。</li><li>添加回调地址：<code>{status.callbackUrl}</code></li><li>开通用户身份、云空间文件、云文档/文档块、多维表格权限；需要直接导入妙记时再开通妙记读取。</li><li>发布应用，再把 App ID 和 App Secret 配置为站点机密。</li></ol></div></section> : !connected ? <section className="panel feishu-setup"><div className="setup-icon"><RefreshCw /></div><div><h2>{connection?.status === "needs_reauth" ? "飞书授权需要更新" : "连接你的飞书账号"}</h2><p>{connection?.lastError || "授权只用于你主动发起的同步、导入和导出。"}</p><Button asChild><a href="/api/integrations/feishu/connect">前往飞书授权</a></Button></div></section> : <>
      <section className="integration-summary">
        <article className="panel"><StatusPill tone="green">已连接</StatusPill><h2>{connection.externalUserName || "飞书账号"}</h2><p>令牌已在服务端加密保存，浏览器无法读取。</p><Button variant="outline" onClick={() => action("disconnect", async () => { await api("/api/integrations/feishu/disconnect", { method: "POST" }); await reload(); toast.success("已断开连接，本地数据与飞书文件均保留"); })} disabled={busy === "disconnect"}>断开连接</Button></article>
        <article className="panel"><StatusPill tone={bootstrapped ? "green" : requiredReady ? "blue" : "orange"}>{bootstrapped ? "空间已就绪" : requiredReady ? "等待初始化" : "权限待补齐"}</StatusPill><h2>OFFER 收割机专用空间</h2><p>{bootstrapped ? "文件夹、投递多维表格与字段映射已保存；重复初始化不会再创建一套。" : requiredReady ? "首次初始化会创建简历、分析报告、面试复盘文件夹和投递记录多维表格。" : "必需权限未全部授权，初始化与同步已安全禁用。"}</p>{bootstrapped ? <div className="integration-links"><a href={config.rootFolderUrl} target="_blank" rel="noreferrer">打开专用文件夹 <ExternalLink /></a><a href={config.bitableUrl} target="_blank" rel="noreferrer">打开投递表格 <ExternalLink /></a></div> : requiredReady ? <Button onClick={bootstrap} disabled={busy === "bootstrap"}>{busy === "bootstrap" ? <RefreshCw className="spin" /> : <Plus />}初始化专用空间</Button> : <Button asChild><a href="/api/integrations/feishu/connect">重新授权</a></Button>}</article>
      </section>
      <section className="panel diagnostic-panel"><div className="panel-title"><div><h2>连接诊断</h2><p>{diagnostic?.tenantFingerprint ? `租户指纹 ${diagnostic.tenantFingerprint} · ` : ""}令牌到期 {formatDate(diagnostic?.tokenExpiresAt, true)}</p></div><StatusPill tone={requiredReady ? "green" : "orange"}>{requiredReady ? "必需能力通过" : "缺少必需权限"}</StatusPill></div><div className="capability-grid">{(diagnostic?.capabilities || []).map((item: any) => <article key={item.id} className={item.granted ? "ready" : "missing"}><b>{item.granted ? "已授权" : item.required ? "必需" : "可选"} · {item.label}</b><small>{item.granted ? item.matchedScopes.join("、") : item.hint}</small></article>)}</div>{!requiredReady && <p className="integration-warning">请到飞书开放平台为当前自建应用补齐缺失权限，再点击“重新授权”。本页不会在权限不足时创建半套资源。</p>}</section>
      <section className="panel acceptance-panel"><div className="panel-title"><div><h2>测试企业 · 一键合成验收</h2><p>只创建带批次标识的虚拟投递、虚拟简历和虚拟报告；不要在测试企业放入真实求职资料。</p></div><Button onClick={runAcceptance} disabled={!requiredReady || Boolean(busy)}>{busy === "acceptance" ? <RefreshCw className="spin" /> : <CheckCircle2 />}开始验收</Button></div>{acceptanceRun && <div className="acceptance-result"><div><StatusPill tone={acceptanceRun.status === "succeeded" || acceptanceRun.status === "cleaned" ? "green" : "orange"}>{acceptanceRun.status}</StatusPill><b>{acceptanceRun.result?.tag || acceptanceRun.preview?.tag || acceptanceRun.id}</b></div><div className="acceptance-steps">{(acceptanceRun.result?.steps || []).map((step: any) => <span key={step.id} className={step.status}><CheckCircle2 />{step.label}</span>)}</div>{acceptanceRun.status !== "cleaned" && <Button variant="outline" onClick={cleanupAcceptance} disabled={Boolean(busy)}>一键清理本批次</Button>}</div>}</section>
      {bootstrapped && <>
        <section className="panel sync-panel"><div className="panel-title"><div><h2>投递记录双向同步</h2><p>仅生成预览不会修改任何一侧；冲突默认保留 OFFER 收割机版本。</p></div><Button onClick={previewSync} disabled={Boolean(busy)}>{busy === "preview" ? <RefreshCw className="spin" /> : <RefreshCw />}生成同步预览</Button></div>
          {syncRun ? <div className="sync-preview"><div className="sync-counts"><span>本地 {syncRun.preview.localCount}</span><span>飞书 {syncRun.preview.remoteCount}</span><span>待确认 {syncRun.preview.items.filter((item: any) => item.type !== "unchanged").length}</span></div>{syncRun.preview.items.length ? <div className="sync-items">{syncRun.preview.items.map((item: any) => <article key={item.id}><div><StatusPill tone={item.type === "conflict" ? "orange" : item.type.includes("invalid") || item.type.includes("deletion") ? "red" : "blue"}>{({ local_only: "仅本地", remote_only: "仅飞书", push: "本地有更新", pull: "飞书有更新", conflict: "双向冲突", unchanged: "内容一致", deletion_warning: "删除提示", invalid_remote: "不可导入" } as any)[item.type]}</StatusPill><b>{item.local?.company || item.remote?.company || "未命名公司"} · {item.local?.role || item.remote?.role || "未命名岗位"}</b><small>{item.message}</small></div><select aria-label="同步处理方式" value={decisions[item.id] || item.defaultDecision} onChange={(event) => setDecisions((current) => ({ ...current, [item.id]: event.target.value }))} disabled={["invalid_remote", "deletion_warning", "unchanged"].includes(item.type)}><option value="local">使用本地版本</option><option value="remote">使用飞书版本</option><option value="skip">跳过</option></select></article>)}</div> : <EmptyState icon={CheckCircle2} title="两侧暂无记录" text="添加投递记录后再生成预览。" />}<div className="sync-submit"><small>预览有效期至 {formatDate(syncRun.expiresAt, true)}</small><Button onClick={commitSync} disabled={busy === "commit"}>{busy === "commit" ? <RefreshCw className="spin" /> : <CheckCircle2 />}确认并执行</Button></div></div> : null}
        </section>
        <div className="integration-columns">
          <section className="panel integration-module"><div className="panel-title"><div><h2>简历文件</h2><p>原文件副本在两侧分别保存，导入必须先预览。</p></div><Button variant="outline" onClick={loadFiles} disabled={busy === "files"}><RefreshCw />读取飞书</Button></div><div className="compact-list"><h3>本地简历</h3>{resumes.length ? resumes.map((file) => <article key={file.id}><span><b>{file.metadata.displayName || file.filename}</b><small>{fileSize(file.size)}</small></span><Button variant="outline" onClick={() => exportResume(file.id)} disabled={Boolean(busy)}>导出</Button></article>) : <p className="muted">本地暂无简历。</p>}<h3>飞书“简历”文件夹</h3>{remoteFiles.length ? remoteFiles.map((file) => { const supported = ["pdf", "docx", "doc"].includes(String(file.type || file.name?.split(".").pop() || "").toLowerCase()); return <article key={file.token}><span><b>{file.name}</b><small>{file.type || "文件"}</small></span>{supported ? <Button variant="outline" onClick={() => importResume(file)} disabled={Boolean(busy)}>预览导入</Button> : <small>该类型暂不导入</small>}</article>; }) : <p className="muted">点击“读取飞书”查看可导入文件。</p>}{resumeImportRun && <div className="import-confirm"><b>{resumeImportRun.preview.file.name}</b><small>{resumeImportRun.preview.duplicateLocalId ? "已导入过，不能重复导入" : `类型 ${resumeImportRun.preview.extension.toUpperCase()} · 将校验文件头与 20 MB 限制`}</small><Button onClick={commitResumeImport} disabled={Boolean(busy) || Boolean(resumeImportRun.preview.duplicateLocalId)}>确认导入</Button></div>}</div></section>
          <section className="panel integration-module"><div className="panel-title"><div><h2>分析报告与文档快照</h2><p>导出为飞书原生文档；导入只读快照不会进入事实库。</p></div></div><div className="compact-list">{[...records.analyses, ...records.research, ...records.interviews.filter((item) => item.data.review)].slice(0, 12).map((item) => <article key={item.id}><span><b>{item.title}</b><small>{item.kind === "interviews" ? "面试复盘" : item.kind === "research" ? "公司背调" : "岗位分析"}</small></span><span className="compact-actions"><Button variant="outline" onClick={() => exportReport(item, "update")} disabled={Boolean(busy)}>更新</Button><Button variant="outline" onClick={() => exportReport(item, "copy")} disabled={Boolean(busy)}>另存</Button></span></article>)}{![...records.analyses, ...records.research, ...records.interviews.filter((item) => item.data.review)].length && <p className="muted">生成分析、背调或复盘后可在此导出。</p>}<h3>导入飞书文档快照</h3><div className="document-import"><Input value={documentImport.token} onChange={(event) => setDocumentImport((current) => ({ ...current, token: event.target.value }))} placeholder="飞书文档 Token" /><Input value={documentImport.title} onChange={(event) => setDocumentImport((current) => ({ ...current, title: event.target.value }))} placeholder="快照标题" /><select value={documentImport.entityId} onChange={(event) => setDocumentImport((current) => ({ ...current, entityId: event.target.value }))}><option value="">选择关联记录</option>{[...records.applications, ...records.saved_jobs, ...records.research, ...records.interviews].map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button variant="outline" onClick={importDocumentSnapshot} disabled={Boolean(busy)}>保存快照</Button></div></div></section>
        </div>
        <section className="panel minutes-panel"><div className="panel-title"><div><h2>妙记与转写文本导入</h2><p>{config.minutesAvailable ? "当前授权包含妙记能力，也可使用文件/文本降级入口。" : "当前租户未授予妙记 API；直接链接入口已隐藏，请使用 TXT、DOCX、SRT 或文本。"}</p></div></div><div className="minutes-form">{config.minutesAvailable && <Field label="飞书妙记链接"><Input value={minutesUrl} onChange={(event) => setMinutesUrl(event.target.value)} placeholder="https://.../minutes/..." /></Field>}<Field label="转写文本（可直接粘贴）"><Textarea value={minutesText} onChange={(event) => setMinutesText(event.target.value)} placeholder="粘贴妙记导出的转写文本；导入前会生成预览" rows={6} /></Field><label className="upload-button secondary">读取 TXT / DOCX / SRT<input type="file" accept=".txt,.docx,.srt,text/plain,application/x-subrip,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={async (event) => { const file = event.target.files?.[0]; if (file) await previewMinutesFile(file); event.target.value = ""; }} /></label><Button onClick={previewMinutes} disabled={Boolean(busy) || (!minutesText.trim() && !minutesUrl.trim())}>生成导入预览</Button></div>{minutesRun && <div className="minutes-preview"><h3>{minutesRun.preview.title}</h3><p>{minutesRun.preview.characterCount} 字 · 尚未写入面试记录</p><pre>{minutesRun.preview.transcript.slice(0, 4000)}</pre><div><select value={interviewId} onChange={(event) => setInterviewId(event.target.value)}><option value="">选择面试记录</option>{records.interviews.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button onClick={commitMinutes}>确认导入</Button></div></div>}
        </section>
      </>}
    </>}
    {runs.length > 0 && <section className="panel run-history"><div className="panel-title"><div><h2>同步审计记录</h2><p>保留预览、决定、结果与部分失败信息。</p></div></div>{runs.slice(0, 12).map((run) => <article key={run.id}><StatusPill tone={run.status === "succeeded" || run.status === "cleaned" ? "green" : run.status === "partial" || run.status === "failed" ? "orange" : "blue"}>{run.status}</StatusPill><span><b>{({ application_sync: "投递记录同步", acceptance_suite: "合成全链路验收", minutes_import: "妙记导入", resume_import: "简历导入", resume_export: "简历导出", report_export: "报告导出" } as Record<string, string>)[run.runType] || "飞书集成任务"}</b><small>{formatDate(run.createdAt, true)}</small></span><small>{run.error || (run.runType === "acceptance_suite" ? `${run.result?.steps?.filter((step: any) => step.status === "succeeded").length ?? 0} 个步骤通过` : `成功 ${run.result?.succeeded ?? 0} 项`)}</small></article>)}</section>}{confirmation.dialog}
  </>;
}

