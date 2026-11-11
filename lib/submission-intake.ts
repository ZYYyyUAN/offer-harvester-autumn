import { ApiError, getDatabase } from "./server-data";
import { intakeSemanticPayload, type IntakeConfirmationV2 } from "./submission-intake-contracts";
import { applicationSaveStatements, hashText, resumeIdentity } from "./application-submission";
import { atomicBatch, insertRecord, ownedRecord, updateRecordStatement, versionGuard, listKind } from "./jd-store";
import { validateJobMetadata } from "./job-metadata-store";
import { metadataContext } from "./job-metadata";
import { ApplicationDataSchema, SavedJobDataSchema } from "./data-contracts";
import { jobFingerprint } from "./workflow-contracts";

async function intakeResult(ownerId: string, receipt: { savedJobId: string; applicationId: string | null }, reused: boolean) {
  const saved = await ownedRecord(ownerId, receipt.savedJobId, "saved_jobs");
  const application = receipt.applicationId ? await ownedRecord(ownerId, receipt.applicationId, "applications") : null;
  const submission = application ? (await listKind(ownerId,"job_submissions")).find((r)=>r.data.applicationId===application.id) : null;
  return { reused, record: application || saved, source: saved, savedJobId: saved.id, applicationId: application?.id || null, submissionId: submission?.id || null, snapshotId: submission?.data.snapshotId || null };
}
export async function confirmSubmissionIntake(ownerId: string, draftId: string, input: IntakeConfirmationV2) {
  const draft = await ownedRecord(ownerId,draftId,"job_capture_drafts"), db=getDatabase();
  const inputSha256 = await hashText(JSON.stringify(intakeSemanticPayload(input)));
  if (draft.data.confirmation) {
    const receipt=draft.data.confirmation;
    if (receipt.operationKey!==input.operationKey || receipt.inputSha256!==inputSha256) throw new ApiError(409,"此草稿已确认其他内容，请新建草稿","INTAKE_ALREADY_CONFIRMED");
    for (const id of [receipt.savedJobId,receipt.applicationId].filter(Boolean)) {
      const row=await db.prepare("SELECT deleted_at FROM records WHERE id = ? AND owner_id = ?").bind(id,ownerId).first<{deleted_at:string|null}>();
      if (!row) throw new ApiError(410,"原确认结果已永久删除，请新建草稿","INTAKE_RESULT_DELETED");
      if (row.deleted_at) throw new ApiError(409,"原确认结果已在回收站，不会重复创建","INTAKE_RESULT_IN_TRASH");
    }
    return intakeResult(ownerId,receipt,true);
  }
  if (draft.data.confirmedSavedJobId) throw new ApiError(409,"旧草稿已经收藏，请从现有记录继续处理","INTAKE_LEGACY_CONFIRMED");
  if (draft.version!==input.draftVersion) throw new ApiError(409,"草稿已更新，请刷新后重试","VERSION_CONFLICT");
  const now=new Date().toISOString(), submitted=input.intent==="submitted";
  const metadata={...input.jobMetadata, actualSubmission:submitted ? {channel:input.submission.actualChannel.value,customLabel:input.submission.actualChannel.customLabel,contextKey:metadataContext(input.values.company,input.values.sourceUrl),confirmedAt:now}:null};
  const saved=await validateJobMetadata(ownerId,SavedJobDataSchema.parse({...input.values,jobMetadata:metadata,extractionJobId:draft.data.extractionJobId,savedAt:now,fingerprint:jobFingerprint(input.values)}),{...draft.data.values,jobMetadata:draft.data.metadata});
  if (!submitted && saved.screenshotFileId && !await db.prepare("SELECT id FROM stored_files WHERE owner_id = ? AND id = ? AND purpose = 'job_screenshot' AND deleted_at IS NULL").bind(ownerId,saved.screenshotFileId).first()) throw new ApiError(404,"来源截图不存在");
  const duplicate=(await listKind(ownerId,"saved_jobs")).find((r)=>jobFingerprint(r.data)===saved.fingerprint);
  if(duplicate&&!input.allowDuplicate) return {duplicate,requiresConfirmation:true};
  const selected=submitted?input.submission.resumeSelection:null;
  const frozen=submitted?await resumeIdentity(ownerId,selected?.fileId||null):undefined;
  if(selected&&(selected.version!==frozen!.resumeFileVersion||selected.sha256.toLowerCase()!==frozen!.resumeSha256)) throw new ApiError(409,"所选简历版本或内容已变化，请重新选择","RESUME_IDENTITY_CONFLICT");
  const savedId=crypto.randomUUID(), applicationId=submitted?crypto.randomUUID():null;
  const receipt={intent:input.intent,operationKey:input.operationKey,inputSha256,savedJobId:savedId,applicationId,confirmedAt:now};
  const statements=[versionGuard(ownerId,draftId,input.draftVersion),...(selected?[versionGuard(ownerId,selected.fileId,selected.version,"stored_files")]:[])];
  if(applicationId){
    const application=ApplicationDataSchema.parse({...saved,stage:"已投递",appliedAt:input.submission.appliedAt,appliedAtStatus:input.submission.appliedAtStatus,savedJobId:savedId,intakeDraftId:draftId,resumeId:selected?.fileId||"",resumeName:frozen!.resumeDisplayName,checklist:{submitted:{done:true,at:now}}});
    statements.push(...await applicationSaveStatements(ownerId,applicationId,application,null,input.operationKey,false,{resumeIdentity:frozen!,pendingSavedJobId:savedId}));
  }
  statements.push(insertRecord(ownerId,"saved_jobs",`${saved.company} ${saved.role}`.trim()||"收藏岗位",{...saved,...(applicationId?{converted:true,convertedAt:now,convertedApplicationId:applicationId}: {})},savedId),updateRecordStatement(ownerId,draft,{...draft.data,confirmedSavedJobId:savedId,confirmation:receipt}),insertRecord(ownerId,"activity_events",submitted?"记录已投岗位":"仅收藏岗位",{entityType:applicationId?"applications":"saved_jobs",entityId:applicationId||savedId,action:"intake_confirmed",draftId,intent:input.intent,operationKey:input.operationKey}));
  await atomicBatch(statements,{ownerId,id:draftId});
  return intakeResult(ownerId,receipt,false);
}
