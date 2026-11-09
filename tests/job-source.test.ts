import test from "node:test";
import assert from "node:assert/strict";
import { publicAtsSource, PublicAtsDetailSchema, publicAtsDraft } from "../lib/job-source-contracts.ts";

test("网申公开数据读取仅支持已核实的 HTTPS 平台路径", () => {
  const source=publicAtsSource("https://sample.jobs.feishu.cn/campus/position/123456/detail?spread=ref");
  assert.equal(source?.detailUrl,"https://sample.jobs.feishu.cn/api/v1/job/posts/123456");
  for(const url of ["http://sample.jobs.feishu.cn/campus/position/123/detail","https://sample.jobs.feishu.cn.evil.test/campus/position/123/detail","https://localhost/campus/position/123/detail","https://sample.jobs.feishu.cn:8443/campus/position/123/detail","https://me:secret@sample.jobs.feishu.cn/campus/position/123/detail"])assert.equal(publicAtsSource(url),null);
});

test("网申字段取自公开数据，不把网站标题推断为公司或补写截止日期", () => {
  const payload=PublicAtsDetailSchema.parse({code:0,data:{job_post_detail:{id:"123",title:"Java 开发",description:"职责：开发接口。要求：熟悉 Java。",city_list:[{name:"北京"}]}}});
  const companyData={code:0,data:{tenant_info:{tenant_name:"合成软件有限公司"}}};
  const draft=publicAtsDraft(companyData,payload,"https://sample.jobs.feishu.cn/campus/position/123/detail");
  assert.equal(draft.company,"合成软件有限公司");assert.equal(draft.location,"北京");assert.equal(draft.salary,"");assert.equal(draft.deadline,"");assert.equal(draft.jd,payload.data.job_post_detail.description);
  assert.equal(publicAtsDraft("<title>不能推断的品牌</title>",payload,draft.sourceUrl).company,"");
  assert.equal(PublicAtsDetailSchema.safeParse({code:403,data:{}}).success,false);
});
