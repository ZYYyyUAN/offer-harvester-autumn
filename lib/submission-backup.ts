import { DefaultSubmissionResumeSchema, SubmissionResumeIdentitySchema } from "./submission-intake-contracts.ts";
import { IntakeConfirmationReceiptSchema } from "./job-metadata.ts";

type Entry = { id: string; kind: string; data: Record<string, any> };
type File = { id: string; sha256?: string; purpose?: string; version?: number; deletedAt?: string | null; metadata?: Record<string, any> };
export function validateSubmissionBackup(records: Entry[], files: File[], profile?: Record<string, any> | null, aiJobs?: Array<{id:string;type?:string}>) {
  const byId = new Map(records.map(r => [r.id, r])), byFile = new Map(files.map(f => [f.id, f]));
  function need(id: string, kind: string) { const r = byId.get(id); if (!r || r.kind !== kind) throw new Error("已投录入备份缺少或错配关联：" + id); return r; }
  function fileIdentity(raw: unknown, available: boolean) {
    const selected = SubmissionResumeIdentitySchema.parse(raw), file = byFile.get(selected.fileId);
    if (!file || file.purpose !== "resume" || !Number.isInteger(file.version) || Number(file.version) < 1 || file.sha256?.toLowerCase() !== selected.sha256 || selected.version > Number(file.version)) throw new Error("默认或草稿简历身份与附件清单不一致：" + selected.fileId);
    if (available && (file.deletedAt || file.metadata?.libraryType === "optimization")) throw new Error("默认简历不是有效的已完成简历");
  }
  if (profile) { const data = profile.data && typeof profile.data === "object" ? profile.data : profile; const selected = DefaultSubmissionResumeSchema.optional().parse(data.defaultSubmissionResume); if (selected) fileIdentity(selected, true); }
  if(aiJobs){
    const jobs=new Map(aiJobs.map(job=>[job.id,job]));
    for(const r of records){
      const metadata=[r.data.jobMetadata,r.data.metadata,r.data.metadataSnapshot].filter(Boolean);
      for(const m of metadata){
        if(m.companyVerificationJobId && jobs.get(m.companyVerificationJobId)?.type!=="company_metadata_verify") throw new Error("备份缺少公司核实任务或任务类型不匹配");
        for(const state of Object.values(m.fieldStates||{}) as Array<{evidence?:{sourceType:string;sourceRef:string;sourceDeleted?:boolean}}>){const evidence=state.evidence;if(evidence && !evidence.sourceDeleted && ["ai_inference","page_explicit","ocr_explicit"].includes(evidence.sourceType) && !jobs.has(evidence.sourceRef))throw new Error("备份缺少分类建议的 AI 审计记录");}
      }
    }
  }
  const intakeIds = new Set<string>();
  for (const r of records) {
    const d = r.data;
    if (r.kind === "applications" && d.intakeDraftId) {
      if (intakeIds.has(d.intakeDraftId)) throw new Error("一个录入草稿不能创建多个投递身份"); intakeIds.add(d.intakeDraftId);
      const receipt = need(d.intakeDraftId, "job_capture_drafts").data.confirmation;
      if (!receipt || receipt.applicationId !== r.id || receipt.intent !== "submitted" || receipt.savedJobId !== d.savedJobId) throw new Error("投递记录与草稿确认凭据不一致");
    }
    if (r.kind === "saved_jobs" && d.convertedApplicationId) { const app = byId.get(d.convertedApplicationId); if (app ? app.kind !== "applications" || app.data.savedJobId !== r.id : !d.convertedApplicationDeleted) throw new Error("来源岗位的投递关联无效"); }
    if (r.kind !== "job_capture_drafts") continue;
    if (d.values?.resumeSelection) fileIdentity(d.values.resumeSelection, false);
    if (!d.confirmation) continue;
    const receipt = IntakeConfirmationReceiptSchema.parse(d.confirmation), deleted = new Set(receipt.deletedResultIds || []);
    if ([...deleted].some(id=>id!==receipt.savedJobId && id!==receipt.applicationId)) throw new Error("删除标记不属于该确认凭据");
    if (d.confirmedSavedJobId && d.confirmedSavedJobId !== receipt.savedJobId) throw new Error("草稿已确认来源与凭据不一致");
    if (!deleted.has(receipt.savedJobId)) need(receipt.savedJobId, "saved_jobs");
    if (receipt.intent === "submitted") {
      if (!receipt.applicationId) throw new Error("已投确认缺少投递记录");
      if (!deleted.has(receipt.applicationId)) { const app = need(receipt.applicationId, "applications"); if (app.data.intakeDraftId !== r.id || app.data.savedJobId !== receipt.savedJobId) throw new Error("确认凭据与投递来源不一致"); }
    } else if (receipt.applicationId) throw new Error("仅收藏凭据不能包含正式投递");
  }
}
