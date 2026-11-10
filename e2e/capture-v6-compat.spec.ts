import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/job-metadata-v5.json", import.meta.url), "utf8"));
test("v6 backup preserves closure and capture telemetry through a compatible reader", async ({ request }) => {
  expect((await request.delete("/api/profile?confirm=DELETE")).ok()).toBe(true);
  const backup = structuredClone(fixture); backup.schemaVersion = 6;
  const application = backup.records.find((r: any) => r.kind === "applications");
  application.data.stage = "已结束"; application.data.closure = { cycleId: "00000000-0000-4000-8000-000000000099", outcome: "rejected", stage: "interview", round: "second", customRound: "", endedAt: "2026-11-10T02:00:00.000Z", reason: "合成拒信", notes: "", confirmation: "confirmed", source: "user", recordedAt: "2026-11-10T02:00:00.000Z" };
  backup.aiJobs = [{ id: "00000000-0000-4000-8000-000000000097", capture_key: "a".repeat(64), phase: "completed", batch_id: null, type: "job_capture_url", status: "succeeded", input_snapshot: '{"sourceUrl":"https://example.test/job"}', source_refs: "[]", model: "public-ats-parser", prompt_version: "public-ats-v2", result: '{"jd":"合成 Java 岗位"}', result_record_id: null, confidence: "high", elapsed_ms: 20, error_code: null, error_message: null, version: 3, created_at: "2026-11-10 02:00:00", started_at: "2026-11-10 02:00:00", finished_at: "2026-11-10 02:00:01", updated_at: "2026-11-10 02:00:01" }];
  backup.aiJobAttempts = [{ id: "00000000-0000-4000-8000-000000000098", job_id: backup.aiJobs[0].id, attempt_number: 1, model: "public-ats-parser", status: "succeeded", telemetry: JSON.stringify({ profile: "capture-max-v1", route: "public_greenhouse", phases: [{ phase: "reading_page", startedAt: "2026-11-10T02:00:00.000Z", finishedAt: "2026-11-10T02:00:00.020Z", elapsedMs: 20 }], usage: { structured: null } }), token_usage: "{}", response_summary: "合成公开岗位", error_code: null, error_message: null, started_at: "2026-11-10 02:00:00", finished_at: "2026-11-10 02:00:01" }];
  const preview = await request.post("/api/data/imports", { data: { filename: "synthetic-v6.json", content: JSON.stringify(backup) } }); expect(preview.ok(), await preview.text()).toBe(true);
  const id = (await preview.json()).importId;
  const commit = await request.post(`/api/data/imports/${id}/commit`, { data: {} }); expect(commit.ok(), await commit.text()).toBe(true);
  const restored = await (await request.get("/api/data/export?format=json")).json();
  expect(restored.schemaVersion).toBe(6); expect(restored.aiJobs).toEqual(backup.aiJobs); expect(restored.aiJobAttempts).toEqual(backup.aiJobAttempts);
  expect(restored.records.find((r: any) => r.id === application.id).data.closure).toEqual(application.data.closure);
  expect(restored.records.length).toBe(backup.records.length);
});
