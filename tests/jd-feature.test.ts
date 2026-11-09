import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSkill, textBlocks, locateCitations, validateExtraction, validateGap, skillStatistics, type ProfileSample } from "../lib/jd-contracts.ts";
import { jdEvaluationCases, evaluateJDCase } from "../lib/jd-evaluation-cases.ts";
const text = "必须掌握 Java。\r\n加分项：Redis。";
const raw = { complete: true, requirements: [
  { key: "r1", type: "technical_skill", rawName: "Java", proposedName: "Java", importance: "must", depth: "掌握", polarity: "required", condition: "", citations: [{ blockId: "p1", quote: "必须掌握 Java。" }], reviewReason: "" },
  { key: "r2", type: "technical_skill", rawName: "Redis", proposedName: "Redis", importance: "bonus", depth: "", polarity: "required", condition: "", citations: [{ blockId: "p2", quote: "加分项：Redis。" }], reviewReason: "" },
], groups: [], warnings: [] };
test("JD 引用定位保留 CRLF 和 UTF-16 位置", () => {
  const output = validateExtraction(raw, text, "e");
  for (const r of output.requirements) for (const c of r.citations) assert.equal(text.slice(c.start,c.end),c.quote);
  assert.equal(textBlocks(text)[1].start, text.indexOf("加分"));
  assert.throws(() => locateCitations("Java Java", [{blockId:"p1",quote:"Java"}]));
});
test("无效引用、不完整输出和伪造组成员不能进入统计", () => {
  assert.throws(() => validateExtraction({...raw,complete:false},text,"e"));
  assert.throws(() => validateExtraction(raw,"不同原文","e"));
  assert.throws(() => validateExtraction({...raw,groups:[{key:"g",operator:"any",memberKeys:["r1","fake"],citations:[{blockId:"p1",quote:"必须掌握 Java。"}]}]},text,"e"));
});
test("别名与父子关系不会混淆 Java 和 JavaScript", () => {
  assert.equal(canonicalSkill("K8s").skillId, canonicalSkill("Kubernetes").skillId);
  assert.notEqual(canonicalSkill("Java").skillId, canonicalSkill("JavaScript").skillId);
  assert.equal(canonicalSkill("RocketMQ").parentSkillId,"mq");
  assert.notEqual(canonicalSkill("RocketMQ").skillId,canonicalSkill("MQ").skillId);
});
function sample(id: string, source = id): ProfileSample {
  return {id,sourceEntryId:source,data:{jdText:text,company:id,role:"Java"},extractionId:"e",requirements:validateExtraction(raw,text,"e").requirements};
}
test("技能按独立岗位去重，五条以内不显示比例", () => {
  const s=sample("a"); s.requirements.push({...s.requirements[0],key:"r3"});
  const stats=skillStatistics([s,sample("revision","a"),sample("b")]);
  assert.equal(stats.total,2); assert.equal(stats.skills.find(s=>s.skillId==="java")?.count,2);
  assert.equal(stats.skills[0].ratio,null);
  assert.equal(skillStatistics([1,2,3,4,5].map(n=>sample(String(n)))).skills[0].ratio,1);
});
test("否定和替代要求不能记成独立必备技术", () => {
  const s=sample("a"); s.requirements[0].anyGroup=true; s.requirements[1].polarity="not_required";
  const stats=skillStatistics([s]);
  assert.equal(stats.skills.length,1); assert.equal(stats.skills[0].importance.must,0); assert.equal(stats.skills[0].optionalCount,1);
});
test("表达建议需要个人证据，C 类不得生成经历", () => {
  const suggestion={key:"s",category:"C",requirementRefs:["e:r1"],evidenceRefs:[],resumeQuotes:[],resumeLocation:null,issue:"确认Java经历",suggestedExpression:null,action:"confirm_capability",questions:["是否使用过Java？"]};
  const input={requirements:[{requirementId:"e:r1"}],evidence:[],resumeText:"Java项目"};
  assert.doesNotThrow(()=>validateGap({suggestions:[suggestion],warnings:[]},input));
  assert.throws(()=>validateGap({suggestions:[{...suggestion,suggestedExpression:"拥有两年Java经验"}],warnings:[]},input));
  assert.throws(()=>validateGap({suggestions:[{...suggestion,category:"A",suggestedExpression:"优化100倍"}],warnings:[]},input));
  assert.throws(()=>validateGap({suggestions:[{...suggestion,category:"B",resumeQuotes:[{blockId:"p1",quote:"Java项目"}],suggestedExpression:"熟练掌握Java并独立设计项目"}],warnings:[]},input));
});
test("回归匹配是一对一，重复预测不能刷高召回率", () => {
  assert.equal(jdEvaluationCases.length,30);
  const fixture={id:"test",category:"java",jd:text,expected:[{name:"Java",importance:"must",polarity:"required",optional:false}]};
  const r=validateExtraction(raw,text,"e").requirements[0];
  const result=evaluateJDCase(fixture,[r,{...r,key:"r2"}]);
  assert.equal(result.precision,.5); assert.equal(result.recall,1);
});
