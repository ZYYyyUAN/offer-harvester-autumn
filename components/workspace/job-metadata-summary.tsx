"use client";
import { useEffect, useState } from "react";
import { api } from "./shared";
import { channelLabels, discoveryLabels, natureLabels } from "@/lib/job-metadata";
import type { RecordItem } from "./types";
export function JobMetadataSummary({ item }: { item: RecordItem }) {
  const [history, setHistory] = useState<any>(null), [error, setError] = useState("");
  useEffect(() => { api<any>(`/api/applications/${item.id}/submission-metadata-revisions`).then((result) => { setHistory(result); setError(""); }).catch((failure) => setError(failure.message)); }, [item.id, item.version]);
  const latest = history?.revisions?.slice().sort((a: any, b: any) => b.data.revision - a.data.revision)[0];
  const submitted = history?.submissions?.[0], frozen = latest?.data.metadata || submitted?.data.metadataSnapshot;
  const current = item.data.jobMetadata;
  return <section className="metadata-editor"><h3>分类与渠道记录</h3>{error && <p role="alert">{error}</p>}<dl className="detail-list"><div><dt>当前公司性质</dt><dd>{natureLabels[current?.companyNature as keyof typeof natureLabels] || "未知"}{current?.fieldStates?.companyNature?.status === "needs_review" && "（待重新核对）"}</dd></div><div><dt>最初发现来源</dt><dd>{discoveryLabels[current?.discoverySource as keyof typeof discoveryLabels] || "未知"}</dd></div><div><dt>计划投递渠道</dt><dd>{channelLabels[current?.submissionChannel as keyof typeof channelLabels] || "未知"}</dd></div><div><dt>实际投递渠道</dt><dd>{submitted ? channelLabels[frozen?.actualSubmission?.channel as keyof typeof channelLabels] || "未知（尚未核对）" : "尚未确认实际投递"}</dd></div>{latest && <div><dt>历史补录</dt><dd>{latest.data.recordedAt} · {latest.data.reason}</dd></div>}{item.data.channel && <div><dt>旧渠道原文（待核对）</dt><dd>{item.data.channel}</dd></div>}</dl></section>;
}
