import test from "node:test";
import assert from "node:assert/strict";
import { IntakeConfirmationV2Schema, intakeSemanticPayload } from "../lib/submission-intake-contracts.ts";
import { hasReachedSubmissionStage, submissionStageBucket, submissionWorkspaceSummary } from "../lib/submission-workspace.ts";
const now = "2026-11-11T04:00:00.000Z";
const makeInput = () => IntakeConfirmationV2Schema.parse({ requestVersion: 2, draftVersion: 1, operationKey: "00000000-0000-4000-8000-000000000001", intent: "submitted", values: { company: "合成公司", role: "Java 开发" }, submission: { appliedAt: null, appliedAtStatus: "unknown", resumeSelection: null, actualChannel: { value: "unknown" } }, jobMetadata: {} });
test("submitted intake allows unknown optional facts while refusing contradictory dates and unsafe links", () => {
  const input=makeInput(); assert.equal(input.submission.resumeSelection,null); assert.equal(input.submission.actualChannel.value,"unknown");
  assert.equal(IntakeConfirmationV2Schema.safeParse({...input,submission:{...input.submission,appliedAtStatus:"known"}}).success,false);
  assert.equal(IntakeConfirmationV2Schema.safeParse({...input,values:{...input.values,sourceUrl:"javascript:alert(1)"}}).success,false);
  assert.equal(IntakeConfirmationV2Schema.safeParse({...input,values:{...input.values,company:""}}).success,false);
  assert.equal(IntakeConfirmationV2Schema.safeParse({...input,intent:"saved_only",values:{...input.values,company:"",role:"",jd:"岗位正文"}}).success,true);
});
test("replay payload excludes volatile confirmation timestamps but includes actual submission identity", () => {
  const a=makeInput(), b=structuredClone(a);
  b.jobMetadata.actualSubmission={channel:"unknown",customLabel:"",contextKey:JSON.stringify(["合成公司",""]),confirmedAt:now};
  assert.deepEqual(intakeSemanticPayload(a),intakeSemanticPayload(b));
  b.submission.actualChannel.value="email"; assert.notDeepEqual(intakeSemanticPayload(a),intakeSemanticPayload(b));
});
test("fixed 12 application and 2 saved samples keep unknown stages visible and historical offers distinct", () => {
  const stages=["已投递","已投递","已投递","已投递","笔试中","笔试中","面试中","面试中","OFFER","已结束","已结束","准备简历"];
  const rows=stages.map((stage,i)=>({id:String(i),kind:"applications",data:{stage} as Record<string,any>}));
  const records=[...rows,...rows.slice(0,11).map((r)=>({id:"submission-"+r.id,kind:"job_submissions",data:{applicationId:r.id}})),{id:"saved1",kind:"saved_jobs",data:{}},{id:"saved2",kind:"saved_jobs",data:{}},{id:"offerEvent",kind:"application_events",data:{applicationId:"9",to:"OFFER"}}];
  rows[0].data.nextFollowUpAt="2026-11-11T10:00";
  const result=submissionWorkspaceSummary(records,now);
  assert.equal(result.totalRecords,12); assert.equal(result.totalSubmitted,11); assert.equal(result.interviewing,2); assert.equal(result.offersObtained,2); assert.equal(result.followUpDue,1); assert.equal(result.stageCounts.unknown,1);
  assert.equal(submissionStageBucket("准备简历"),"unknown"); assert.equal(rows[11].data.stage,"准备简历");
  rows[0].data.lastContactAt="2026-11-11T11:00";assert.equal(submissionWorkspaceSummary(records,now).followUpDue,0);
});
test("follow-up tasks deduplicate per opportunity and closed or completed tasks are excluded", () => {
  const records=[{id:"a",kind:"applications",data:{stage:"已投递"}},{id:"b",kind:"applications",data:{stage:"已结束"}},...["a","a","b"].map((id,i)=>({id:"task"+i,kind:"tasks",data:{applicationId:id,category:"follow_up",status:"todo",dueAt:"2026-11-10"}}))];
  assert.equal(submissionWorkspaceSummary(records,now).followUpDue,1);
  for(const r of records.filter(r=>r.kind==="tasks")) r.data.status="done";
  assert.equal(submissionWorkspaceSummary(records,now).followUpDue,0);
});

test("direct interview and offer outcomes never invent earlier written or interview rounds",()=>{
 const interview={id:"interview",kind:"applications",data:{stage:"面试中"}};
 assert.equal(hasReachedSubmissionStage(interview,"已投递",[]),true);
 assert.equal(hasReachedSubmissionStage(interview,"笔试中",[]),false);
 const offer={id:"offer",kind:"applications",data:{stage:"OFFER"}};
 assert.equal(hasReachedSubmissionStage(offer,"面试中",[]),false);
 assert.equal(hasReachedSubmissionStage(offer,"OFFER",[]),true);
 assert.equal(hasReachedSubmissionStage(offer,"面试中",[{id:"event",kind:"application_events",data:{applicationId:"offer",from:"面试中",to:"OFFER"}}]),true);
 const closed={id:"closed",kind:"applications",data:{stage:"已结束",closure:{confirmation:"confirmed",outcome:"joined",stage:"unknown"}}};
 assert.equal(hasReachedSubmissionStage(closed,"OFFER",[]),true);
 assert.equal(hasReachedSubmissionStage(closed,"笔试中",[]),false);
});

import { validateRecordData } from "../lib/data-contracts.ts";
test("unknown legacy stages may be read or corrected without silently becoming submitted", () => {
 const legacy={company:"合成公司",role:"后端",stage:"准备简历"};
 assert.throws(()=>validateRecordData("applications",legacy));
 assert.equal(validateRecordData("applications",legacy,{preserveLegacyStage:true}).stage,"准备简历");
 assert.equal(validateRecordData("applications",{...legacy,notes:"补充备注"},{preserveLegacyStage:true}).stage,"准备简历");
});

test("application entry contracts reject malformed dates and contradictory known status",()=>{
 const base={company:"合成公司",role:"Java",stage:"已投递"};
 assert.throws(()=>validateRecordData("applications",{...base,appliedAt:123}));
 assert.throws(()=>validateRecordData("applications",{...base,appliedAt:null,appliedAtStatus:"known"}));
 assert.throws(()=>validateRecordData("applications",{...base,appliedAt:"not-a-date"}));
 assert.equal(validateRecordData("applications",{...base,appliedAt:null,appliedAtStatus:"unknown"}).appliedAt,null);
});
