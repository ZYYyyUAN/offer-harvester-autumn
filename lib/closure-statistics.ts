import { closureOutcomeLabels, closureStageLabels } from "./application-closure.ts";

export function closureStatistics(applications: Array<{ id: string; data: Record<string, any> }>, minimumSample: number, from = "", to = "") {
  const closed = [...new Map(applications.filter((r) => r.data.stage === "已结束").map((r) => [r.id, r])).values()];
  const filtered = closed.filter((r) => { const day = r.data.closure?.endedAt ? new Date(new Date(r.data.closure.endedAt).getTime() + 8 * 3600000).toISOString().slice(0, 10) : null; return (!from && !to) || (day && (!from || day >= from) && (!to || day <= to)); });
  const rejected = filtered.filter((r) => r.data.closure?.outcome === "rejected" && r.data.closure.confirmation === "confirmed");
  const group = (items: typeof filtered, field: "outcome" | "stage", labels: Record<string, string>) => Object.entries(labels).map(([key, label]) => { const count = items.filter((r) => (r.data.closure?.[field] || "unknown") === key).length; return { key, label, count, percentage: items.length >= minimumSample ? Math.round(count / items.length * 100) : null }; }).filter((r) => r.count);
  return { totalClosed: closed.length, filteredCount: filtered.length, unknownDateCount: closed.filter((r) => !r.data.closure?.endedAt).length, needsReviewCount: filtered.filter((r) => !r.data.closure || r.data.closure.confirmation !== "confirmed").length, rejectedCount: rejected.length, outcomes: group(filtered, "outcome", closureOutcomeLabels), stages: group(rejected, "stage", closureStageLabels) };
}
