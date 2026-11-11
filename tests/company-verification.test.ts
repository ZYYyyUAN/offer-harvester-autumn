import test from "node:test";
import assert from "node:assert/strict";
import { CompanyVerificationOutputSchema, companyVerificationSuggestions, verifiedCompanyResult } from "../lib/company-verification.ts";
import { applyMetadataSuggestions, JobMetadataSchema, manualMetadataEdit, metadataContext } from "../lib/job-metadata.ts";
import { applicationToFeishuFields, mergeFeishuApplication } from "../lib/feishu-contracts.ts";
const now="2026-11-11T00:00:00.000Z", input={company:"合成主体",sourceUrl:""};
const source={title:"公开资料",url:"https://example.test/company",publishedAt:null,crawledAt:now};
const raw=()=>CompanyVerificationOutputSchema.parse({legalName:"合成主体有限公司",registryId:"",entityStatus:"matched",claims:[{field:"companyNature",value:"private",subject:"合成主体有限公司",quote:"合成主体有限公司是一家民营企业。",sourceUrl:source.url}],conflicts:[],notes:[]});
test("only provider sources, matching subjects and explicit nature statements become reviewable suggestions",()=>{
 const valid=verifiedCompanyResult(raw(),input,[source]);assert.equal(valid.claims.length,1);assert.equal(valid.quoteVerification,"model_only");
 assert.equal(verifiedCompanyResult(raw(),input,[]).claims.length,0);
 const wrong=raw();wrong.claims[0].subject="另一家子公司";assert.equal(verifiedCompanyResult(wrong,input,[source]).claims.length,0);
 const guessed=raw();guessed.claims[0].quote="我们是一家上市银行";assert.equal(verifiedCompanyResult(guessed,input,[source]).claims.length,0);
 const contradictory=raw();contradictory.claims.push({...contradictory.claims[0],value:"state_owned",quote:"该主体为国有企业。"});assert.equal(verifiedCompanyResult(contradictory,input,[source]).claims.length,0);
 assert.equal(verifiedCompanyResult({...raw(),entityStatus:"ambiguous"},input,[source]).claims.length,0);
});
test("network suggestions retain manual edits, explicit clearing and rejection",()=>{
 const result=verifiedCompanyResult(raw(),input,[source]), key=metadataContext(input.company,input.sourceUrl), suggestions=companyVerificationSuggestions(result,"00000000-0000-4000-8000-000000000001","company-metadata-v1");
 const manual=manualMetadataEdit(JobMetadataSchema.parse({}),"companyNature","state_owned",key,now);
 assert.equal(applyMetadataSuggestions(manual,suggestions,key).companyNature,"state_owned");
 const cleared=manualMetadataEdit(manual,"companyNature","unknown",key,now);assert.equal(applyMetadataSuggestions(cleared,suggestions,key).companyNature,"unknown");
});
test("Feishu displays confirmed actual channel and treats legacy inbound channel as a candidate only",()=>{
 const metadata=JobMetadataSchema.parse({actualSubmission:{channel:"email",customLabel:"",contextKey:metadataContext("合成主体",""),confirmedAt:now},legacy:{channel:"内推＋网申"}});
 const current={company:"合成主体",role:"Java",sourceUrl:"",jd:"不覆盖JD",resumeId:"private-file-id",appliedAt:null,channel:"网申",jobMetadata:metadata};
 const merged=mergeFeishuApplication(current,{channel:"BOSS直聘",notes:"飞书修改"},now);
 assert.equal(merged.jd,current.jd);assert.equal(merged.resumeId,current.resumeId);assert.equal(merged.appliedAt,null);assert.deepEqual(merged.jobMetadata.actualSubmission,metadata.actualSubmission);assert.equal(merged.jobMetadata.legacy.channel,"内推＋网申");assert.equal(merged.jobMetadata.suggestions[0].value,"boss");
 const fields=applicationToFeishuFields({id:"a",version:1,updatedAt:now,data:merged});assert.equal(fields["投递渠道"],"邮件");
 assert.equal(mergeFeishuApplication(null,{company:"合成主体",role:"Java",channel:"网申"},now).jobMetadata!.actualSubmission,null);
});

test("explicit state-owned bank wording is recognized without treating banking software as a bank",()=>{
 const bank=raw();bank.claims[0].value="state_owned";bank.claims[0].quote="合成主体有限公司为国有大型商业银行。";assert.equal(verifiedCompanyResult(bank,input,[source]).claims.length,1);
 const software=raw();software.claims[0].field="companyTags";software.claims[0].value="banking";software.claims[0].quote="合成主体有限公司提供银行业务软件外包服务。";assert.equal(verifiedCompanyResult(software,input,[source]).claims.length,0);
});
