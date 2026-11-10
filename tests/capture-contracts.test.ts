import test from "node:test";
import assert from "node:assert/strict";
import { captureIdentity } from "../lib/capture-contracts.ts";
test("capture identity removes only known tracking parameters, retains path case and input profile", () => {
  const key = (sourceUrl: string, profile = "max") => captureIdentity({ sourceUrl }, profile);
  assert.equal(key("https://example.test/Job/1?utm_source=share#title"), key("https://example.test/Job/1"));
  assert.notEqual(key("https://example.test/Job/1"), key("https://example.test/job/1"));
  assert.notEqual(key("https://example.test/Job/1?spread=ref"), key("https://example.test/Job/1"));
  assert.notEqual(key("https://example.test/Job/1"), key("https://example.test/Job/1", "flash"));
  assert.notEqual(captureIdentity({ screenshotSha256: "a" }, "ocr"), captureIdentity({ screenshotSha256: "b" }, "ocr"));
});

import { validateCaptureAuditBackup } from "../lib/capture-backup.ts";
test("v6 audit backup validates new fields while v3-v5 missing telemetry remains readable", () => {
  const job = { id: "job", capture_key: "a".repeat(64), phase: "completed" };
  const attempt = { id: "attempt", job_id: "job", telemetry: JSON.stringify({ profile: "capture-max-v1", route: "model_url", phases: [], usage: { structured: null } }) };
  assert.doesNotThrow(() => validateCaptureAuditBackup([job], [attempt]));
  assert.doesNotThrow(() => validateCaptureAuditBackup([{ id: "job" }], [{ id: "attempt", job_id: "job" }]));
  assert.throws(() => validateCaptureAuditBackup([job, job], []));
  assert.throws(() => validateCaptureAuditBackup([], [attempt]));
  assert.throws(() => validateCaptureAuditBackup([job], [{ ...attempt, telemetry: '{"profile":"x"}' }]));
});
