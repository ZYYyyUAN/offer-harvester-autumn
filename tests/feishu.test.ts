import test from "node:test";
import assert from "node:assert/strict";
import { applicationToFeishuFields, feishuFieldsToApplication, isRemoteImportable } from "../lib/feishu-contracts.ts";
import { buildSyncPreview } from "../lib/feishu-sync.ts";

test("飞书字段转换对日期、复选框和稳定 ID 使用确定性规则", () => {
  const fields = applicationToFeishuFields({ id: "app-1", version: 3, updatedAt: "2026-09-19T00:00:00Z", data: { company: "示例公司", role: "产品经理", stage: "面试中", deadline: "2026-10-01", checklist: { submitted: { done: true }, analyzed: false } } });
  assert.equal(fields["OFFER 收割机记录 ID"], "app-1");
  assert.equal(fields["完成投递"], true);
  assert.equal(fields["岗位分析"], false);
  const restored = feishuFieldsToApplication(fields);
  assert.equal(restored.company, "示例公司");
  assert.equal((restored.checklist as Record<string, boolean>).submitted, true);
});

test("飞书新增记录缺少公司或岗位时禁止导入", () => {
  assert.equal(isRemoteImportable({ company: "示例公司", role: "" }), false);
  assert.equal(isRemoteImportable({ company: "示例公司", role: "开发工程师" }), true);
});

test("首次双向内容不同会生成冲突且默认保留本地", async () => {
  const preview = await buildSyncPreview(
    [{ id: "app-1", version: 1, updatedAt: "2026-09-19", data: { company: "A", role: "开发", location: "上海" } }],
    [{ recordId: "rec-1", fields: { "OFFER 收割机记录 ID": "app-1", "公司": "A", "岗位": "开发", "地点": "北京" } }],
    [],
  );
  assert.equal(preview[0].type, "conflict");
  assert.equal(preview[0].defaultDecision, "local");
});

test("单侧删除只产生提示且不自动删除另一侧", async () => {
  const preview = await buildSyncPreview(
    [{ id: "app-1", version: 2, updatedAt: "2026-09-19", data: { company: "A", role: "开发" } }],
    [],
    [{ id: "map-1", localId: "app-1", remoteId: "rec-1", localHash: "old", remoteHash: "old" }],
  );
  assert.equal(preview[0].type, "deletion_warning");
  assert.equal(preview[0].defaultDecision, "skip");
});
