"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/workspace/shared";

const jobResources = [
  ["小红书校园招聘", "年轻人 / 校招", "https://job.xiaohongshu.com/campus", "内容、电商、产品与技术岗位的官方校招入口"],
  ["脉脉招聘", "职场社区 / 内推", "https://maimai.cn/jobs/c/job_find_me", "岗位、员工动态、内推线索与公司口碑"],
  ["字节跳动校园招聘", "企业官网", "https://jobs.bytedance.com/campus", "字节跳动校招、实习与投递进度官方入口"],
  ["BOSS 直聘", "综合招聘", "https://www.zhipin.com/web/geek/job", "综合岗位与招聘者沟通"],
  ["拉勾校招", "互联网", "https://campus.lagou.com/", "互联网与数字科技校招"],
  ["实习僧", "实习 / 校招", "https://www.shixiseng.com/", "实习、校招与应届岗位"],
  ["猎聘", "综合招聘", "https://www.liepin.com/zhaopin/", "社会招聘与中高端职位"],
  ["牛客求职", "校招社区", "https://www.nowcoder.com/jobs", "校招职位、笔面试经验"],
  ["前程无忧校招", "校园招聘", "https://xy.51job.com/", "校园招聘与企业专场"],
  ["智联招聘", "综合招聘", "https://jobs.zhaopin.com/", "全职、校招与城市岗位"],
  ["应届生求职网", "应届生", "https://www.yingjiesheng.com/", "校招信息、宣讲会与网申"],
  ["上海公共招聘", "上海 / 官方", "https://jobs.rsj.sh.gov.cn/", "上海人社公共就业招聘服务入口"],
  ["杭州人才网", "杭州 / 官方", "https://www.hzrc.com/", "杭州人才市场招聘、校招、事业单位与招聘会"],
  ["中国国家人才网", "全国 / 国家平台", "https://www.newjobs.com.cn/", "全国人才招聘、事业单位与人才服务信息"],
  ["中国公共招聘网", "全国 / 公共就业", "https://job.mohrss.gov.cn/", "人社系统公共招聘与高校毕业生岗位"],
  ["中国卫生人才网", "卫生健康", "https://www.21wecan.com/", "国家卫生健康委人才交流服务与卫生岗位"],
  ["中国外语人才网", "外语 / 翻译 / 外贸", "https://www.jobeast.com/", "外语、翻译、外贸和国际业务垂直岗位"],
  ["中国国际人才网", "国际人才", "https://www.chinajob.com/", "国际化与涉外人才岗位及招聘活动"],
  ["V2EX 酷工作", "技术社区", "https://www.v2ex.com/go/jobs", "开发者社区中的技术岗位与团队直招信息"],
  ["工信人才网", "信息技术 / 工业", "https://www.miitjob.cn/", "工业和信息化领域的软件、通信、电子与技术岗位"],
  ["开源中国招聘", "信息技术", "https://www.oschina.net/job", "软件开发、开源生态与信息技术岗位"],
  ["国聘校园", "国企 / 校招", "https://job.iguopin.com/jobList?channel=campus", "央企、国企与重点行业校园岗位"],
  ["国家大学生就业服务平台", "国家平台", "https://gcu.ncss.cn/", "教育部就业服务、专场招聘与实习岗位"],
  ["中央企业应届生招聘", "央企", "https://job.mohrss.gov.cn/qyzp/index.jhtml", "中央企业招聘应届高校毕业生信息"],
  ["国资委招聘", "国资央企", "https://www.sasac.gov.cn/n2588035/n2588325/n2588350/index.html", "国务院国资委招聘公告汇总"],
] as const;

export function JobResourcesView() {
  return <><PageHead eyebrow="求职入口" title="寻找岗位" description="常用招聘平台集中跳转；打开后找到岗位，再回到收藏岗位保存链接与 JD。" />
    <div className="resources-grid">{jobResources.map(([name, tag, url, description]) => <article className="resource-card" key={name}><div className="resource-mark">{name.slice(0, 1)}</div><div><span className="resource-badge">{tag}</span><h2>{name}</h2><p>{description}</p><small>{new URL(url).hostname}</small></div><Button asChild><a href={url} target="_blank" rel="noreferrer">访问平台<ExternalLink /></a></Button></article>)}</div>
    <section className="panel resource-note"><b>使用建议</b><p>外部平台可能要求登录或触发风控验证。本工具只提供官方入口，不代替你登录，也不会抓取账号数据。</p></section>
  </>;
}
