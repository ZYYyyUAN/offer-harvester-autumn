import test from "node:test";
import assert from "node:assert/strict";
import { validateSubmissionBackup } from "../lib/submission-backup.ts";
import { validateJDMerge } from "../lib/jd-backup.ts";
const ids = Array.from({length: 4},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
function sample() {
  const [draftId,savedId,appId,fileId]=ids, identity={fileId,version:1,sha256:"a".repeat(64)};
  const receipt={intent:"submitted",operationKey:draftId,inputSha256:"b".repeat(64),savedJobId:savedId,applicationId:appId,confirmedAt:"2026-11-11T00:00:00.000Z"};
  return {records:[{id:draftId,kind:"job_capture_drafts",data:{values:{resumeSelection:identity},confirmedSavedJobId:savedId,confirmation:receipt}},{id:savedId,kind:"saved_jobs",data:{convertedApplicationId:appId}},{id:appId,kind:"applications",data:{intakeDraftId:draftId,savedJobId:savedId}}] as any[],files:[{id:fileId,purpose:"resume",version:2,sha256:identity.sha256,metadata:{}}],profile:{data:{defaultSubmissionResume:identity}}};
}
test("v7 checks frozen file identity and complete bidirectional intake relationships",()=>{
 const s=sample();assert.doesNotThrow(()=>validateSubmissionBackup(s.records,s.files,s.profile));
 assert.throws(()=>validateSubmissionBackup(s.records.slice(1),s.files,s.profile),/缺少|错配/);
 const wrong=structuredClone(s);wrong.records[2].data.savedJobId=ids[0];assert.throws(()=>validateSubmissionBackup(wrong.records,wrong.files,wrong.profile),/不一致|无效/);
 assert.throws(()=>validateSubmissionBackup(s.records,[{...s.files[0],sha256:"c".repeat(64)}],s.profile),/身份/);
 assert.throws(()=>validateSubmissionBackup(s.records,[{...s.files[0],deletedAt:"2026-11-11"}],s.profile),/默认简历/);
 assert.doesNotThrow(()=>validateSubmissionBackup([],[],{data:{name:"旧资料"}}));
});
test("permanently detached source is explicit and cannot weaken the immutable confirmation identity",()=>{
 const s=sample(), draft=s.records[0];draft.data.confirmedSavedJobId="";draft.data.confirmation.deletedResultIds=[ids[1]];
 assert.doesNotThrow(()=>validateSubmissionBackup([draft,s.records[2]],s.files,s.profile));
 assert.throws(()=>validateSubmissionBackup([{...draft,data:{...draft.data,confirmation:{...draft.data.confirmation,deletedResultIds:[]}}},s.records[2]],s.files,s.profile),/缺少/);
 const changed=structuredClone(draft);changed.data.confirmation.inputSha256="d".repeat(64);assert.throws(()=>validateJDMerge(draft,changed),/确认/);
 const restoring=structuredClone(draft);delete restoring.data.confirmation.deletedResultIds;assert.doesNotThrow(()=>validateJDMerge(draft,restoring));
});

test("v7 retains the company's verification job rather than restoring a broken task link",()=>{
 const s=sample();s.records[0].data.metadata={companyVerificationJobId:ids[0],fieldStates:{}};
 assert.throws(()=>validateSubmissionBackup(s.records,s.files,s.profile,[]),/核实任务/);
 assert.doesNotThrow(()=>validateSubmissionBackup(s.records,s.files,s.profile,[{id:ids[0],type:"company_metadata_verify"}]));
});
