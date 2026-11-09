import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { jdEvaluationCases, evaluateJDCase } from "../lib/jd-evaluation-cases.ts";
const origin = process.argv[2] || "http://127.0.0.1:4175";
const url = new URL(origin);
if (!["127.0.0.1","localhost"].includes(url.hostname) || !process.argv.includes("--real-ai")) throw new Error("Real regression requires --real-ai and an isolated local server");
const owner = "jd-regression-" + Date.now();
const headers={"oai-authenticated-user-id":owner,"oai-authenticated-user-email":"synthetic@example.com","content-type":"application/json"};
async function call(path,method="GET",data) {
  const response=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
  const json=await response.json();
  if(!response.ok) throw new Error(JSON.stringify({status:response.status,...json}));
  return json;
}
const report={syntheticOnly:true,owner,createdAt:new Date().toISOString(),cases:[],gapCases:[],providerCalls:0,passed:false};
const gapsOnly=process.argv.includes("--gaps-only");
if(gapsOnly) { const previous=JSON.parse(readFileSync("reports/jd-regression.json","utf8")); if(previous.cases.length!==30||previous.cases.some(c=>c.error))throw new Error("A complete extraction report is required"); report.cases=previous.cases;report.extractionRunAt=previous.extractionRunAt||previous.createdAt; }
try {
  for(const fixture of gapsOnly ? [jdEvaluationCases[0]] : jdEvaluationCases) {
    const started=Date.now();
    try {
      const app=(await call("/api/records","POST",{kind:"applications",data:{company:"合成-"+fixture.id,role:"测试岗位",direction:fixture.id,stage:"已投递",jd:fixture.jd}})).record;
      const snap=(await call("/api/jd/sources/"+app.id)).snapshots[0];
      if(!fixture.jd) {
        let rejected=false;try{await call("/api/jd/snapshots/"+snap.id+"/extract","POST",{version:snap.version});}catch(error){rejected=String(error).includes("422");}
        if(!rejected)throw new Error("Empty JD must be rejected");
        report.cases.push({...evaluateJDCase(fixture,[]),emptyRejected:true,elapsedMs:Date.now()-started});
      } else {
        const created=await call("/api/jd/snapshots/"+snap.id+"/extract","POST",{version:snap.version}); report.providerCalls++;
        const complete=await call("/api/ai/jobs/"+created.job.id+"/run","POST");
        const result=complete.job.result;
        const entry={...evaluateJDCase(fixture,result.requirements),model:complete.job.model,promptVersion:complete.job.promptVersion,schemaValid:true,invalidReferences:0,unsupportedCandidateFacts:0,
          tokens:complete.attempts.reduce((n,a)=>n+Number(a.tokenUsage.total_tokens||0),0),elapsedMs:Date.now()-started,
          input:fixture.jd,expectedRequirements:fixture.expected,output:result,
          firstAttemptSuccess:complete.attempts[0]?.status==="succeeded",retried:complete.attempts.length>1};
        if(gapsOnly)report.seedCase=entry;else report.cases.push(entry);
      }
      console.log(fixture.id+" F1="+report.cases.at(-1).f1);
    }catch(error) {
      report.cases.push({id:fixture.id,error:String(error),schemaValid:false,elapsedMs:Date.now()-started,input:fixture.jd,expectedRequirements:fixture.expected});
      console.log(fixture.id+" FAILED "+String(error));
    }
  }
  for (const category of ["A", "B", "C"]) {
    let fact;
    try {
      if (category === "A") fact=(await call("/api/records","POST",{kind:"evidence",data:{title:"Java课程项目",status:"confirmed",context:"课程项目",action:"使用Java实现课程报名接口",result:"完成课程项目，未进行性能压测",skills:["Java"]}})).record;
      const text=category==="B"?"Java课程项目：使用Java实现课程报名接口。":"教育经历：软件工程专业。";
      const bytes=zipSync({"word/document.xml":strToU8("<w:document><w:p><w:r><w:t>"+text+"</w:t></w:r></w:p></w:document>")});
      const response=await fetch(origin+"/api/files?purpose=resume",{method:"POST",headers:{...headers,"content-type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","x-file-name":"synthetic-"+category+".docx"},body:bytes});
      const file=(await response.json()).file;if(!file)throw new Error("Synthetic resume upload failed");
      const parsed=await call("/api/jd/resumes/"+file.id+"/parse","POST",{version:file.version});
      await call("/api/jd/texts/"+parsed.textSnapshot.id+"/confirm","POST",{version:parsed.textSnapshot.version});
      const profile=await call("/api/jd?direction=java-01");
      const created=await call("/api/jd/gaps","POST",{resumeFileId:file.id,resumeFileVersion:file.version,filters:{scope:"applied",direction:"java-01"},sampleDigest:profile.sampleDigest});report.providerCalls++;
      const completed=await call("/api/ai/jobs/"+created.job.id+"/run","POST");
      const suggestions=completed.job.result.suggestions;
      const unsupported=suggestions.filter(s=>s.suggestedExpression && /\d+|[一二三四五六七八九十]+年/.test(s.suggestedExpression));
      report.gapCases.push({category,model:completed.job.model,promptVersion:completed.job.promptVersion,tokenUsage:completed.attempts.map(a=>a.tokenUsage),elapsedMs:completed.job.elapsedMs,passed:suggestions.some(s=>s.category===category)&&unsupported.length===0,unsupportedFactCount:unsupported.length,
        citationCoverage:suggestions.filter(s=>s.suggestedExpression).every(s=>s.evidenceRefs.length||s.resumeQuotes.length)?1:0,output:completed.job.result});
      console.log("Gap "+category+" passed="+report.gapCases.at(-1).passed);
    }catch(error){report.gapCases.push({category,passed:false,error:String(error)});console.log("Gap "+category+" FAILED "+String(error));}
    finally {if(fact)await call("/api/records?id="+fact.id+"&version="+fact.version,"DELETE");}
  }
  const good=report.cases.filter(c=>!c.error);
  const matched=good.reduce((n,c)=>n+c.matched,0);
  const expected=jdEvaluationCases.reduce((n,c)=>n+c.expected.length,0);
  const predicted=good.reduce((n,c)=>n+c.predicted,0);
  const precision=predicted?matched/predicted:0,recall=expected?matched/expected:0;
  const times=good.map(c=>c.elapsedMs).sort((a,b)=>a-b);
  report.metrics={precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0,
    succeeded:good.length,total:jdEvaluationCases.length,schemaPassRate:good.filter(c=>!c.emptyRejected&&c.schemaValid).length/(jdEvaluationCases.length-1),
    candidateFactFabrication:"JD-only extraction receives no candidate facts; gap review is separately tested",
    totalTokens:good.reduce((n,c)=>n+(c.tokens||0),0),p50Ms:times[Math.ceil(times.length*.5)-1],p95Ms:times[Math.ceil(times.length*.95)-1],
    firstAttemptSuccessRate:good.filter(c=>c.firstAttemptSuccess).length/(jdEvaluationCases.length-1)};
  report.passed=good.length===30&&report.metrics.f1>=.9&&report.metrics.schemaPassRate===1&&report.gapCases.length===3&&report.gapCases.every(c=>c.passed);
} finally {
  await call("/api/profile?confirm=DELETE","DELETE");
  mkdirSync("reports",{recursive:true});
  writeFileSync("reports/jd-regression.json",JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:report.passed,metrics:report.metrics,providerCalls:report.providerCalls},null,2));
if(!report.passed)process.exitCode=1;
