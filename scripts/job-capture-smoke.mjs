import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const origin=process.argv[2]||"http://127.0.0.1:4175";
if(!["127.0.0.1","localhost"].includes(new URL(origin).hostname)||!process.argv.includes("--real-ai"))throw new Error("Use an isolated local server and --real-ai");
const headers={"oai-authenticated-user-id":"capture-smoke-"+Date.now(),"oai-authenticated-user-email":"synthetic@example.com","content-type":"application/json"};
const report={createdAt:new Date().toISOString(),syntheticCandidateDataOnly:true,cases:[],passed:false};
async function call(path,method="GET",data){const r=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json()};}
try {
 for(const [name,sourceUrl] of [["accessible_public_job","https://job-boards.greenhouse.io/cloudflare/jobs/8158920"],["reported_application_url","https://hf7l9aiqzx.jobs.feishu.cn/704852/position/7670073263825799451/detail"]]) {
  const result=await call("/api/job-captures","POST",{sourceUrl});
  const data=result.data.job?.result;
  const passed=name==="accessible_public_job" ? result.status===201&&data?.company?.includes("Cloudflare")&&data?.role?.includes("Software Engineer")&&data?.jd?.length>80 : result.status===201&&data?.captureMethod==="public_ats_api"&&data?.role==="AI应用开发工程师（Java开发）"&&data?.location==="北京"&&data?.jd?.includes("MCP")&&result.data.job.model==="public-ats-parser";
  report.cases.push({name,status:result.status,passed,code:result.data.code,company:data?.company,role:data?.role,location:data?.location,jdLength:data?.jd?.length,captureMethod:data?.captureMethod,model:result.data.job?.model,error:result.data.error});
  console.log(name+" passed="+passed);
 }
 const browser=await chromium.launch({channel:"chrome",headless:true});let png;
 try {const page=await browser.newPage({viewport:{width:1000,height:600}});await page.setContent('<main style="padding:40px;font:28px Arial;line-height:1.7"><h1>Synthetic Capture Ltd</h1><h2>Java Backend Engineer</h2><p>Location: Hangzhou</p><p>Responsibilities: Build Java APIs.</p><p>Requirements: Spring Boot, MySQL, Redis.</p></main>');png=await page.screenshot();} finally {await browser.close();}
 const upload=await fetch(origin+"/api/files?purpose=job_screenshot",{method:"POST",headers:{...headers,"content-type":"image/png","x-file-name":"synthetic-job.png"},body:png});const {file}=await upload.json();if(!file)throw new Error("Synthetic screenshot upload failed");
 const result=await call("/api/job-captures","POST",{screenshotFileId:file.id});const data=result.data.job?.result;
 report.cases.push({name:"synthetic_screenshot",status:result.status,passed:result.status===201&&data?.company?.includes("Synthetic")&&data?.role?.includes("Java")&&data?.jd?.includes("MySQL"),company:data?.company,role:data?.role,error:result.data.error});
 report.passed=report.cases.length===3&&report.cases.every(c=>c.passed);
} finally {await call("/api/profile?confirm=DELETE","DELETE");mkdirSync("reports",{recursive:true});writeFileSync("reports/job-capture-smoke.json",JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
