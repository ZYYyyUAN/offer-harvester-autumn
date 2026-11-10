import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const origin = process.argv[2] || "http://127.0.0.1:4175";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname) || !process.argv.includes("--real-ai")) throw new Error("Requires an isolated local Worker and --real-ai");
const owner = "metadata-real-synthetic-" + Date.now(), headers = { "oai-authenticated-user-id": owner, "oai-authenticated-user-email": "metadata-real@example.test" };
const report = { startedAt: new Date().toISOString(), samples: [], paidModels: [], passed: false };
async function api(path, init = {}) { const response = await fetch(origin + path, { ...init, headers: { ...headers, ...init.headers } }); const body = await response.json(); if (!response.ok) throw new Error(`${path}: ${response.status} ${body.code || body.error} ${JSON.stringify(body.issues || [])}`); return body; }
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 }, deviceScaleFactor: 1 });
  const cases = [
    { name: "explicit", text: "平台：BOSS直聘\n合成蓝桥科技有限公司\n岗位：Java 后端开发\n地点：杭州\n公司性质：民营企业\n行业：制造业\n岗位用工：直接招聘，与公司直接签约\n岗位职责：开发课程报名服务，维护接口与数据库。\n岗位要求：掌握 Java、Spring Boot、MySQL。\n本图片仅用于合成验收，所有信息均为虚构。", expected: { companyNature: "private", employmentType: "direct_hire" } },
    { name: "unknown", text: "Global Bank Java 合成有限公司\n岗位：Java 后端开发\n地点：杭州\n公司介绍：主营业务包括软件外包服务。\n我们是上市企业，提供金融软件开发服务。\n岗位职责：维护订单接口。要求掌握 Java 和 MySQL。\n未披露企业性质及本职位签约方式。\n本图片仅用于合成验收，所有信息均为虚构。", expected: { companyNature: "unknown", employmentType: "unknown" } },
  ];
  for (const fixture of cases.filter((fixture) => !process.argv.some((arg) => arg.startsWith("--case=")) || process.argv.includes("--case=" + fixture.name))) {
    await page.setContent('<html lang="zh-CN"><body style="font:28px/1.6 Microsoft YaHei,sans-serif;padding:30px;background:white;color:#111;white-space:pre-wrap"></body></html>');
    await page.locator("body").evaluate((node, text) => { node.textContent = text; }, fixture.text);
    const png = await page.screenshot({ fullPage: true });
    const uploaded = await api("/api/files?purpose=job_screenshot", { method: "POST", headers: { "content-type": "image/png", "x-file-name": fixture.name + ".png" }, body: png });
    const start = Date.now(), { job } = await api("/api/job-captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ screenshotFileId: uploaded.file.id }) });
    const suggested = await api("/api/job-metadata/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: job.result.company, sourceUrl: "", extractionJobId: job.id }) });
    const actual = { companyNature: suggested.metadata.companyNature, employmentType: suggested.metadata.employmentType };
    const pass = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value) && (fixture.name !== "explicit" || (suggested.metadata.companyTags.includes("manufacturing") && suggested.metadata.linkPlatform === "boss")) && suggested.metadata.companyTags.every((tag) => !["large", "mid"].includes(tag)) && (fixture.name !== "unknown" || suggested.metadata.companyTags.length === 0);
    report.samples.push({ name: fixture.name, expected: fixture.expected, actual, pass, model: job.model, promptVersion: job.promptVersion, elapsedMs: Date.now() - start, suggestions: suggested.metadata.suggestions, rawClues: job.result.classificationClues, sourceValidated: suggested.metadata.suggestions.every((s) => job.result.ocrText.includes(s.evidence.quote)) });
    report.paidModels.push(job.model, "qwen3.8-flash"); console.log(JSON.stringify({ sample: fixture.name, pass, actual }));
    if (!pass) throw new Error("Real synthetic classification gate failed: " + fixture.name);
  }
  report.passed = true;
} catch (error) {
  report.error = error.message; throw error;
} finally {
  report.finishedAt = new Date().toISOString(); report.paidModels = [...new Set(report.paidModels)];
  writeFileSync("reports/job-metadata-real-smoke.json", JSON.stringify(report, null, 2) + "\n");
  await browser.close(); await api("/api/profile?confirm=DELETE", { method: "DELETE" });
}
