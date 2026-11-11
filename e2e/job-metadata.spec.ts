import { test, expect, type APIResponse } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { zipSync, strToU8 } from "fflate";
import { decideMetadataSuggestion, JobMetadataSchema, manualMetadataEdit, metadataContext } from "../lib/job-metadata";
async function json(response: APIResponse) { const text = await response.text(); expect(response.ok(), text).toBeTruthy(); return JSON.parse(text); }
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => { await json(await request.delete("/api/profile?confirm=DELETE")); });

test("classification and channels survive conversion, submission, backfill, backup and trash", async ({ request }) => {
  const sourceUrl = "https://synthetic.jobs.feishu.cn/1/position/123/detail?spread=NOT_A_REFERRAL", company = "合成外资银行", context = metadataContext(company, sourceUrl), now = new Date().toISOString();
  let metadata = JobMetadataSchema.parse({});
  for (const [field, value] of [["companyNature", "foreign_invested"], ["companyTags", ["banking"]], ["employmentType", "direct_hire"], ["discoverySource", "xiaohongshu"]] as const) metadata = manualMetadataEdit(metadata, field, Array.isArray(value) ? [...value] : value as string, context, now);
  const suggestion = await json(await request.post("/api/job-metadata/suggest", { data: { company, sourceUrl, jobMetadata: metadata } }));
  expect(suggestion.metadata.submissionChannel).toBe("company_portal"); expect(suggestion.metadata.referralStatus).toBe("unknown");
  const saved = (await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company, role: "Java 开发", sourceUrl, jd: "必须掌握 Java。", jobMetadata: suggestion.metadata } } }))).record;
  const conversion = await Promise.all([1, 2].map(() => request.post(`/api/saved-jobs/${saved.id}/convert`, { data: { version: saved.version, idempotencyKey: saved.id } })));
  expect(conversion.filter((r) => r.ok()).length).toBeGreaterThanOrEqual(1);
  const apps = (await json(await request.get("/api/records?kind=applications"))).records; expect(apps).toHaveLength(1); const app = apps[0];
  expect(app.data.jobMetadata.companyNature).toBe("foreign_invested"); expect(app.data.savedJobId).toBe(saved.id);
  expect((await json(await request.get("/api/job-metadata/statistics"))).totalSubmitted).toBe(0);
  await json(await request.post("/api/applications/stage", { data: { id: app.id, version: app.version, stage: "已投递" } }));
  const history = await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`));
  expect(history.submissions[0].data.metadataSnapshot.actualSubmission).toBeNull();
  expect(history.submissions[0].data.metadataSnapshot.companyNature).toBe("foreign_invested");
  const current = (await json(await request.get("/api/records?kind=applications"))).records[0];
  const revised = { ...metadata, actualSubmission: { channel: "company_portal", customLabel: "", contextKey: context, confirmedAt: now } };
  await json(await request.post(`/api/applications/${app.id}/submission-metadata-revisions`, { data: { version: current.version, expectedRevision: 0, jobMetadata: revised, reason: "投递后核实实际为官网提交" } }));
  const stats = await json(await request.get("/api/job-metadata/statistics")); expect(stats.channel[0].key).toBe("company_portal"); expect(stats.discovery[0].key).toBe("xiaohongshu"); expect(stats.backfilledCount).toBe(1);
  const unchanged = await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`)); expect(unchanged.submissions[0].data.metadataSnapshot.actualSubmission).toBeNull();
  const backup = await json(await request.get("/api/data/export?format=json")); expect(backup.schemaVersion).toBe(7);
  await json(await request.delete("/api/profile?confirm=DELETE"));
  const preview = await json(await request.post("/api/data/imports", { data: { filename: "metadata-v5.json", content: JSON.stringify(backup) } }));
  await json(await request.post(`/api/data/imports/${preview.importId}/commit`, { data: {} }));
  expect((await json(await request.get("/api/job-metadata/statistics"))).channel[0].key).toBe("company_portal");
  const restored = (await json(await request.get("/api/records?kind=applications"))).records[0];
  await json(await request.delete(`/api/records?id=${restored.id}&version=${restored.version}`));
  const trash = await json(await request.get("/api/trash")); expect(trash.items.some((r: any) => r.kind === "submission_metadata_revisions")).toBeTruthy();
  expect((await request.get(`/api/applications/${app.id}/submission-metadata-revisions`, { headers: { "oai-authenticated-user-id": "other-owner" } })).status()).toBe(404);
});

test("capture draft restores actual channel choices, hides legacy controls and saves a submitted identity", async ({ page, request }, info) => {
  await page.goto("/?view=savedJobs"); await page.getByRole("main").getByRole("button", { name: "记录已投岗位", exact: true }).click();
  let dialog = page.getByRole("dialog",{name:"记录已投岗位",exact:true});
  await dialog.getByLabel("公司", { exact: true }).fill("合成研发主体"); await dialog.getByLabel("岗位", { exact: true }).fill("后端开发");
  await dialog.getByLabel("岗位链接", { exact: true }).fill("https://www.zhipin.com/job_detail/123.html");
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click();
  await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("boss");
  await dialog.getByLabel("实际提交渠道", { exact: true }).selectOption("email");
  await expect(dialog.getByRole("status").first()).toContainText("草稿已保存到云端");
  await page.reload(); dialog = page.getByRole("dialog",{name:"记录已投岗位",exact:true});
  await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("email");
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click();
  await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("email");
  await dialog.getByLabel("公司性质", { exact: true }).selectOption("private");
  await expect(dialog.getByText("最初发现来源",{exact:true})).toHaveCount(0); await expect(dialog.getByText("计划投递渠道",{exact:true})).toHaveCount(0);
  await page.screenshot({ path: `reports/metadata-${info.project.name}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "保存已投记录" }).click(); await expect(dialog).not.toBeVisible();
  const saved = (await json(await request.get("/api/records?kind=saved_jobs"))).records;
  expect(saved).toHaveLength(1); expect(saved[0].data.jobMetadata.actualSubmission.channel).toBe("email"); expect(saved[0].data.jobMetadata.discoverySource).toBe("unknown");
  const apps=(await json(await request.get("/api/records?kind=applications"))).records;expect(apps).toHaveLength(1);expect(apps[0].data.stage).toBe("已投递");expect(apps[0].data.savedJobId).toBe(saved[0].id);
  await expect(page).toHaveURL(/view=applications/); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("legacy migration preview is explicit, conflict-safe, and preserves raw values", async ({ request }) => {
  const created = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company: "历史主体", role: "后端", companyType: "soe_bank", channel: "内推＋网申" } } }))).record;
  const preview = await json(await request.post("/api/metadata-migrations/preview")); expect(preview.entries).toHaveLength(1); expect(preview.entries[0].suggestions).toHaveLength(0);
  await json(await request.post("/api/metadata-migrations/commit", { data: { id: preview.id, selectedIds: [created.id] } }));
  const current = (await json(await request.get("/api/records?kind=applications"))).records[0];
  expect(current.data.jobMetadata.companyNature).toBe("unknown"); expect(current.data.jobMetadata.legacy.channel).toBe("内推＋网申"); expect(current.data.companyType).toBe("soe_bank");
  expect((await json(await request.get("/api/job-metadata/statistics"))).totalSubmitted).toBe(0);
});
test("company profile identity, versioned corrections and removal preserve confirmed history", async ({ request }) => {
  const legalName = "合成品牌杭州法人有限公司", now = new Date().toISOString();
  const profile = (await json(await request.post("/api/company-profiles", { data: { legalName, registryId: "SYNTHETIC-ONLY-001", companyNature: "private", companyTags: ["banking"] } }))).record;
  const candidate = await json(await request.post("/api/job-metadata/suggest", { data: { company: legalName, sourceUrl: "" } }));
  expect(candidate.metadata.companyProfileId).toBeNull(); expect(candidate.metadata.companyProfileCandidate.id).toBe(profile.id); expect(candidate.metadata.companyNature).toBe("private");
  const mismatch = await request.post("/api/job-metadata/suggest", { data: { company: "合成品牌上海法人有限公司", sourceUrl: "", jobMetadata: JobMetadataSchema.parse({ companyProfileId: profile.id }) } }); expect(mismatch.status()).toBe(422);
  expect((await request.post("/api/job-metadata/suggest", { headers: { "oai-authenticated-user-id": "another-owner" }, data: { company: legalName, sourceUrl: "", jobMetadata: JobMetadataSchema.parse({ companyProfileId: profile.id }) } })).status()).toBe(404);
  let metadata = (await json(await request.post("/api/job-metadata/suggest", { data: { company: legalName, sourceUrl: "", jobMetadata: JobMetadataSchema.parse({ companyProfileId: profile.id }) } }))).metadata;
  for (let i = 0; i < metadata.suggestions.length; i++) metadata = decideMetadataSuggestion(metadata, i, true, metadataContext(legalName, ""), now);
  const app = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company: legalName, role: "后端", stage: "已投递", jobMetadata: metadata } } }))).record;
  const updated = (await json(await request.patch("/api/company-profiles", { data: { id: profile.id, version: profile.version, data: { legalName, registryId: "SYNTHETIC-ONLY-001", companyNature: "foreign_invested", companyTags: ["banking"] } } }))).record;
  const history = await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`)); expect(history.submissions[0].data.metadataSnapshot.companyNature).toBe("private");
  expect((await request.patch("/api/company-profiles", { data: { id: profile.id, version: profile.version, data: { legalName } } })).status()).toBe(409);
  await json(await request.delete(`/api/records?id=${profile.id}&version=${updated.version}`));
  const current = (await json(await request.get("/api/records?kind=applications"))).records[0];
  expect(current.data.jobMetadata.companyProfileId).toBeNull(); expect(current.data.jobMetadata.companyNature).toBe("private");
  await json(await request.patch("/api/records", { data: { id: app.id, version: current.version, data: { notes: "资料来源删除后仍可编辑自己的记录" } } }));
  const trash = await json(await request.get("/api/trash")); const trashed = trash.items.find((r: any) => r.id === profile.id);
  await json(await request.delete("/api/trash", { data: { items: [{ type: "record", id: profile.id, version: trashed.version }] } }));
  const backup = await json(await request.get("/api/data/export?format=json"));
  await json(await request.post("/api/data/imports", { data: { filename: "profile-deleted-v5.json", content: JSON.stringify(backup) } }));
});
test("all submission entrypoints accept one explicit actual-channel decision", async ({ request }) => {
  for (const mode of ["stage", "checklist", "task", "form", "final_resume"]) {
    const company = "合成投递入口-" + mode;
    const app = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company, role: "Java", stage: "待投递" } } }))).record;
    const contextKey = metadataContext(company, ""), now = new Date().toISOString();
    const jobMetadata = manualMetadataEdit(JobMetadataSchema.parse({ actualSubmission: { channel: "email", customLabel: "", confirmedAt: now, contextKey } }), "discoverySource", "xiaohongshu", contextKey, now);
    if (mode === "stage") await json(await request.post("/api/applications/stage", { data: { id: app.id, version: app.version, stage: "已投递", jobMetadata } }));
    if (mode === "checklist") await json(await request.post("/api/applications/checklist", { data: { id: app.id, version: app.version, key: "submitted", done: true, jobMetadata } }));
    if (mode === "form") await json(await request.patch("/api/records", { data: { id: app.id, version: app.version, data: { stage: "已投递", jobMetadata } } }));
    if (mode === "task") {
      const task = (await json(await request.post("/api/tasks", { data: { title: "完成真实投递", category: "application", applicationId: app.id, checklistKey: "submitted" } }))).task;
      await json(await request.patch("/api/tasks", { data: { id: task.id, version: task.version, data: { status: "done" }, jobMetadata, applicationVersion: app.version } }));
    }
    if (mode === "final_resume") {
      const bytes = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>合成 Java 简历</w:t></w:r></w:p></w:body></w:document>") });
      const file = (await json(await request.post("/api/files?purpose=resume", { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-file-name": "synthetic.docx" }, data: Buffer.from(bytes) }))).file;
      await json(await request.patch("/api/files", { data: { id: file.id, version: file.version, metadata: { libraryType: "optimization", applicationId: app.id } } }));
      await json(await request.post("/api/applications/finalize-resume", { data: { applicationId: app.id, applicationVersion: app.version, fileId: file.id, fileVersions: { [file.id]: file.version + 1 }, appliedAt: now, jobMetadata } }));
    }
    const history = await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`));
    expect(history.submissions).toHaveLength(1); expect(history.submissions[0].data.metadataSnapshot.actualSubmission.channel, mode).toBe("email"); expect(history.submissions[0].data.metadataSnapshot.discoverySource, mode).toBe("xiaohongshu");
  }
});
test("removing a converted bookmark preserves the application's frozen metadata and JD", async ({ request }) => {
  const company = "合成来源删除", sourceUrl = "https://example.test/removed-source";
  const now = new Date().toISOString(), contextKey = metadataContext(company, sourceUrl);
  const jobMetadata = manualMetadataEdit(JobMetadataSchema.parse({ actualSubmission: { channel: "email", customLabel: "", contextKey, confirmedAt: now } }), "companyNature", "private", contextKey, now);
  const saved = (await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company, role: "Java", jd: "必须掌握 Java。", sourceUrl, jobMetadata } } }))).record;
  const app = (await json(await request.post(`/api/saved-jobs/${saved.id}/convert`, { data: { version: saved.version, idempotencyKey: saved.id } }))).record;
  await json(await request.post("/api/applications/stage", { data: { id: app.id, version: app.version, stage: "已投递", jobMetadata } }));
  const before = (await json(await request.get(`/api/jd/sources/${app.id}`))).snapshots[0];
  const currentSaved = (await json(await request.get("/api/records?kind=saved_jobs"))).records[0];
  await json(await request.delete(`/api/records?id=${saved.id}&version=${currentSaved.version}`));
  expect((await json(await request.get(`/api/jd/sources/${app.id}`))).snapshots).toHaveLength(1);
  const trash = await json(await request.get("/api/trash")), removed = trash.items.find((r: any) => r.id === saved.id);
  await json(await request.delete("/api/trash", { data: { items: [{ type: "record", id: saved.id, version: removed.version }] } }));
  const after = (await json(await request.get(`/api/jd/sources/${app.id}`))).snapshots[0]; expect(after.data.jdSha256).toBe(before.data.jdSha256); expect(after.data.jdText).toBe(before.data.jdText); expect(after.data.deletedSourceIds).toContain(saved.id);
  expect((await json(await request.get("/api/job-metadata/statistics"))).channel[0].key).toBe("email");
  const backup = await json(await request.get("/api/data/export?format=json")); await json(await request.post("/api/data/imports", { data: { filename: "removed-source-v5.json", content: JSON.stringify(backup) } }));
});
test("v4 reading and CSV metadata round trips validate references", async ({ request }) => {
  await json(await request.post("/api/records", { data: { kind: "applications", data: { company: "合成旧备份", role: "Java", stage: "已投递", companyType: "soe_bank", channel: "BOSS直聘" } } }));
  const backup = await json(await request.get("/api/data/export?format=json"));
  const old = { ...backup, schemaVersion: 4, records: backup.records.map((r: any) => r.kind === "job_submissions" ? { ...r, data: Object.fromEntries(Object.entries(r.data).filter(([key]) => !["metadataSnapshot", "metadataRecordedAt"].includes(key))) } : r) };
  await json(await request.delete("/api/profile?confirm=DELETE"));
  const preview = await json(await request.post("/api/data/imports", { data: { filename: "original-v4.json", content: JSON.stringify(old) } })); await json(await request.post(`/api/data/imports/${preview.importId}/commit`, { data: {} }));
  expect((await json(await request.get("/api/records?kind=applications"))).records[0].data.channel).toBe("BOSS直聘");
  expect((await json(await request.get("/api/job-metadata/statistics"))).channel[0].key).toBe("unknown");
  const profile = (await json(await request.post("/api/company-profiles", { data: { legalName: "合成 CSV 主体", companyNature: "private" } }))).record;
  await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company: "合成 CSV 主体", role: "Java", jobMetadata: JobMetadataSchema.parse({ companyProfileId: profile.id }) } } }));
  const csv = await (await request.get("/api/data/export?format=csv")).text(); await json(await request.delete("/api/profile?confirm=DELETE"));
  const csvPreview = await json(await request.post("/api/data/imports", { data: { filename: "records.csv", content: csv } })); await json(await request.post(`/api/data/imports/${csvPreview.importId}/commit`, { data: {} }));
  expect((await json(await request.get("/api/records?kind=saved_jobs"))).records[0].data.jobMetadata.companyProfileId).toBe(profile.id);
  const badCsv = 'id,kind,title,dataJson\n"' + crypto.randomUUID() + '",saved_jobs,broken,"' + JSON.stringify({ company: "无来源主体", role: "Java", jobMetadata: JobMetadataSchema.parse({ companyProfileId: "missing-owner-profile" }) }).replaceAll('"', '""') + '"';
  expect((await request.post("/api/data/imports", { data: { filename: "broken.csv", content: badCsv } })).status()).toBe(422);
});
test("submission checklist uses one confirmation and keeps planned and actual channels separate", async ({ page, request }) => {
  const app = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company: "合成渠道确认", role: "Java", stage: "待投递", jobMetadata: manualMetadataEdit(JobMetadataSchema.parse({}), "submissionChannel", "boss", metadataContext("合成渠道确认", ""), new Date().toISOString()) } } }))).record;
  await page.goto("/?view=applications"); await page.getByRole("button", { name: "查看详情", exact: true }).click();
  await page.getByLabel("完成正式投递", { exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "确认完成投递", exact: true });
  expect((await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`))).submissions).toHaveLength(0);
  await expect(confirm).toBeVisible(); await expect(confirm.getByLabel("计划投递渠道", { exact: true })).toHaveCount(0); await confirm.getByLabel("本次实际提交渠道", { exact: true }).selectOption("email");
  await confirm.getByRole("button", { name: "确认已完成投递", exact: true }).click(); await expect(confirm).not.toBeVisible();
  await expect.poll(async () => (await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`))).submissions.length).toBe(1);
  const history = await json(await request.get(`/api/applications/${app.id}/submission-metadata-revisions`)); expect(history.submissions[0].data.metadataSnapshot.actualSubmission.channel).toBe("email");
  expect(history.submissions[0].data.metadataSnapshot.submissionChannel).toBe("boss");
  await page.getByLabel("完成公司背调", { exact: true }).click();
  await expect.poll(async () => (await json(await request.get("/api/records?kind=applications"))).records[0].data.checklist.research?.done).toBe(true);
});

test("confirming a saved draft retains human fields and respects an intentionally removed screenshot", async ({ request }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  const file = (await json(await request.post("/api/files?purpose=job_screenshot", { headers: { "content-type": "image/png", "x-file-name": "draft.png" }, data: png }))).file;
  const company = "合成持久草稿", context = metadataContext(company, ""), now = new Date().toISOString();
  const metadata = manualMetadataEdit(JobMetadataSchema.parse({}), "discoverySource", "xiaohongshu", context, now);
  const draft = (await json(await request.post("/api/job-capture-drafts", { data: { values: { company, role: "用户修订的岗位", jd: "用户核对后的 JD", screenshotFileId: file.id, priority: "高", recruitmentMode: "固定截止" }, metadata } }))).record;
  const confirmed = await json(await request.post(`/api/job-capture-drafts/${draft.id}/confirm`, { data: { draftVersion: draft.version, screenshotFileId: "" } }));
  expect(confirmed.record.data).toMatchObject({ company, role: "用户修订的岗位", jd: "用户核对后的 JD", screenshotFileId: "", priority: "高", recruitmentMode: "固定截止" });
  expect(confirmed.record.data.jobMetadata.discoverySource).toBe("xiaohongshu");
  const repeated = await json(await request.post(`/api/job-capture-drafts/${draft.id}/confirm`, { data: { draftVersion: draft.version } }));
  expect(repeated.record.id).toBe(confirmed.record.id);
  expect((await json(await request.get("/api/records?kind=saved_jobs"))).records).toHaveLength(1);
});

test("saved job concurrent edits fail atomically and submission-only choices are validated", async ({ request }) => {
  const saved = (await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company: "合成并发", role: "Java" } } }))).record;
  const responses = await Promise.all(["A", "B"].map((notes) => request.patch("/api/records", { data: { id: saved.id, version: saved.version, data: { notes } } })));
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const current = (await json(await request.get("/api/records?kind=saved_jobs"))).records[0]; expect(current.version).toBe(saved.version + 1);
  expect((await request.patch("/api/records", { data: { id: saved.id, version: current.version, data: { jobMetadata: { actualSubmission: { channel: "friend", contextKey: metadataContext("合成并发", ""), confirmedAt: new Date().toISOString() } } } } })).status()).toBe(400);
  expect((await json(await request.get("/api/job-metadata/health"))).backupWriterVersion).toBe(7);
});
test("AI classification rejects invalid claims and preserves confirmed values after source removal", async ({ request }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  const file = (await json(await request.post("/api/files?purpose=job_screenshot", { headers: { "content-type": "image/png", "x-file-name": "synthetic.png" }, data: png }))).file;
  const job = (await json(await request.post("/api/job-captures", { data: { screenshotFileId: file.id } }))).job;
  const result = await json(await request.post("/api/job-metadata/suggest", { data: { company: job.result.company, sourceUrl: "", extractionJobId: job.id } }));
  expect(result.metadata.companyNature).toBe("private");
  const index = result.metadata.suggestions.findIndex((s: any) => s.field === "companyNature"), now = new Date().toISOString(), context = metadataContext(job.result.company, "");
  const rejected = decideMetadataSuggestion(result.metadata, index, false, context, now);
  await json(await request.post("/api/records", { data: { kind: "saved_jobs", data: { company: job.result.company, role: "拒绝建议", jobMetadata: rejected } } }));
  const accepted = decideMetadataSuggestion(result.metadata, index, true, context, now);
  const forged = { ...accepted, companyNature: "state_owned" };
  expect((await request.post("/api/records", { data: { kind: "applications", data: { company: job.result.company, role: "伪造分类", jobMetadata: forged } } })).status()).toBe(422);
  const app = (await json(await request.post("/api/records", { data: { kind: "applications", data: { company: job.result.company, role: "有效分类", jobMetadata: accepted } } }))).record;
  await json(await request.delete(`/api/files?id=${file.id}&version=${file.version}`));
  const trash = await json(await request.get("/api/trash")), removed = trash.items.find((r: any) => r.id === file.id);
  await json(await request.delete("/api/trash", { data: { items: [{ type: "file", id: file.id, version: removed.version }] } }));
  const current = (await json(await request.get("/api/records?kind=applications"))).records.find((r: any) => r.id === app.id);
  expect(current.data.jobMetadata.companyNature).toBe("private"); expect(current.data.jobMetadata.fieldStates.companyNature.evidence.sourceDeleted).toBe(true);
  await json(await request.patch("/api/records", { data: { id: app.id, version: current.version, data: { notes: "源文件删除后仍可维护记录" } } }));
});

test("rejected and cleared actual channel survives refresh and repeated identification", async ({ page, request }) => {
  await page.goto("/?view=savedJobs"); await page.getByRole("main").getByRole("button", { name: "记录已投岗位", exact: true }).click();
  let dialog = page.getByRole("dialog",{name:"记录已投岗位",exact:true});
  await dialog.getByLabel("公司", { exact: true }).fill("合成拒绝与清空"); await dialog.getByLabel("岗位", { exact: true }).fill("Java");
  await dialog.getByLabel("岗位链接", { exact: true }).fill("https://www.zhipin.com/job_detail/rejected.html");
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click(); await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("boss");
  await dialog.getByRole("button", {name:"不采用渠道建议",exact:true}).click();
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click(); await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("unknown");
  await dialog.getByLabel("实际提交渠道", { exact: true }).selectOption("email"); await dialog.getByLabel("实际提交渠道", { exact: true }).selectOption("unknown");
  await expect(dialog.getByRole("status").first()).toContainText("草稿已保存到云端"); await page.reload(); dialog = page.getByRole("dialog",{name:"记录已投岗位",exact:true});
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click(); await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("unknown");
  await dialog.getByRole("button", { name: "保存已投记录", exact: true }).click(); await expect(dialog).not.toBeVisible();
  const saved=(await json(await request.get("/api/records?kind=saved_jobs"))).records[0];expect(saved.data.jobMetadata.actualSubmission.channel).toBe("unknown");
});

test("late identification cannot overwrite a manual selection or the next company", async ({ page }) => {
  await page.route("**/api/job-metadata/suggest", async (route) => { const response = await route.fetch(); await new Promise((resolve) => setTimeout(resolve, 450)); await route.fulfill({ response }); });
  await page.goto("/?view=savedJobs"); await page.getByRole("main").getByRole("button", { name: "记录已投岗位", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("公司", { exact: true }).fill("合成等待中的旧主体"); await dialog.getByLabel("岗位", { exact: true }).fill("Java");
  await dialog.getByLabel("岗位链接", { exact: true }).fill("https://www.zhipin.com/job_detail/slow.html");
  await dialog.getByLabel("公司性质",{exact:true}).selectOption("private");
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click();
  await dialog.getByLabel("实际提交渠道", { exact: true }).selectOption("email");
  await expect(dialog.getByRole("button", { name: "识别渠道与复用资料" })).toBeEnabled();
  await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("email");
  await dialog.getByRole("button", { name: "识别渠道与复用资料" }).click();
  await dialog.getByLabel("公司", { exact: true }).fill("合成更换后的新主体");
  await expect(dialog.getByRole("button", { name: "识别渠道与复用资料" })).toBeEnabled();
  await expect(dialog.getByLabel("公司", { exact: true })).toHaveValue("合成更换后的新主体");
  await expect(dialog.getByLabel("实际提交渠道", { exact: true })).toHaveValue("email");
  await expect(dialog.getByText("公司或链接已改变，请重新核对当前选择")).toBeVisible();
});
