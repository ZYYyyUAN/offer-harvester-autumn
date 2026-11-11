"use client";
import type { SubmissionSummary } from "./types";
import { submissionStages } from "@/lib/submission-workspace";

export function stageLabel(stage: unknown) {
  if (stage === "待投递") return "准备中";
  if (stage === "已投递") return "已投简历";
  return submissionStages.includes(stage as typeof submissionStages[number]) ? String(stage) : `待核对${stage ? `（${String(stage)}）` : "（阶段未记录）"}`;
}
export function SubmissionMetrics({ summary }: { summary: SubmissionSummary }) {
  return <section className="submission-metrics" aria-label="投递摘要">{[
    ["累计投递", summary.totalSubmitted, "已有明确投递依据的独立机会，含已结束记录"],
    ["面试中", summary.interviewing, "当前阶段为面试中"],
    ["待跟进", summary.followUpDue, "明确跟进日期或跟进任务已到期，同机会只计一次"],
    ["已获 OFFER", summary.offersObtained, "历史曾获 OFFER，含已接受或拒绝的机会"],
  ].map(([label, count, hint]) => <article key={label} title={String(hint)}><span>{label}</span><strong>{count}</strong><small>{hint}</small></article>)}</section>;
}
