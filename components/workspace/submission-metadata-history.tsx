"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, Field } from "./shared";
import { channelLabels, natureLabels, type JobMetadata } from "@/lib/job-metadata";

export function SubmissionMetadataHistory({ applicationId, version, metadata, onSaved }: { applicationId: string; version: number; metadata: JobMetadata; onSaved: () => void }) {
  const [history, setHistory] = useState<{ submissions: any[]; revisions: any[] } | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { api<any>(`/api/applications/${applicationId}/submission-metadata-revisions`).then(setHistory).catch((error) => toast.error(error.message)); }, [applicationId]);
  async function backfill() {
    setBusy(true);
    try { await api(`/api/applications/${applicationId}/submission-metadata-revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, expectedRevision: Math.max(0, ...(history?.revisions || []).map((r) => r.data.revision)), jobMetadata: metadata, reason }) }); setHistory(await api<any>(`/api/applications/${applicationId}/submission-metadata-revisions`)); setReason(""); toast.success("已追加历史补录，原投递快照保持不变"); onSaved(); }
    catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  }
  if (!history?.submissions.length) return null;
  const original = history.submissions[0].data;
  return <section className="metadata-editor"><h3>投递时分类与渠道</h3><p>首次归档：{natureLabels[original.metadataSnapshot?.companyNature as keyof typeof natureLabels] || "未知"} · {channelLabels[original.metadataSnapshot?.actualSubmission?.channel as keyof typeof channelLabels] || "未知"}</p>{history.revisions.map((r) => <p key={r.id}>历史补录 v{r.data.revision} · {r.data.recordedAt} · {channelLabels[r.data.metadata.actualSubmission?.channel as keyof typeof channelLabels]} · {r.data.reason}</p>)}<Field label="历史补录原因"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：投递后核实实际提交渠道" /></Field><Button type="button" variant="outline" disabled={busy || !reason.trim()} onClick={backfill}>{busy ? "保存中…" : "将当前核对值追加为历史补录"}</Button><small>不改写 JD 正文或内容哈希，统计会明确标注补录时间。</small></section>;
}
