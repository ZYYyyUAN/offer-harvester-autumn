import { test } from "node:test";
import assert from "node:assert/strict";
import { closureTransition } from "../lib/application-closure.ts";
const now = "2026-11-10T06:00:00.000Z", id = "00000000-0000-4000-8000-000000000001";
test("closing without evidence stays unknown; reopening retains an event and clears current closure", () => {
  const closed = closureTransition({ stage: "面试中" }, { stage: "已结束" }, now, id);
  assert.equal(closed.data.closure.outcome, "unknown"); assert.equal(closed.data.closure.stage, "unknown"); assert.equal(closed.data.closure.endedAt, null);
  assert.equal(closureTransition(closed.data, closed.data, now, id).event, null);
  const opened = closureTransition(closed.data, { ...closed.data, stage: "面试中" }, now, id);
  assert.equal(opened.event?.action, "application_reopened"); assert.equal(opened.data.closure, null);
});

import { closureStatistics } from "../lib/closure-statistics.ts";
test("server assigns closure identity and corrections retain the cycle", () => {
  const closed = closureTransition({ stage: "面试中" }, { stage: "已结束", closure: { cycleId: "00000000-0000-4000-8000-000000000002", outcome: "rejected", stage: "interview", confirmation: "confirmed", source: "user", recordedAt: now } }, now, id);
  assert.equal(closed.data.closure.cycleId, id);
  const corrected = closureTransition(closed.data, { ...closed.data, closure: { ...closed.data.closure, cycleId: "00000000-0000-4000-8000-000000000003", notes: "补充复盘" } }, now, "00000000-0000-4000-8000-000000000004");
  assert.equal(corrected.data.closure.cycleId, id);
  assert.equal(corrected.event?.action, "application_closure_corrected");
  assert.deepEqual(closureTransition(closed.data, { ...closed.data, closure: null }, now, id).data.closure, closed.data.closure);
});
test("closure statistics separate success, confirmed rejection, unknown dates and reopened opportunities", () => {
  const application = (id: string, outcome: string, endedAt: string | null, confirmation = "confirmed", stage = "已结束") => ({ id, data: { stage, closure: { outcome, endedAt, confirmation, stage: "interview" } } });
  const rows = [application("a", "rejected", "2026-11-09T17:00:00Z"), application("b", "joined", now), application("c", "withdrawn", null), application("d", "rejected", now, "needs_review"), application("e", "rejected", now, "confirmed", "面试中")];
  const stats = closureStatistics(rows, 5, "2026-11-10", "2026-11-10");
  assert.equal(stats.totalClosed, 4); assert.equal(stats.filteredCount, 3); assert.equal(stats.unknownDateCount, 1); assert.equal(stats.rejectedCount, 1);
  assert.equal(stats.stages[0].count, 1); assert.ok(stats.outcomes.every((item) => item.percentage === null));
  assert.equal(closureStatistics([...rows, rows[0]], 5).totalClosed, 4);
});
