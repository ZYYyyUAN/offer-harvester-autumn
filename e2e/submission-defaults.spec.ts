import { test, expect, type APIResponse, type APIRequestContext } from "@playwright/test";
async function json(response: APIResponse) { const text=await response.text();expect(response.ok(),text).toBe(true);return JSON.parse(text); }
async function upload(request: APIRequestContext, name: string, extra="") {return (await json(await request.post("/api/files?purpose=resume"+extra,{headers:{"content-type":"application/pdf","x-file-name":name},data:Buffer.from("%PDF-1.4\n% synthetic "+name+"\n%%EOF")}))).file;}
const identity=(file:any)=>({fileId:file.id,version:file.version,sha256:file.metadata.sha256});
test.describe.configure({mode:"serial"});test.beforeEach(async({request})=>{await json(await request.delete("/api/profile?confirm=DELETE"));});
test("default resume lifecycle preserves submitted identity and restoration never resets the preference",async({request})=>{
 const file=await upload(request,"first.pdf"); let setting=await json(await request.patch("/api/settings/submission-defaults",{data:{version:0,defaultSubmissionResume:identity(file)}}));expect(setting.status).toBe("available");
 const draft=(await json(await request.post("/api/job-capture-drafts",{data:{values:{company:"合成公司"},metadata:{}}}))).record;
 await json(await request.post(`/api/job-capture-drafts/${draft.id}/confirm`,{data:{requestVersion:2,draftVersion:draft.version,operationKey:draft.id,intent:"submitted",values:{company:"合成公司",role:"后端"},submission:{appliedAt:null,appliedAtStatus:"unknown",resumeSelection:setting.resolvedResume?{fileId:setting.resolvedResume.fileId,version:setting.resolvedResume.version,sha256:setting.resolvedResume.sha256}:null,actualChannel:{value:"unknown"}},jobMetadata:{}}}));
 const before=await json(await request.get("/api/data/export?format=json"));const snapshot=before.records.find((r:any)=>r.kind==="jd_snapshots");expect(snapshot.data.resumeFileId).toBe(file.id);
 const revised=await upload(request,"second.pdf");setting=await json(await request.get("/api/settings/submission-defaults"));expect(setting.resolvedResume.fileId).toBe(file.id);
 await json(await request.patch("/api/files",{data:{id:file.id,version:file.version,metadata:{displayName:"重命名"}}}));setting=await json(await request.get("/api/settings/submission-defaults"));expect(setting.status).toBe("available");expect(setting.resolvedResume.version).toBe(file.version+1);
 setting=await json(await request.patch("/api/settings/submission-defaults",{data:{version:setting.version,defaultSubmissionResume:identity(revised)}}));
 await json(await request.delete(`/api/files?id=${revised.id}&version=${revised.version}`));expect((await json(await request.get("/api/settings/submission-defaults"))).defaultSubmissionResume).toBeNull();
 const deleted=(await json(await request.get("/api/trash"))).items.find((r:any)=>r.id===revised.id);
 await json(await request.post("/api/trash",{data:{items:[{type:"file",id:revised.id,version:deleted.version}]}}));
 expect((await json(await request.get("/api/settings/submission-defaults"))).defaultSubmissionResume).toBeNull();
 const after=await json(await request.get("/api/data/export?format=json"));expect(after.records.find((r:any)=>r.id===snapshot.id).data).toEqual(snapshot.data);
});
test("owner, optimization library, hash and profile CAS guard every default entry point",async({request})=>{
 const a=await upload(request,"a.pdf"),b=await upload(request,"b.pdf");
 const foreign=await request.patch("/api/settings/submission-defaults",{headers:{"oai-authenticated-user-id":"outsider"},data:{version:0,defaultSubmissionResume:identity(a)}});expect(foreign.status()).toBe(404);
 expect((await request.patch("/api/profile",{data:{version:0,defaultSubmissionResume:{...identity(a),sha256:"a".repeat(64)}}})).status()).toBe(409);
 const optimization=await upload(request,"draft.pdf","&libraryType=optimization");expect((await request.patch("/api/settings/submission-defaults",{data:{version:0,defaultSubmissionResume:identity(optimization)}})).status()).toBe(422);
 const pair=await Promise.all([a,b].map(file=>request.patch("/api/settings/submission-defaults",{data:{version:0,defaultSubmissionResume:identity(file)}})));expect(pair.filter(r=>r.ok())).toHaveLength(1);expect(pair.filter(r=>r.status()===409)).toHaveLength(1);
 const selected=await json(await request.get("/api/settings/submission-defaults"));
 await json(await request.patch("/api/settings/job-search",{data:{minimumSample:6}}));expect((await json(await request.get("/api/settings/submission-defaults"))).defaultSubmissionResume).toEqual(selected.defaultSubmissionResume);
 expect((await request.patch("/api/settings/submission-defaults",{data:{version:selected.version,defaultSubmissionResume:null}})).status()).toBe(409);
});
