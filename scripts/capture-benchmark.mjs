import { readFileSync, writeFileSync, existsSync } from "node:fs";
const origin = process.argv[2] || "http://127.0.0.1:4175", variant = process.argv[3] || "baseline";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname) || !process.argv.includes("--real-ai")) throw new Error("Isolated local Worker and explicit --real-ai required");
const owner = "capture-benchmark-" + Date.now(), headers = { "content-type": "application/json", "oai-authenticated-user-id": owner, "oai-authenticated-user-email": "synthetic-benchmark@example.test" };
const fixtures = [
  { name: "public_feishu", url: "https://hf7l9aiqzx.jobs.feishu.cn/704852/position/7670073263825799451/detail", company: "北京趣拿软件科技有限公司", role: "AI应用开发工程师（Java开发）", location: "北京", terms: ["MCP", "Java"] },
  { name: "public_greenhouse", url: "https://job-boards.greenhouse.io/cloudflare/jobs/8158920", company: "Cloudflare", role: "Software Engineer", terms: [] },
];
const path = "reports/capture-performance.json", report = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { runs: [], note: "Public job pages and isolated synthetic owners only. Small samples describe this run, not all sites." };
const run = { variant, startedAt: new Date().toISOString(), samples: [], cleaned: false };
async function api(path, method = "GET", data) { const response = await fetch(origin + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(path + " HTTP " + response.status + " " + JSON.stringify(result)); return result; }
try {
  for (const fixture of fixtures) for (let iteration = 0; iteration < 3; iteration++) {
    const start = performance.now();
    try {
      let result = await api("/api/job-captures", "POST", { sourceUrl: fixture.url, ...(variant !== "baseline" ? { wait: false, refresh: true, readStrategy: ["max", "flash"].includes(variant) ? "model" : "auto", executionProfile: variant === "flash" ? "capture-flash-v1" : "capture-max-v1" } : {}) });
      const firstFeedbackMs = performance.now() - start;
      if (result.job.status === "queued") result = await api(`/api/ai/jobs/${result.job.id}/run`, "POST");
      const elapsedMs = performance.now() - start, output = result.job.result || {};
      const audit = await api(`/api/ai/jobs/${result.job.id}`);
      const basicFieldChecksPassed = result.job.status === "succeeded" && output.company.includes(fixture.company) && output.role.includes(fixture.role) && (!fixture.location || output.location.includes(fixture.location)) && output.jd?.length > 80 && fixture.terms.every((word) => output.jd.includes(word));
      run.samples.push({ fixture: fixture.name, url: fixture.url, iteration, elapsedMs, firstFeedbackMs, basicFieldChecksPassed, model: result.job.model, promptVersion: result.job.promptVersion, captureMethod: output.captureMethod, company: output.company, role: output.role, jdLength: output.jd?.length, sourceCount: output.sources?.length || 0, attempts: audit.attempts.map((a) => ({ model: a.model, tokenUsage: a.tokenUsage, telemetry: a.telemetry, status: a.status })) });
      console.log(JSON.stringify({ variant, fixture: fixture.name, iteration, basicFieldChecksPassed, elapsedMs: Math.round(elapsedMs) }));
    } catch (error) { run.samples.push({ fixture: fixture.name, iteration, basicFieldChecksPassed: false, error: error.message, elapsedMs: performance.now() - start }); console.log(JSON.stringify({ variant, fixture: fixture.name, iteration, error: error.message })); }
  }
} finally {
  await api("/api/profile?confirm=DELETE", "DELETE"); run.cleaned = true; run.finishedAt = new Date().toISOString(); report.runs.push(run); writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
}
