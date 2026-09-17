export type EvaluationCase = {
  id: string;
  role: string;
  jd: string;
  evidence: Array<{ id: string; title: string; sourceQuote: string; status: "confirmed" }>;
  expected: Array<{ label: string; aliases: string[] }>;
  forbiddenFacts: string[];
};

const make = (id: string, role: string, jd: string, facts: string[], expected: Array<[string, string[]]>, forbiddenFacts: string[]): EvaluationCase => ({
  id, role, jd,
  evidence: facts.map((sourceQuote, index) => ({ id: `${id}-e${index + 1}`, title: `已确认事实 ${index + 1}`, sourceQuote, status: "confirmed" })),
  expected: expected.map(([label, aliases]) => ({ label, aliases: [label, ...aliases] })),
  forbiddenFacts,
});

export const evaluationCases: EvaluationCase[] = [
  make("product-zh", "产品经理", "负责用户研究、需求分析、产品方案与跨团队推进；必须熟练使用 SQL，以数据分析验证迭代效果；有 A/B 测试经验加分。", ["在校项目中访谈20名用户并完成需求优先级排序。", "使用 SQL 分析漏斗并定位注册流失。"], [["用户研究", ["用户访谈"]], ["需求分析", ["需求管理"]], ["SQL", ["结构化查询"]], ["数据分析", ["数据驱动"]], ["跨团队推进", ["项目推进"]], ["A/B 测试", ["AB测试"]]], ["拥有5年产品经验", "主导亿元项目"]),
  make("operations-zh", "用户运营", "负责用户分层、活动策划和社群运营，要求会 Excel 数据分析与复盘，具备文案能力。", ["策划校园活动，报名转化率提升12%。", "用 Excel 透视表复盘渠道效果。"], [["用户分层", ["分群"]], ["活动策划", ["活动运营"]], ["社群运营", ["社区运营"]], ["Excel", ["表格"]], ["复盘", ["效果分析"]], ["文案", ["内容写作"]]], ["管理百万用户", "精通 Python"]),
  make("frontend-zh", "前端工程师", "必须掌握 JavaScript、TypeScript、React、CSS 与 Git，理解前端性能优化；有无障碍经验加分。", ["使用 React 和 TypeScript 完成课程管理系统。", "通过代码分割使首屏资源减少30%。"], [["JavaScript", ["JS"]], ["TypeScript", ["TS"]], ["React", []], ["CSS", ["样式"]], ["Git", ["版本控制"]], ["性能优化", ["首屏优化"]], ["无障碍", ["a11y"]]], ["Vue 专家", "十万日活"]),
  make("backend-zh", "后端工程师", "负责 Java 服务开发，要求 Spring Boot、MySQL、Redis、REST API 和单元测试能力，理解分布式系统。", ["使用 Java 与 Spring Boot 开发订单接口。", "为核心服务补充单元测试，覆盖率达到82%。"], [["Java", []], ["Spring Boot", ["Spring"]], ["MySQL", ["关系型数据库"]], ["Redis", ["缓存"]], ["REST API", ["接口设计"]], ["单元测试", ["测试覆盖"]], ["分布式系统", ["分布式"]]], ["负责亿级流量", "Kafka 专家"]),
  make("data-zh", "数据分析师", "熟练 SQL、Python 和统计学，能够搭建指标体系、制作可视化看板并向业务方汇报洞察。", ["用 SQL 清洗三张业务表并完成留存分析。", "使用 Python 构建回归模型进行课程预测。"], [["SQL", []], ["Python", []], ["统计学", ["统计分析"]], ["指标体系", ["指标设计"]], ["可视化", ["看板"]], ["业务汇报", ["沟通洞察"]]], ["熟练 Tableau", "商业收入提升千万"]),
  make("design-zh", "UX 设计师", "负责交互设计、原型、可用性测试和设计系统维护；熟练 Figma，能与产品研发协作。", ["用 Figma 完成移动端高保真原型。", "组织5名用户进行可用性测试。"], [["交互设计", ["UX"]], ["原型", ["高保真"]], ["可用性测试", ["用户测试"]], ["设计系统", ["组件库"]], ["Figma", []], ["跨团队协作", ["产品研发协作"]]], ["获得红点奖", "精通动效"]),
  make("pm-en", "Product Manager", "Own user research, product requirements, roadmap prioritization and stakeholder alignment. SQL proficiency is required; experimentation experience is preferred.", ["Conducted 15 user interviews for a capstone project.", "Used SQL to analyze activation funnels."], [["user research", ["user interviews"]], ["product requirements", ["PRD"]], ["roadmap prioritization", ["prioritization"]], ["stakeholder alignment", ["cross-functional"]], ["SQL", []], ["experimentation", ["A/B testing"]]], ["10 years experience", "managed a $10M P&L"]),
  make("marketing-en", "Growth Marketing", "Plan acquisition campaigns, manage paid media, analyze conversion funnels, run experiments and communicate insights. SEO is a plus.", ["Ran a campus campaign that acquired 800 signups.", "Built a conversion report in spreadsheets."], [["acquisition campaigns", ["campaign planning"]], ["paid media", ["ads"]], ["conversion funnels", ["funnel analysis"]], ["experiments", ["A/B testing"]], ["communicate insights", ["reporting"]], ["SEO", []]], ["Google Ads certified", "million-dollar budget"]),
  make("ml-en", "Machine Learning Engineer", "Required: Python, PyTorch, model evaluation, data pipelines and Git. Experience deploying models and monitoring drift is preferred.", ["Trained a PyTorch image classifier for a course project.", "Created a reproducible Python preprocessing pipeline."], [["Python", []], ["PyTorch", []], ["model evaluation", ["metrics"]], ["data pipelines", ["ETL"]], ["Git", []], ["model deployment", ["serving"]], ["drift monitoring", ["model monitoring"]]], ["published at NeurIPS", "Kubernetes expert"]),
  make("sales-zh", "大客户销售", "负责客户开发、需求挖掘、方案演示、商务谈判及 CRM 管理；能适应出差，有企业服务经验优先。", ["在社团赞助项目中独立联系30家企业。", "完成需求访谈并制作方案演示。"], [["客户开发", ["拓客"]], ["需求挖掘", ["客户需求"]], ["方案演示", ["提案"]], ["商务谈判", ["谈判"]], ["CRM", ["客户管理"]], ["出差", []], ["企业服务", ["ToB"]]], ["年销售额千万", "拥有客户资源"]),
  make("finance-zh", "财务分析", "负责预算、预测、经营分析和管理报表；要求 Excel 建模、会计基础与严谨沟通，CFA 加分。", ["完成课程中的三表联动模型。", "使用 Excel 分析成本差异。"], [["预算", ["预算编制"]], ["预测", ["财务预测"]], ["经营分析", ["FP&A"]], ["管理报表", ["报告"]], ["Excel 建模", ["财务建模"]], ["会计基础", ["会计"]], ["CFA", []]], ["CFA 持证", "四大经历"]),
  make("hr-zh", "招聘运营", "负责岗位发布、候选人寻访、面试协调、招聘数据分析与雇主品牌活动；沟通细致。", ["组织校园宣讲并协调12场面试。", "用表格维护候选人进度。"], [["岗位发布", ["职位发布"]], ["候选人寻访", ["人才搜寻"]], ["面试协调", ["面试安排"]], ["招聘数据分析", ["招聘分析"]], ["雇主品牌", ["校园宣讲"]], ["沟通", ["协调"]]], ["拥有猎头资源", "完成百人招聘"]),
  make("game-zh", "游戏策划", "设计核心玩法与数值系统，撰写策划案，进行玩家研究和版本复盘；熟悉 Unity 加分。", ["独立完成一款桌游的规则与数值设计。", "收集30份试玩反馈并迭代两版。"], [["核心玩法", ["玩法设计"]], ["数值系统", ["数值策划"]], ["策划案", ["文档"]], ["玩家研究", ["用户研究"]], ["版本复盘", ["迭代复盘"]], ["Unity", []]], ["上线商业游戏", "精通 C#"]),
  make("consulting-zh", "咨询顾问", "要求结构化分析、市场研究、财务建模、PPT 表达和客户沟通，能够在高强度项目中协作。", ["完成新能源汽车市场规模测算。", "制作20页研究汇报并进行答辩。"], [["结构化分析", ["问题拆解"]], ["市场研究", ["行业研究"]], ["财务建模", ["模型"]], ["PPT", ["演示文稿"]], ["客户沟通", ["沟通"]], ["项目协作", ["团队协作"]]], ["服务世界500强", "麦肯锡实习"]),
  make("qa-zh", "测试工程师", "负责测试用例设计、接口测试、自动化测试、缺陷跟踪和质量复盘；熟悉 Python 与 CI/CD。", ["为课程项目设计80条测试用例。", "使用 Python 编写接口测试脚本。"], [["测试用例", ["用例设计"]], ["接口测试", ["API测试"]], ["自动化测试", ["测试自动化"]], ["缺陷跟踪", ["Bug管理"]], ["质量复盘", ["测试报告"]], ["Python", []], ["CI/CD", ["持续集成"]]], ["Selenium 专家", "零线上事故"]),
  make("security-zh", "安全工程师", "掌握网络安全、漏洞分析、Linux、Python 和应急响应；有 CTF 经历优先。", ["参加校内 CTF 并完成 Web 方向题目。", "使用 Python 编写日志分析脚本。"], [["网络安全", ["信息安全"]], ["漏洞分析", ["漏洞"]], ["Linux", []], ["Python", []], ["应急响应", ["安全响应"]], ["CTF", []]], ["发现0day", "持有CISSP"]),
  make("ambiguous", "综合培训生", "参与重点项目，协助分析问题并推动落地。学习能力强，沟通协作好。", ["在课程项目中负责会议纪要和进度跟踪。"], [["项目参与", ["重点项目"]], ["问题分析", ["分析问题"]], ["推动落地", ["执行"]], ["学习能力", ["快速学习"]], ["沟通协作", ["团队协作"]]], ["领导大型团队", "创造营收"]),
  make("contradictory", "数据产品经理", "必须熟练 SQL；同时本岗位不要求写 SQL。负责指标产品、需求文档和跨部门协作，三年以上经验优先。", ["使用 SQL 完成课程中的留存分析。", "撰写过指标平台产品方案。"], [["SQL", []], ["指标产品", ["数据产品"]], ["需求文档", ["PRD"]], ["跨部门协作", ["协作"]], ["三年以上经验", ["3年经验"]]], ["三年工作经验", "带领10人团队"]),
  make("long", "商业分析师", `${"负责业务诊断、数据分析与策略落地。".repeat(80)} 必须掌握 SQL、Excel、统计分析、结构化表达和项目推进；了解 Python 加分。`, ["用 SQL 分析课程平台留存。", "用 Excel 建立敏感性分析模型。"], [["业务诊断", ["问题诊断"]], ["数据分析", []], ["策略落地", ["策略执行"]], ["SQL", []], ["Excel", []], ["统计分析", ["统计学"]], ["结构化表达", ["表达"]], ["项目推进", ["推进"]], ["Python", []]], ["有咨询公司经历", "提升利润20%"]),
  make("empty-evidence", "内容运营", "负责选题策划、内容生产、数据复盘、平台运营和热点追踪，要求文字功底扎实。", [], [["选题策划", ["选题"]], ["内容生产", ["内容创作"]], ["数据复盘", ["内容分析"]], ["平台运营", ["账号运营"]], ["热点追踪", ["热点"]], ["文字功底", ["写作"]]], ["拥有十万粉丝", "爆款文章作者"]),
  make("mixed-lang", "Technical Product Manager", "负责 API product roadmap、developer research、PRD writing 和跨团队 delivery。Requires SQL and fluent English; cloud experience is a plus.", ["撰写过开放平台课程项目 PRD。", "使用 SQL 完成接口调用漏斗分析。"], [["API product roadmap", ["API路线图"]], ["developer research", ["开发者研究"]], ["PRD writing", ["需求文档"]], ["cross-functional delivery", ["跨团队交付"]], ["SQL", []], ["English", ["英语"]], ["cloud experience", ["云计算"]]], ["AWS certified", "native English speaker"]),
];

export function getEvaluationCase(id: string) {
  return evaluationCases.find((item) => item.id === id);
}
