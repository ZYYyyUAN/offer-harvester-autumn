import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => { expect((await request.delete("/api/profile?confirm=DELETE")).ok()).toBe(true); });

test("正文不可访问会明确失败，手填信息保留并可继续保存", async ({ page, request }) => {
  const response = await request.post("/api/job-captures", { data: { sourceUrl: "https://example.test/restricted" } });
  expect(response.status()).toBe(422); expect((await response.json()).code).toBe("PAGE_CONTENT_UNAVAILABLE");
  const jobs = (await (await request.get("/api/ai/jobs?type=job_capture_url")).json()).jobs;
  expect(jobs[0].status).toBe("failed");
  await page.goto("/?view=savedJobs"); await page.getByRole("main").getByRole("button", { name: "收藏岗位", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("岗位链接", { exact: true }).fill("https://example.test/restricted");
  await dialog.getByLabel("公司", { exact: true }).fill("手动填写保留");
  await dialog.getByLabel("岗位", { exact: true }).fill("手动岗位名称");
  await dialog.getByRole("button", { name: "提取链接", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("未完成提取");
  await expect(dialog.getByLabel("公司", { exact: true })).toHaveValue("手动填写保留");
  await dialog.getByRole("button", { name: "粘贴 JD 正文" }).click();
  await expect(dialog.getByLabel("完整 JD", { exact: true })).toBeFocused();
  await dialog.getByLabel("完整 JD", { exact: true }).fill("用户从原岗位粘贴的职责与要求");
  await dialog.getByRole("button", { name: "核对并保存" }).click();
  await expect(dialog).not.toBeVisible();
  const saved = (await (await request.get("/api/records?kind=saved_jobs")).json()).records;
  expect(saved[0].data.company).toBe("手动填写保留");
  expect(saved[0].data.jd).toBe("用户从原岗位粘贴的职责与要求");
});

test("可访问链接仅生成待核对结果，用户确认才收藏", async ({ request }) => {
  const response = await request.post("/api/job-captures", { data: { sourceUrl: "https://example.test/position/1" } });
  expect(response.status()).toBe(201); const { job } = await response.json(); expect(job.result.company).toBe("合成链接科技");
  expect((await (await request.get("/api/records?kind=saved_jobs")).json()).records).toHaveLength(0);
  const confirmed = await request.post("/api/job-captures/" + job.id + "/confirm", { data: {} });
  expect(confirmed.status()).toBe(201); expect((await confirmed.json()).record.data.jd).toContain("Java");
});

test("模型字段格式错误属于可见的提取失败，不会变成已保存岗位", async ({ request }) => {
  const response = await request.post("/api/job-captures", { data: { sourceUrl: "https://example.test/malformed" } });
  expect(response.status()).toBe(502); expect((await response.json()).code).toBe("SCHEMA_INVALID");
  const jobs = (await (await request.get("/api/ai/jobs?type=job_capture_url")).json()).jobs;
  expect(jobs[0].status).toBe("failed"); expect(jobs[0].errorCode).toBe("SCHEMA_INVALID");
  expect((await (await request.get("/api/records?kind=saved_jobs")).json()).records).toHaveLength(0);
});

test("截图上传的文件 ID 能到达 OCR 并生成核对结果", async ({ request }) => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  const upload = await request.post("/api/files?purpose=job_screenshot", { headers: { "content-type": "image/png", "x-file-name": "synthetic.png" }, data: png });
  expect(upload.status()).toBe(201); const { file } = await upload.json();
  const response = await request.post("/api/job-captures", { data: { screenshotFileId: file.id } });
  expect(response.status()).toBe(201); const { job } = await response.json();
  expect(job.inputSnapshot.fileId).toBe(file.id); expect(job.result.screenshotFileId).toBe(file.id); expect(job.result.company).toBe("合成截图科技");
  const other = await request.post("/api/job-captures", { headers: { "oai-authenticated-user-id": "other-owner" }, data: { screenshotFileId: file.id } });
  expect(other.status()).toBe(404);
});
