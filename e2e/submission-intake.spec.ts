import { test, expect, type APIResponse } from "@playwright/test";
async function json(response: APIResponse) { const text=await response.text(); expect(response.ok(),text).toBe(true); return JSON.parse(text); }
test.describe.configure({mode:"serial"});
test.beforeEach(async({request})=>{await json(await request.delete("/api/profile?confirm=DELETE"));});
function body(draft: any, intent="submitted") { return {requestVersion:2,draftVersion:draft.version,operationKey:draft.id,intent,values:{company:"合成已投公司",role:"Java 后端",jd:"熟悉 Java。"},submission:{appliedAt:null,appliedAtStatus:"unknown",resumeSelection:null,actualChannel:{value:"email"}},jobMetadata:{}}; }
test("one transaction creates submitted source, application and immutable snapshot; repeated confirmation reuses identity",async({request})=>{
 const draft=(await json(await request.post("/api/job-capture-drafts",{data:{values:{company:"合成已投公司"},metadata:{}}}))).record;
 const payload=body(draft), url=`/api/job-capture-drafts/${draft.id}/confirm`;
 const pair=await Promise.all([request.post(url,{data:payload}),request.post(url,{data:payload})]);
 expect(pair.some(r=>r.ok())).toBe(true);expect(pair.every(r=>r.ok()||r.status()===409)).toBe(true);
 const first=await json(await request.post(url,{data:payload})); expect(first.reused).toBe(true); expect(first.record.data.stage).toBe("已投递");expect(first.record.data.appliedAt).toBeNull();
 const backup=await json(await request.get("/api/data/export?format=json"));
 for(const kind of ["applications","saved_jobs","job_submissions","jd_snapshots"])expect(backup.records.filter((r:any)=>r.kind===kind)).toHaveLength(1);
 const snapshot=backup.records.find((r:any)=>r.kind==="jd_snapshots");expect(snapshot.data.savedJobId).toBe(first.savedJobId);expect(snapshot.data.deletedSourceIds).not.toContain(first.savedJobId);expect(snapshot.data.appliedAtStatus).toBe("unknown");
 expect(backup.records.find((r:any)=>r.kind==="job_submissions").data.metadataSnapshot.actualSubmission.channel).toBe("email");
 expect((await request.post(url,{data:{...payload,values:{...payload.values,role:"另一岗位"}}})).status()).toBe(409);
 expect((await request.post(url,{headers:{"oai-authenticated-user-id":"other-owner"},data:payload})).status()).toBe(404);
});
test("saved-only intent creates no submitted identity and old clients still save collections",async({request})=>{
 const draft=(await json(await request.post("/api/job-capture-drafts",{data:{values:{company:"仅收藏"},metadata:{}}}))).record;
 await json(await request.post(`/api/job-capture-drafts/${draft.id}/confirm`,{data:body(draft,"saved_only")}));
 const backup=await json(await request.get("/api/data/export?format=json"));expect(backup.records.filter((r:any)=>["applications","job_submissions","jd_snapshots"].includes(r.kind))).toHaveLength(0);
 const legacy=(await json(await request.post("/api/job-capture-drafts",{data:{values:{company:"旧客户端",role:"运营"},metadata:{}}}))).record;
 const saved=await json(await request.post(`/api/job-capture-drafts/${legacy.id}/confirm`,{data:{draftVersion:legacy.version}}));expect(saved.record.kind).toBe("saved_jobs");
});
test("stale drafts and foreign resume references cannot leave partial rows",async({request})=>{
 const draft=(await json(await request.post("/api/job-capture-drafts",{data:{values:{company:"合成公司"},metadata:{}}}))).record;
 const input=body(draft),url=`/api/job-capture-drafts/${draft.id}/confirm`;
 expect((await request.post(url,{data:{...input,draftVersion:99}})).status()).toBe(409);
 expect((await request.post(url,{data:{...input,submission:{...input.submission,resumeSelection:{fileId:crypto.randomUUID(),version:1,sha256:"a".repeat(64)}}}})).status()).toBe(404);
 const dump=await json(await request.get("/api/data/export?format=json"));expect(dump.records.filter((r:any)=>r.kind!=="job_capture_drafts")).toHaveLength(0);
});
