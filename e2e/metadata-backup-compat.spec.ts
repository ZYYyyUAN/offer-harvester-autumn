import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/job-metadata-v5.json", import.meta.url), "utf8"));

test("v5 metadata backup preserves classification, drafts and historical revisions through a compatible reader", async ({ request }) => {
  expect((await request.delete("/api/profile?confirm=DELETE")).ok()).toBe(true);
  const previewResponse = await request.post("/api/data/imports", { data: { filename: "synthetic-metadata-v5.json", content: JSON.stringify(fixture) } });
  expect(previewResponse.ok(), await previewResponse.text()).toBe(true);
  const preview = await previewResponse.json();
  const committed = await request.post(`/api/data/imports/${preview.importId}/commit`, { data: {} });
  expect(committed.ok(), await committed.text()).toBe(true);
  const exported = await (await request.get("/api/data/export?format=json")).json();
  expect(exported.schemaVersion).toBe(5);
  const byId = new Map<string, any>(exported.records.map((r: any) => [r.id, r]));
  expect(byId.size).toBe(fixture.records.length);
  for (const record of fixture.records) {
    expect(byId.get(record.id)?.kind, record.id).toBe(record.kind);
    expect(byId.get(record.id)?.data, record.kind).toEqual(record.data);
  }
  const submission = exported.records.find((r: any) => r.kind === "job_submissions");
  expect(submission.data.metadataSnapshot.submissionChannel).toBe("boss");
  expect(submission.data.metadataSnapshot.actualSubmission.channel).toBe("email");
  const outsider = await (await request.get("/api/data/export?format=json", { headers: { "oai-authenticated-user-id": "metadata-fixture-outsider" } })).json();
  expect(outsider.records.some((r: any) => byId.has(r.id))).toBe(false);
});
