import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function clearAccount(request: any) {
  const response = await request.delete("/api/profile?confirm=DELETE");
  expect(response.ok()).toBeTruthy();
}

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => clearAccount(request));

test("资料、投递并发、回收站与备份 v3", async ({ request }) => {
  const profile = await request.patch("/api/profile", { data: { version: 0, name: "测试同学", email: "e2e@example.com", targetRoles: "Java 后端", targetCities: "杭州" } });
  expect(profile.ok()).toBeTruthy();
  const created = await request.post("/api/records", { data: { kind: "applications", data: { company: "合成科技", role: "Java 后端", stage: "待投递", checklist: {} } } });
  expect(created.status()).toBe(201);
  const record = (await created.json()).record;
  const updated = await request.patch("/api/records", { data: { id: record.id, version: record.version, data: { notes: "第一次修改" } } });
  expect(updated.ok()).toBeTruthy();
  const conflict = await request.patch("/api/records", { data: { id: record.id, version: record.version, data: { notes: "过期页面修改" } } });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).currentVersion).toBe(2);
  const deleted = await request.delete(`/api/records?id=${record.id}&version=2`);
  expect(deleted.ok()).toBeTruthy();
  const trash = await request.get("/api/trash");
  const trashed = (await trash.json()).items.find((item: any) => item.id === record.id);
  expect(trashed.daysRemaining).toBeGreaterThan(0);
  const restored = await request.post("/api/trash", { data: { items: [{ type: "record", id: record.id, version: 3 }] } });
  expect(restored.ok()).toBeTruthy();
  const backup = await request.get("/api/data/export?format=json");
  expect(backup.ok()).toBeTruthy();
  const payload = await backup.json();
  expect(payload.schemaVersion).toBe(4);
  expect(payload.records.some((item: any) => item.id === record.id)).toBeTruthy();
  expect(Array.isArray(payload.aiJobs)).toBeTruthy();
  const legacy={...payload,schemaVersion:3,records:payload.records.map((item:any)=>item.id===record.id?{...item,data:{...item.data,notes:"v3 备份恢复"}}:item)};
  const preview=await request.post("/api/data/imports",{data:{filename:"legacy-v3.json",content:JSON.stringify(legacy)}});expect(preview.ok()).toBe(true);
  const importId=(await preview.json()).importId;expect((await request.post("/api/data/imports/"+importId+"/commit",{data:{decisions:{[record.id]:"backup"}}})).ok()).toBe(true);
  expect((await (await request.get("/api/records?kind=applications")).json()).records.find((item:any)=>item.id===record.id).data.notes).toBe("v3 备份恢复");
});

test("附件版本冲突、回收站恢复与哈希归档", async ({ request }) => {
  const pdf = Buffer.from("%PDF-1.4\nsynthetic e2e resume\n%%EOF");
  const uploaded = await request.post("/api/files?purpose=resume&displayName=合成简历", {
    headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent("synthetic-resume.pdf") },
    data: pdf,
  });
  expect(uploaded.status()).toBe(201);
  const file = (await uploaded.json()).file;
  expect(file.version).toBe(1);

  const renamed = await request.patch("/api/files", { data: { id: file.id, version: 1, metadata: { displayName: "合成简历 v2" } } });
  expect(renamed.ok()).toBeTruthy();
  const stale = await request.patch("/api/files", { data: { id: file.id, version: 1, metadata: { displayName: "过期修改" } } });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).currentVersion).toBe(2);

  const deleted = await request.delete(`/api/files?id=${file.id}&version=2`);
  expect(deleted.ok()).toBeTruthy();
  const trash = await request.get("/api/trash");
  const trashed = (await trash.json()).items.find((item: any) => item.type === "file" && item.id === file.id);
  expect(trashed.version).toBe(3);
  const restored = await request.post("/api/trash", { data: { items: [{ type: "file", id: file.id, version: 3 }] } });
  expect(restored.ok()).toBeTruthy();

  const content = await request.get(`/api/files/content?id=${file.id}`);
  expect(content.ok()).toBeTruthy();
  expect(Buffer.from(await content.body()).equals(pdf)).toBeTruthy();
  const index = await request.get("/api/data/files/archive/index");
  const archiveIndex = await index.json();
  const entry = archiveIndex.files.find((item: any) => item.id === file.id);
  expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(entry.archivePath).toContain(file.id);
  const archive = await request.get(`/api/data/files/archive?part=${entry.part}`);
  expect(archive.ok()).toBeTruthy();
  expect(archive.headers()["content-type"]).toContain("application/x-tar");
  expect((await archive.body()).byteLength).toBeGreaterThan(pdf.byteLength);
});

test("桌面和移动端导航、弹窗、按钮名称与横向溢出", async ({ page, request }, testInfo) => {
  await request.post("/api/records", { data: { kind: "applications", data: { company: "合成科技", role: "Java 后端", stage: "待投递", checklist: {} } } });
  await page.goto("/?view=today");
  await expect(page.getByRole("heading", { name: "今天只处理最重要的下一步" })).toBeVisible();
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /打开导航|菜单/ }).click();
  await page.getByRole("button", { name: "投递看板" }).click();
  await expect(page).toHaveURL(/view=applications/);
  await page.getByRole("button", { name: /新增投递/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("公司", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const unnamedButtons = await page.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title"))).length);
  expect(unnamedButtons).toBe(0);
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});

test("核心页面没有 serious 或 critical axe 违规", async ({ page }) => {
  await page.goto("/?view=profile");
  await expect(page.getByRole("heading", { name: "你的求职底稿" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
});
