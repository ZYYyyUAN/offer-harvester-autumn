import { test, expect, type APIResponse } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const json=async(response:APIResponse)=>{const text=await response.text();expect(response.ok(),text).toBe(true);return JSON.parse(text);};
test.describe.configure({mode:"serial"});test.beforeEach(async({request})=>{await json(await request.delete("/api/profile?confirm=DELETE"));});
test("default file and actual channel are reviewed once, then saved directly as a submitted record",async({page,request})=>{
 const file=(await json(await request.post("/api/files?purpose=resume",{headers:{"content-type":"application/pdf","x-file-name":"synthetic-completed.pdf"},data:Buffer.from("%PDF-1.4\n% Synthetic completed resume\n%%EOF")}))).file;
 await page.goto("/?view=resumes");await page.getByRole("combobox",{name:"默认简历文件",exact:true}).selectOption(file.id);await page.getByRole("button",{name:"设为默认",exact:true}).click();await expect(page.getByText(/当前：synthetic-completed.pdf/)).toBeVisible();
 await page.goto("/?view=savedJobs");await page.getByRole("main").getByRole("button",{name:"记录已投岗位",exact:true}).click();const dialog=page.getByRole("dialog",{name:"记录已投岗位",exact:true});
 await expect(dialog.getByRole("combobox",{name:"实际投递简历",exact:true})).toHaveValue(file.id);
 await expect(dialog.getByText("最初发现来源",{exact:true})).toHaveCount(0);await expect(dialog.getByText("计划投递渠道",{exact:true})).toHaveCount(0);
 await dialog.getByLabel("公司",{exact:true}).fill("合成已投UI公司");await dialog.getByLabel("岗位",{exact:true}).fill("Java 后端");await dialog.getByLabel("完整 JD",{exact:true}).fill("掌握 Java 与 MySQL。");await dialog.getByRole("combobox",{name:"实际提交渠道",exact:true}).selectOption("email");
 const axe=await new AxeBuilder({page}).include('[role="dialog"]').withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();expect(axe.violations).toEqual([]);
 await dialog.getByRole("button",{name:"保存已投记录",exact:true}).click();await expect(dialog).toBeHidden();await expect(page).toHaveURL(/view=applications/);await expect(page.locator(".kanban article").filter({hasText:"合成已投UI公司"})).toBeVisible();
 const dump=await json(await request.get("/api/data/export?format=json"));const app=dump.records.find((r:any)=>r.kind==="applications");expect(app.data.stage).toBe("已投递");expect(app.data.appliedAt).toBeTruthy();expect(app.data.resumeId).toBe(file.id);expect(app.data.jobMetadata.actualSubmission.channel).toBe("email");expect(dump.records.find((r:any)=>r.kind==="jd_snapshots").data.resumeSha256).toBe(file.metadata.sha256);
});
test("saved-only is explicit and a fresh intake draft survives refresh without inventing a submission",async({page,request})=>{
 await page.goto("/?view=savedJobs");await page.getByRole("main").getByRole("button",{name:"记录已投岗位",exact:true}).click();let dialog=page.getByRole("dialog",{name:"记录已投岗位",exact:true});await dialog.getByRole("checkbox",{name:"仅收藏，暂未投递"}).check();await dialog.getByLabel("公司",{exact:true}).fill("合成仅收藏公司");await dialog.getByLabel("岗位",{exact:true}).fill("设计师");await expect(dialog.getByRole("status").first()).toContainText("草稿已保存到云端");await expect(page).toHaveURL(/captureDraft=/);
 await page.reload();dialog=page.getByRole("dialog",{name:"记录已投岗位",exact:true});await expect(dialog.getByRole("checkbox",{name:"仅收藏，暂未投递"})).toBeChecked();await expect(dialog.getByLabel("公司",{exact:true})).toHaveValue("合成仅收藏公司");await dialog.getByRole("button",{name:"保存未投收藏",exact:true}).click();await expect(dialog).toBeHidden();const dump=await json(await request.get("/api/data/export?format=json"));expect(dump.records.filter((r:any)=>r.kind==="applications")).toHaveLength(0);expect(dump.records.filter((r:any)=>r.kind==="saved_jobs")).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
