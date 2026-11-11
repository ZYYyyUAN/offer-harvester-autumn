import { writeFileSync } from "node:fs";
const origin=process.argv[2]||"http://127.0.0.1:4175";
if(!["127.0.0.1","localhost"].includes(new URL(origin).hostname)||!process.argv.includes("--real-ai"))throw new Error("Requires an isolated local Worker and --real-ai");
const owner="company-real-synthetic-"+Date.now(),headers={"oai-authenticated-user-id":owner,"oai-authenticated-user-email":"synthetic@example.test","content-type":"application/json"};
const cases=[{name:"fictitious",company:"OFFER验收虚构蓝桥科技有限公司（合成不存在主体）",expectedNature:null},{name:"ambiguous_brand",company:"OFFER合成验收 Global Bank 银行外包（未给法人主体，不得套用其他公司）",expectedNature:null},{name:"public_entity",company:"中国工商银行股份有限公司",expectedNature:"state_owned"}];
const selected=process.argv.find(arg=>arg.startsWith("--case="))?.slice(7),report={startedAt:new Date().toISOString(),privateJobDataUsed:false,syntheticAccount:true,publicCompanyLookup:true,cases:[],passed:false};
async function api(path,method="GET",data){const response=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw new Error(`${response.status} ${body.code||"APP_ERROR"}: ${body.error||"Request failed"}`);return body;}
try{
 for(const fixture of cases.filter(c=>!selected||c.name===selected)){
  const created=await api("/api/ai/jobs","POST",{type:"company_metadata_verify",input:{company:fixture.company,sourceUrl:""}}),start=Date.now();
  const done=await api(`/api/ai/jobs/${created.job.id}/run`,"POST"),result=done.job.result;
  const urls=new Set(result.sources.map(s=>s.url)),referencesValid=result.claims.every(c=>urls.has(new URL(c.sourceUrl).href)&&c.subject===result.legalName);
  const pass=done.job.status==="succeeded"&&referencesValid&&result.quoteVerification==="model_only"&&(fixture.expectedNature?result.claims.some(c=>c.field==="companyNature"&&c.value===fixture.expectedNature):result.claims.length===0);
  const entry={name:fixture.name,pass,referencesValid,expectedNature:fixture.expectedNature,model:done.job.model,promptVersion:done.job.promptVersion,elapsedMs:Date.now()-start,attempts:done.attempts.map(a=>({status:a.status,tokenUsage:a.tokenUsage})),result};report.cases.push(entry);writeFileSync(`reports/company-verification-real${selected?"-"+selected:""}.json`,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({case:fixture.name,pass,claims:result.claims.length,sources:result.sources.length,elapsedMs:entry.elapsedMs}));
 }
 report.passed=report.cases.length>0&&report.cases.every(c=>c.pass);
 if(!report.passed)throw new Error("Company verification regression failed");
}catch(error){report.error=error.message;process.exitCode=1;}finally{
 report.finishedAt=new Date().toISOString();writeFileSync(`reports/company-verification-real${selected?"-"+selected:""}.json`,JSON.stringify(report,null,2)+"\n");
 await api("/api/profile?confirm=DELETE","DELETE");
}
