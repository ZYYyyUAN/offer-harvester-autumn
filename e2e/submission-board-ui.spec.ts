import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const json = async (response: APIResponse) => { const body = await response.text(); expect(response.ok(), body).toBe(true); return JSON.parse(body); };
test.beforeEach(async ({ request }) => { await json(await request.delete("/api/profile?confirm=DELETE")); });
test("board columns explain cross-page counts and open all records of an unloaded stage",async({page,request})=>{
 const records=Array.from({length:25},(_,i)=>({id:crypto.randomUUID(),kind:"applications",title:"合成跨页岗位"+i,version:1,createdAt:"2026-11-01T00:00:00.000Z",updatedAt:i<20?"2026-11-10T00:00:00.000Z":"2026-11-01T00:00:00.000Z",data:{company:"合成跨页公司"+i,role:"Java",stage:i<20?"已投递":"面试中"}}));
 const preview=await json(await request.post("/api/data/imports",{data:{filename:"synthetic-column-pages.json",content:JSON.stringify({schemaVersion:6,records,files:[],aiJobs:[],aiJobAttempts:[]})}}));await json(await request.post(`/api/data/imports/${preview.importId}/commit`,{data:{}}));
 await page.goto("/?view=applications");await expect(page.getByText("本页 0 条 · 此阶段共 5 条",{exact:true})).toBeVisible();await page.getByRole("button",{name:"查看面试中全部记录",exact:true}).click();await expect(page.locator(".submission-card")).toHaveCount(5);await expect(page.getByRole("combobox",{name:"投递阶段筛选"})).toHaveValue("面试中");
 await page.reload();await expect(page.locator(".submission-card")).toHaveCount(5);
});
async function fixedSamples(request: APIRequestContext) {
  const stages = ["已投递", "已投递", "已投递", "已投递", "笔试中", "笔试中", "面试中", "面试中", "OFFER", "已结束", "已结束"];
  const apps: any[] = [];
  for (const [index, stage] of stages.entries()) {
    let r = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company: `合成闭环公司${index}`, role: "Java 后端", stage: "已投递", nextFollowUpAt: index === 0 ? "2020-01-01" : "" } } }))).record;
    if (index === 9) { await json(await request.post("/api/applications/stage", { data: { id: r.id, version: r.version, stage: "OFFER" } })); r = (await json(await request.get(`/api/applications/${r.id}`))).record; }
    if (stage !== "已投递") await json(await request.post("/api/applications/stage", { data: { id: r.id, version: r.version, stage } }));
    apps.push(r);
  }
  const legacy = { id: crypto.randomUUID(), kind: "applications", title: "合成未知阶段", data: { company: "合成未知公司", role: "后端", stage: "准备简历" } };
  const preview = await json(await request.post("/api/data/imports", { data: { filename: "synthetic-legacy.json", content: JSON.stringify({ schemaVersion: 6, records: [legacy], files: [], aiJobs: [], aiJobAttempts: [] }) } }));
  await json(await request.post(`/api/data/imports/${preview.importId}/commit`, { data: {} }));
  for (let n = 0; n < 2; n++) await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company: `合成未投${n}`, role: "Java" } } }));
  return { apps, legacy };
}
test("daily board and review share complete counts, unknown stages, URL state and reversible deletion", async ({ page, request }) => {
  const { legacy } = await fixedSamples(request);
  const dashboard = (await json(await request.get("/api/dashboard"))).dashboard;
  expect(dashboard.workspaceSummary).toMatchObject({ totalRecords: 12, totalSubmitted: 11, interviewing: 2, offersObtained: 2, followUpDue: 1 });
  await page.goto("/?view=applications");
  await expect(page.getByRole("status").filter({ hasText: "全部记录 12" })).toBeVisible();
  await expect(page.locator(".sidebar nav button").filter({ hasText: "投递看板" }).locator("em")).toHaveText("12");
  await expect(page.locator(".submission-metrics article")).toHaveCount(4);
  await expect(page.locator(".submission-board>section").filter({has:page.locator("header>b",{hasText:"准备中"})})).toHaveCount(0);
  await expect(page.getByText("空阶段与拖动目标（1）",{exact:true})).toBeVisible();
  await page.screenshot({path:`reports/submission-board-${test.info().project.name}.png`,fullPage:false});
  for (const [label, value] of [["累计投递", "11"], ["面试中", "2"], ["待跟进", "1"], ["已获 OFFER", "2"]]) await expect(page.locator(".submission-metrics article").filter({ hasText: label }).locator("strong")).toHaveText(value);
  await expect(page.getByRole("heading", { name: "机会结束分析" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "投递阶段筛选", exact: true }).selectOption("unknown");
  await expect(page.locator(".submission-card")).toHaveCount(1);
  await expect(page.locator(".submission-card")).toContainText("待核对（准备简历）");
  await page.getByRole("button", { name: "列表视图", exact: true }).click(); await page.reload();
  await expect(page.getByRole("combobox", { name: "投递阶段筛选" })).toHaveValue("unknown");
  await expect(page.locator(".submission-list .submission-card")).toHaveCount(1);
  await page.getByRole("button", { name: "投递复盘", exact: true }).click();
  await expect(page.getByRole("heading", { name: "机会结束分析" })).toBeVisible(); await expect(page).toHaveURL(/tab=review/);
  await page.goBack(); await expect(page.locator(".submission-list .submission-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("待核对（准备简历）"); await page.reload();
  await expect(page.getByRole("dialog")).toContainText("合成未知公司");
  const close = page.getByRole("dialog").getByRole("button", { name: "Close", exact: true });
  await close.click();
  await page.locator(".submission-card summary").click(); await page.getByRole("button", { name: "移入回收站", exact: true }).click();
  const confirmation = page.getByRole("dialog"); await expect(confirmation).toContainText("记录将在回收站保留30天"); await confirmation.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "全部记录 11" })).toBeVisible();
  const trashed = (await json(await request.get("/api/trash"))).items.find((r: any) => r.id === legacy.id); expect(trashed).toBeTruthy();
  await json(await request.post("/api/trash", { data: { items: [{ type: "record", id: legacy.id, version: trashed.version }] } })); await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "全部记录 12" })).toBeVisible();
  await expect(page.locator(".submission-card")).toContainText("待核对（准备简历）");
  const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze(); expect(axe.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
});
test("bookmarked details outside the first 500 remain editable and owned", async ({ page, request }) => {
  const records = Array.from({ length: 501 }, (_, i) => ({ id: crypto.randomUUID(), kind: "applications", title: `合成分页${i}`, data: { company: `合成分页公司${String(i).padStart(3, "0")}`, role: "Java", stage: i === 500 ? "准备简历" : "已投递" } }));
  const preview = await json(await request.post("/api/data/imports", { data: { content: JSON.stringify({ schemaVersion: 6, records, files: [], aiJobs: [], aiJobAttempts: [] }) } })); await json(await request.post(`/api/data/imports/${preview.importId}/commit`, { data: {} }));
  const id = records[500].id;
  expect((await request.get(`/api/applications/${id}`, { headers: { "oai-authenticated-user-id": "outsider" } })).status()).toBe(404);
  await page.goto(`/?view=applications&stage=已投递&applicationId=${id}`);
  await expect(page.getByRole("dialog")).toContainText("合成分页公司500"); await page.getByRole("button", { name: "编辑完整信息", exact: true }).click();
  const editor = page.getByRole("dialog").filter({ hasText: "编辑投递" }); await expect(editor).toBeVisible();
  await editor.getByLabel("备注", { exact: true }).fill("手动核对，不改阶段"); await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => (await json(await request.get(`/api/applications/${id}`))).record.data.notes).toBe("手动核对，不改阶段");
  expect((await json(await request.get(`/api/applications/${id}`))).record.data.stage).toBe("准备简历");
  await page.goto("/?view=applications&mode=list&sort=company&page=26"); await expect(page.locator(".submission-card")).toHaveCount(1); await expect(page.getByRole("navigation", { name: "投递记录分页" })).toContainText("第 26 / 26 页");
});

test("actual date can be backfilled or cleared without rewriting the submission snapshot",async({page,request})=>{
 const app=(await json(await request.post("/api/records",{data:{kind:"applications",data:{company:"合成日期核对",role:"Java",stage:"已投递",appliedAt:null,appliedAtStatus:"unknown"}}}))).record;
 const before=await json(await request.get("/api/data/export?format=json"));const snapshot=before.records.find((r:any)=>r.kind==="jd_snapshots");
 await page.goto(`/?view=applications&applicationId=${app.id}`);await page.getByRole("button",{name:"编辑完整信息",exact:true}).click();let editor=page.getByRole("dialog",{name:"编辑投递",exact:true});
 await editor.getByLabel("实际投递时间（可未知）",{exact:true}).fill("2026-10-01T10:30");await editor.getByRole("button",{name:"保存",exact:true}).click();await expect(editor).toBeHidden();
 await expect.poll(async()=>(await json(await request.get(`/api/applications/${app.id}`))).record.data.appliedAtStatus).toBe("known");
 await expect(page.getByRole("button",{name:"编辑完整信息",exact:true})).toBeVisible();await page.getByRole("button",{name:"编辑完整信息",exact:true}).click();editor=page.getByRole("dialog",{name:"编辑投递",exact:true});
 await expect(editor.getByLabel("实际投递时间（可未知）",{exact:true})).toHaveValue("2026-10-01T10:30");await editor.getByLabel("实际投递时间（可未知）",{exact:true}).fill("");await editor.getByRole("button",{name:"保存",exact:true}).click();await expect(editor).toBeHidden();
 await expect.poll(async()=>(await json(await request.get(`/api/applications/${app.id}`))).record.data.appliedAtStatus).toBe("unknown");
 const after=await json(await request.get("/api/data/export?format=json"));expect(after.records.find((r:any)=>r.id===snapshot.id).data).toEqual(snapshot.data);expect(after.records.filter((r:any)=>r.data.action==="submission_date_corrected")).toHaveLength(2);expect((await json(await request.get("/api/applications/workspace"))).summary.totalSubmitted).toBe(1);
});

test("an unknown legacy stage is only submitted after the user confirms the actual action",async({page,request})=>{
 const record={id:crypto.randomUUID(),kind:"applications",title:"合成未知提交",data:{company:"合成未知提交",role:"Java",stage:"准备简历"}};
 const preview=await json(await request.post("/api/data/imports",{data:{content:JSON.stringify({schemaVersion:6,records:[record],files:[],aiJobs:[],aiJobAttempts:[]})}}));await json(await request.post(`/api/data/imports/${preview.importId}/commit`,{data:{}}));
 await page.goto("/?view=applications");await page.locator(".submission-card summary").click();await page.getByRole("combobox",{name:"调整合成未知提交的招聘阶段",exact:true}).selectOption("已投递");
 const confirmation=page.getByRole("dialog",{name:"确认完成投递",exact:true});await expect(confirmation).toBeVisible();expect((await json(await request.get("/api/data/export?format=json"))).records.filter((r:any)=>r.kind==="job_submissions")).toHaveLength(0);
 await confirmation.getByRole("combobox",{name:"本次实际提交渠道",exact:true}).selectOption("email");await confirmation.getByRole("button",{name:"确认已完成投递",exact:true}).click();
 await expect.poll(async()=>(await json(await request.get(`/api/applications/${record.id}`))).record.data.stage).toBe("已投递");
 const archive=(await json(await request.get("/api/data/export?format=json"))).records.filter((r:any)=>r.kind==="job_submissions");expect(archive).toHaveLength(1);expect(archive[0].data.metadataSnapshot.actualSubmission.channel).toBe("email");
});
