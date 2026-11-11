export const submissionStages = ["待投递", "已投递", "笔试中", "面试中", "OFFER", "已结束"] as const;
export function submissionStageBucket(stage: unknown): string { return submissionStages.includes(stage as typeof submissionStages[number]) ? String(stage) : "unknown"; }
type Entry = { id: string; kind: string; data: Record<string, any> };
export function hasReachedSubmissionStage(application: Entry, stage: string, records: Entry[]) {
  const submittedStages = ["已投递", "笔试中", "面试中", "OFFER"];
  const matches = (value: unknown) => value === stage || (stage === "已投递" && submittedStages.includes(String(value)));
  const closure = application.data.closure;
  const closureStage = closure?.confirmation === "confirmed" ? ({resume_screening:"已投递",written_test:"笔试中",interview:"面试中",offer:"OFFER"} as Record<string,string>)[closure.stage] : null;
  return matches(application.data.stage) || (closureStage ? matches(closureStage) : false)
    || records.some((r) => ["application_events", "activity_events"].includes(r.kind) && r.data.applicationId === application.id && (matches(r.data.from) || matches(r.data.to)))
    || (["已投递","OFFER"].includes(stage) && (records.some((r) => r.kind === "offers" && r.data.applicationId === application.id) || (closure?.confirmation === "confirmed" && ["offer_accepted", "offer_declined", "joined"].includes(closure.outcome))))
    || (["已投递","面试中"].includes(stage) && records.some(r=>r.kind==="interviews" && r.data.applicationId===application.id));
}
export function hasSubmittedEvidence(application: Entry, records: Entry[]) {
  return records.some((r) => r.kind === "job_submissions" && r.data.applicationId === application.id)
    || hasReachedSubmissionStage(application, "已投递", records)
    || Boolean(application.data.appliedAt)
    || application.data.checklist?.submitted === true || application.data.checklist?.submitted?.done === true;
}
function workspaceTime(value: string) { return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T00:00:00+08:00" : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) ? value + "+08:00" : value); }
export function submissionWorkspaceSummary(records: Entry[], now: string) {
  const apps = [...new Map(records.filter((r) => r.kind === "applications").map((r) => [r.id, r])).values()];
  const dueTasks = new Set(records.filter((r) => r.kind === "tasks" && r.data.category === "follow_up" && ["todo", "doing"].includes(r.data.status) && workspaceTime(r.data.dueAt || "") <= Date.parse(now)).map((r) => r.data.applicationId));
  const stageCounts = Object.fromEntries([...submissionStages,"unknown"].map((stage) => [stage, apps.filter((r) => submissionStageBucket(r.data.stage) === stage).length]));
  return { totalRecords: apps.length, totalSubmitted: apps.filter((r) => hasSubmittedEvidence(r, records)).length, interviewing: apps.filter((r) => r.data.stage === "面试中").length,
    followUpDue: apps.filter((r) => r.data.stage !== "已结束" && (dueTasks.has(r.id) || (workspaceTime(r.data.nextFollowUpAt || "") <= Date.parse(now) && (!r.data.lastContactAt || workspaceTime(r.data.lastContactAt) < workspaceTime(r.data.nextFollowUpAt))))).length,
    offersObtained: apps.filter((r) => hasReachedSubmissionStage(r, "OFFER", records)).length,
    stageCounts };
}
