import { test, expect, type APIResponse } from "@playwright/test";
const json=async(response:APIResponse)=>{const text=await response.text();expect(response.ok(),text).toBe(true);return JSON.parse(text);};
test.beforeEach(async({request})=>{await json(await request.delete("/api/profile?confirm=DELETE"));});
test("company checks filter fabricated sources, ambiguity and malformed output, and discard cancelled results",async({request})=>{
 for(const [marker,count] of [["",1],["VERIFY_UNKNOWN",0],["VERIFY_CONFLICT",0],["VERIFY_BAD_URL",0]] as const){
   const job=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:marker||"合成精确主体有限公司",sourceUrl:""}}}))).job;
   const done=(await json(await request.post(`/api/ai/jobs/${job.id}/run`))).job;expect(done.result.claims).toHaveLength(count);expect(done.result.quoteVerification).toBe("model_only");expect(done.result.sources[0].url).toBe("https://example.test/company");
 }
 const malformed=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:"VERIFY_BAD_SCHEMA"}}}))).job;
 expect((await request.post(`/api/ai/jobs/${malformed.id}/run`)).ok()).toBe(false);expect((await json(await request.get(`/api/ai/jobs/${malformed.id}`))).job.status).toBe("failed");
 const slow=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:"VERIFY_SLOW"}}}))).job;
 const running=request.post(`/api/ai/jobs/${slow.id}/run`);await expect.poll(async()=>(await json(await request.get(`/api/ai/jobs/${slow.id}`))).job.status).toBe("running");await json(await request.post(`/api/ai/jobs/${slow.id}/cancel`));await running;
 const cancelled=await json(await request.get(`/api/ai/jobs/${slow.id}`));expect(cancelled.job.status).toBe("cancelled");expect(cancelled.job.result).toBeNull();
 expect((await request.get(`/api/ai/jobs/${slow.id}`,{headers:{"oai-authenticated-user-id":"outsider"}})).status()).toBe(404);
});
test("company verification is click-only, preserves a manual override and restores its task from the cloud draft",async({page,request})=>{
 await page.goto("/?view=savedJobs");await page.getByRole("main").getByRole("button",{name:"记录已投岗位",exact:true}).click();let dialog=page.getByRole("dialog",{name:"记录已投岗位",exact:true});
 await dialog.getByLabel("公司",{exact:true}).fill("合成精确主体有限公司");await dialog.getByLabel("岗位",{exact:true}).fill("Java");expect((await json(await request.get("/api/ai/jobs?type=company_metadata_verify"))).jobs).toHaveLength(0);
 await dialog.getByRole("combobox",{name:"公司性质",exact:true}).selectOption("state_owned");await dialog.getByRole("button",{name:"核实性质",exact:true}).click();
 await expect(dialog.getByText("查看公司性质来源",{exact:true})).toBeVisible();
 await expect(dialog.getByRole("combobox",{name:"公司性质",exact:true})).toHaveValue("state_owned");
 await expect(dialog.getByRole("status").first()).toContainText("草稿已保存到云端");await page.reload();dialog=page.getByRole("dialog",{name:"记录已投岗位",exact:true});await expect(dialog.getByRole("combobox",{name:"公司性质",exact:true})).toHaveValue("state_owned");
 await expect(dialog.getByText("查看公司性质来源",{exact:true})).toBeVisible();
 expect((await json(await request.get("/api/ai/jobs?type=company_metadata_verify"))).jobs).toHaveLength(1);
 await dialog.getByLabel("公司",{exact:true}).fill("另一家合成子公司");await expect(dialog.getByText("公司或链接已经变化，此任务不用于当前岗位，请重新核实。")).toBeVisible();await expect(dialog.getByRole("button",{name:"已核对主体与原文，加入分类建议",exact:true})).toHaveCount(0);
});

test("bare company-task links require the current owner and correct task type before saving any draft",async({request})=>{
 const task=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:"合成权限主体"}}}))).job;
 const draft={values:{company:"合成权限主体"},metadata:{companyVerificationJobId:task.id},extractionJobId:"",confirmedSavedJobId:null};
 expect((await request.post("/api/job-capture-drafts",{headers:{"oai-authenticated-user-id":"outsider"},data:draft})).status()).toBe(404);
 const own=(await json(await request.post("/api/job-capture-drafts",{data:draft}))).record;
 expect(own.data.metadata.companyVerificationJobId).toBe(task.id);
 const capture=(await json(await request.post("/api/job-captures",{data:{sourceUrl:"https://example.test/job",wait:false}}))).job;
 expect((await request.patch("/api/job-capture-drafts",{data:{id:own.id,version:own.version,data:{...draft,metadata:{companyVerificationJobId:capture.id}}}})).status()).toBe(404);
 expect((await json(await request.get(`/api/job-capture-drafts?id=${own.id}`))).record.version).toBe(own.version);
});

test("company provider timeout becomes a preserved failed attempt and manual retry recovers",async({request},info)=>{
 test.skip(info.project.name!=="desktop","Shared backend timeout is exercised once; both viewport flows are covered separately");test.setTimeout(150000);
 const job=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:"VERIFY_TIMEOUT-"+crypto.randomUUID()}}}))).job;
 const response=await request.post(`/api/ai/jobs/${job.id}/run`,{timeout:140000});expect(response.status()).toBe(504);
 let detail=await json(await request.get(`/api/ai/jobs/${job.id}`));expect(detail.job.status).toBe("failed");expect(detail.job.errorCode).toBe("AI_TIMEOUT");expect(detail.job.result).toBeNull();expect(detail.attempts).toHaveLength(1);
 const recovered=await json(await request.post(`/api/ai/jobs/${job.id}/retry`));expect(recovered.job.status).toBe("succeeded");expect(recovered.attempts).toHaveLength(2);expect(recovered.job.inputSnapshot.company).toBe(job.inputSnapshot.company);
 const truncated=(await json(await request.post("/api/ai/jobs",{data:{type:"company_metadata_verify",input:{company:"VERIFY_TRUNCATED"}}}))).job;
 expect((await request.post(`/api/ai/jobs/${truncated.id}/run`)).status()).toBe(502);detail=await json(await request.get(`/api/ai/jobs/${truncated.id}`));expect(detail.job.errorCode).toBe("OUTPUT_TRUNCATED");expect(detail.job.result).toBeNull();
});
