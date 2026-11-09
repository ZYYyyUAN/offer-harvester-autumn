import { canonicalSkill, type JDRequirementSchema } from "./jd-contracts.ts";
import type { z } from "zod";
type Expected = { name: string; importance: string; polarity: string; optional: boolean };
export type JDCase = { id: string; category: string; jd: string; expected: Expected[] };
const normal = (id: string, category: string, names: string[], english = false): JDCase => ({
  id, category,
  jd: names.map((name, i) => english ? (["Required: ", "Preferred: ", "Nice to have: "][i] + name + ".") : (["必须掌握", "优先考虑掌握", "加分项："][i] + name + "。")).join("\n"),
  expected: names.map((name, i) => ({ name, importance: ["must", "important", "bonus"][i], polarity: "required", optional: false })),
});
export const jdEvaluationCases: JDCase[] = [
  normal("java-01","java",["Java","MySQL","Redis"]), normal("java-02","java",["Spring Boot","RocketMQ","Docker"]),
  normal("java-03","java",["Java","Kubernetes","Git"],true), normal("java-04","java",["MySQL","Redis","Linux"],true),
  normal("java-05","java",["Spring Cloud Alibaba","Nacos","Sentinel"]), normal("java-06","java",["Java","RabbitMQ","Elasticsearch"]),
  normal("java-07","java",["Java","Kafka","Docker"],true), normal("java-08","java",["Spring Boot","MySQL","Git"]),
  normal("java-09","java",["Java","Redis","K8s"]), normal("java-10","java",["MySQL","RocketMQ","Linux"]),
  normal("java-11","java",["Java","Spring Boot","Kubernetes"],true), normal("java-12","java",["Java","SQL","Git"]),
  normal("tech-01","other-tech",["Python","SQL","Linux"]), normal("tech-02","other-tech",["Go","Docker","Kubernetes"],true),
  normal("tech-03","other-tech",["JavaScript","TypeScript","Git"]), normal("tech-04","other-tech",["SQL","Python","MySQL"],true),
  normal("tech-05","other-tech",["Linux","Docker","Git"]), normal("tech-06","other-tech",["Go","Redis","Kafka"]),
  normal("other-01","non-dev",["需求分析","用户研究","Figma"]), normal("other-02","non-dev",["SQL","数据分析","Python"]),
  normal("other-03","non-dev",["内容策划","文案写作","视频剪辑"]), normal("other-04","non-dev",["Figma","交互设计","用户研究"]),
  normal("other-05","non-dev",["财务分析","Excel","英语"]), normal("other-06","non-dev",["项目管理","需求分析","Git"]),
  { id:"edge-or",category:"edge",jd:"必须掌握 Java 或 Go 中的至少一种语言。",expected:[{name:"Java",importance:"must",polarity:"required",optional:true},{name:"Go",importance:"must",polarity:"required",optional:true}] },
  { id:"edge-negative",category:"edge",jd:"不要求工作经验。\n必须掌握 Java。",expected:[{name:"工作经验",importance:"unspecified",polarity:"not_required",optional:false},{name:"Java",importance:"must",polarity:"required",optional:false}] },
  { id:"edge-empty",category:"edge",jd:"",expected:[] },
  { id:"edge-no-job",category:"edge",jd:"欢迎访问本网站。联系方式请见页脚。",expected:[] },
  { id:"edge-repeat",category:"edge",jd:"必须掌握 Java。\n必须掌握 Java。\n加分项：Redis。",expected:[{name:"Java",importance:"must",polarity:"required",optional:false},{name:"Redis",importance:"bonus",polarity:"required",optional:false}] },
  { id:"edge-long",category:"edge",jd:"公司介绍：我们致力于为客户提供可靠服务。\n".repeat(250)+"必须掌握 Java。\n加分项：Docker。",expected:[{name:"Java",importance:"must",polarity:"required",optional:false},{name:"Docker",importance:"bonus",polarity:"required",optional:false}] },
];
export function evaluateJDCase(fixture: JDCase, requirements: Array<z.infer<typeof JDRequirementSchema> & { anyGroup: boolean }>) {
  const remaining = [...fixture.expected]; let matched = 0;
  for (const r of requirements) {
    const at = remaining.findIndex((e) => canonicalSkill(e.name).skillId === canonicalSkill(r.proposedName).skillId &&
      e.importance === r.importance && e.polarity === r.polarity && e.optional === r.anyGroup);
    if (at >= 0) { matched++; remaining.splice(at, 1); }
  }
  const precision = requirements.length ? matched / requirements.length : fixture.expected.length ? 0 : 1;
  const recall = fixture.expected.length ? matched / fixture.expected.length : requirements.length ? 0 : 1;
  return { id: fixture.id, category: fixture.category, expected: fixture.expected.length, predicted: requirements.length, matched, precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, missing: remaining };
}
