import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMetadataSuggestions, decideMetadataSuggestion, explicitClassificationClue, freezeSubmissionMetadata, JobMetadataSchema, legacyMetadata, linkSuggestions, manualMetadataEdit, metadataContext } from "../lib/job-metadata.ts";

const now = "2026-11-09T04:00:00.000Z", company = "合成企业";
test("URL rules distinguish ATS, position details, posts, deceptive domains and unknown links", () => {
  for (const [url, expected] of [
    ["https://test.jobs.feishu.cn/704852/position/7670073263825799451/detail?spread=ZM7DCJ3", "company_portal"],
    ["https://www.zhipin.com/job_detail/abc.html", "boss"], ["https://www.zhipin.com/", ""],
    ["https://www.nowcoder.com/discuss/123", ""], ["https://www.xiaohongshu.com/explore/123", ""],
    ["https://social.example/zhipin.com/job_detail/12", ""], ["https://zhipin.com.evil.test/job_detail/12", ""],
    ["https://www.linkedin.com/jobs/view/123", "linkedin"], ["https://app.mokahr.com/apply/test/1", "company_portal"],
    ["https://unknown.example/jobs/1", ""], ["mailto:jobs@example.test", "email"],
  ]) {
    const suggestions = linkSuggestions(url, company, now);
    assert.equal(suggestions.find((s) => s.field === "submissionChannel")?.value || "", expected, url);
    assert.ok(suggestions.every((s) => !["discoverySource", "referralStatus", "companyNature"].includes(s.field)));
  }
});
test("suggestions never override manual values, intentional clearing or a rejected value", () => {
  const url = "https://www.zhipin.com/job_detail/abc.html", context = metadataContext(company, url), suggestions = linkSuggestions(url, company, now);
  let metadata = applyMetadataSuggestions(JobMetadataSchema.parse({}), suggestions, context);
  assert.equal(metadata.submissionChannel, "boss");
  metadata = manualMetadataEdit(metadata, "submissionChannel", "email", context, now);
  assert.equal(applyMetadataSuggestions(metadata, suggestions, context).submissionChannel, "email");
  metadata = manualMetadataEdit(metadata, "submissionChannel", "unknown", context, now);
  assert.equal(applyMetadataSuggestions(metadata, suggestions, context).submissionChannel, "unknown");
  metadata = applyMetadataSuggestions(JobMetadataSchema.parse({}), suggestions, context);
  metadata = decideMetadataSuggestion(metadata, 1, false, context, now);
  assert.equal(applyMetadataSuggestions(metadata, suggestions, context).submissionChannel, "unknown");
});
test("changed company or link invalidates automatic suggestions and flags retained manual choices", () => {
  const first = "https://www.zhipin.com/job_detail/abc.html", context = metadataContext(company, first);
  let metadata = applyMetadataSuggestions(JobMetadataSchema.parse({}), linkSuggestions(first, company, now), context);
  metadata = manualMetadataEdit(metadata, "companyNature", "private", context, now);
  const nextContext = metadataContext("另一主体", "https://unknown.example/1");
  metadata = applyMetadataSuggestions(metadata, [], nextContext);
  assert.equal(metadata.submissionChannel, "unknown"); assert.equal(metadata.companyNature, "private");
  assert.equal(metadata.fieldStates.companyNature?.status, "needs_review");
  assert.equal(freezeSubmissionMetadata(metadata, "另一主体", "https://unknown.example/1").companyNature, "unknown");
});
test("a planned channel is not a confirmed submission; discovery and referral remain independent", () => {
  const url = "https://test.jobs.feishu.cn/1/position/123/detail?spread=REFERRAL", context = metadataContext(company, url);
  let metadata = applyMetadataSuggestions(JobMetadataSchema.parse({}), linkSuggestions(url, company, now), context);
  assert.equal(freezeSubmissionMetadata(metadata, company, url).actualSubmission, null);
  metadata = manualMetadataEdit(metadata, "discoverySource", "xiaohongshu", context, now);
  metadata = decideMetadataSuggestion(metadata, 1, true, context, now);
  assert.equal(freezeSubmissionMetadata(metadata, company, url).actualSubmission, null);
  metadata.actualSubmission = { channel: "company_portal", customLabel: "", contextKey: context, confirmedAt: now };
  const frozen = freezeSubmissionMetadata(metadata, company, url);
  assert.equal(frozen.discoverySource, "xiaohongshu"); assert.equal(frozen.actualSubmission?.channel, "company_portal"); assert.equal(frozen.submissionChannel, "company_portal"); assert.equal(frozen.referralStatus, "unknown");
  metadata.submissionChannel = "email"; assert.equal(frozen.submissionChannel, "company_portal");
});
test("legacy classification generates review candidates without inventing nature or employment", () => {
  for (const type of ["large_tech", "mid_size", "startup", "soe_bank", "foreign", "outsourcing"]) {
    const { metadata, suggestions } = legacyMetadata({ companyType: type, channel: "内推＋网申" }, company, "", now);
    assert.equal(metadata.companyNature, "unknown"); assert.equal(metadata.employmentType, "unknown");
    assert.equal(metadata.legacy.companyType, type); assert.equal(metadata.legacy.channel, "内推＋网申");
    assert.ok(suggestions.every((s) => s.field === "companyTags"));
  }
  assert.equal(legacyMetadata({ channel: "BOSS直聘" }, company, "", now).suggestions[0].value, "boss");
});
test("explicit classification refuses company-name, listed-company and generic outsourcing inferences", () => {
  assert.equal(explicitClassificationClue({ field: "companyNature", value: "state_owned", quote: "合成银行" }, "合成银行"), false);
  assert.equal(explicitClassificationClue({ field: "companyNature", value: "foreign_invested", quote: "Our name is Global Java Ltd." }, "Global Java Ltd."), false);
  assert.equal(explicitClassificationClue({ field: "companyNature", value: "foreign_invested", quote: "公司性质：外资银行" }, company), true);
  assert.equal(explicitClassificationClue({ field: "companyTags", value: "large", quote: "我们是上市企业" }, company), false);
  assert.equal(explicitClassificationClue({ field: "employmentType", value: "outsourced", quote: "公司主营业务包括软件外包服务" }, company), false);
  assert.equal(explicitClassificationClue({ field: "employmentType", value: "direct_hire", quote: "本职位直接招聘，与公司直接签约" }, company), true);
  assert.equal(explicitClassificationClue({ field: "employmentType", value: "outsourced", quote: "本岗不是外包岗位，是直接招聘" }, company), false);
  assert.equal(explicitClassificationClue({ field: "employmentType", value: "direct_hire", quote: "本岗不是外包岗位，是直接招聘" }, company), true);
  assert.equal(explicitClassificationClue({ field: "companyNature", value: "state_owned", quote: "我们不是国有企业" }, company), false);
  assert.equal(explicitClassificationClue({ field: "companyTags", value: "internet", quote: "公司主营业务包括软件外包服务" }, company), false);
  assert.equal(explicitClassificationClue({ field: "companyTags", value: "manufacturing", quote: "行业：制造业" }, company), true);
  assert.equal(explicitClassificationClue({ field: "companyTags", value: "internet", quote: "我们不是互联网公司" }, company), false);
});

test("discovery and confirmed company data survive a new application link for the same company", () => {
  const oldUrl = "https://www.xiaohongshu.com/explore/123", newUrl = "https://test.jobs.feishu.cn/1/position/123/detail";
  let metadata = manualMetadataEdit(JobMetadataSchema.parse({}), "discoverySource", "xiaohongshu", metadataContext(company, oldUrl), now);
  metadata = manualMetadataEdit(metadata, "companyNature", "private", metadataContext(company, oldUrl), now);
  metadata = applyMetadataSuggestions(metadata, linkSuggestions(newUrl, company, now), metadataContext(company, newUrl));
  assert.equal(metadata.fieldStates.discoverySource?.status, "manual");
  assert.equal(metadata.fieldStates.companyNature?.status, "manual");
  assert.equal(freezeSubmissionMetadata(metadata, company, newUrl).discoverySource, "xiaohongshu");
  assert.equal(metadata.submissionChannel, "company_portal");
  metadata.actualSubmission = { channel: "email", customLabel: "", contextKey: metadataContext(company, newUrl), confirmedAt: now };
  const frozen = freezeSubmissionMetadata(metadata, company, newUrl);
  assert.equal(frozen.actualSubmission?.channel, "email");
  assert.equal(frozen.submissionChannel, "unknown");
});

test("server contract separates discovery choices from submission channels", () => {
  assert.equal(JobMetadataSchema.safeParse({ discoverySource: "xiaohongshu" }).success, true);
  assert.equal(JobMetadataSchema.safeParse({ submissionChannel: "xiaohongshu" }).success, false);
  assert.equal(JobMetadataSchema.safeParse({ actualSubmission: { channel: "friend", customLabel: "", contextKey: metadataContext(company, ""), confirmedAt: now } }).success, false);
  assert.equal(JobMetadataSchema.safeParse({ fieldStates: { companyNature: { status: "unset", contextKey: "invalid" } } }).success, false);
});

test("screenshot platform requires an explicit platform marker, not a mention or referral parameter", () => {
  assert.equal(explicitClassificationClue({ field: "linkPlatform", value: "boss", quote: "平台：BOSS直聘" }, company), true);
  assert.equal(explicitClassificationClue({ field: "linkPlatform", value: "boss", quote: "不要在 BOSS直聘 投递" }, company), false);
  assert.equal(explicitClassificationClue({ field: "linkPlatform", value: "boss", quote: "转载自 BOSS直聘" }, company), false);
  assert.equal(explicitClassificationClue({ field: "linkPlatform", value: "boss", quote: "平台：小红书" }, company), false);
  assert.deepEqual(linkSuggestions("https://www.zhipin.com:8443/job_detail/123", company, now), []);
});
