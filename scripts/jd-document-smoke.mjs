import { writeFileSync } from "node:fs";
const origin=process.argv[2]||"http://127.0.0.1:4175";
if(!["localhost","127.0.0.1"].includes(new URL(origin).hostname)||!process.argv.includes("--real-ai"))throw new Error("Use an isolated local server and --real-ai");
const headers={"oai-authenticated-user-id":"jd-document-"+Date.now(),"oai-authenticated-user-email":"synthetic@example.com","content-type":"application/json"};
async function call(path,method="GET",data){const response=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});const json=await response.json();if(!response.ok)throw new Error(JSON.stringify(json));return json;}
const content="BT /F1 12 Tf 50 700 Td (Synthetic candidate) Tj 0 -20 Td (Java course project: implemented enrolment API.) Tj ET";
const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>","<< /Length "+content.length+" >>\nstream\n"+content+"\nendstream"];
let pdf="%PDF-1.4\n";const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(pdf.length);pdf+=(i+1)+" 0 obj\n"+obj+"\nendobj\n";}
const xref=pdf.length;pdf+="xref\n0 6\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
const report={syntheticOnly:true,createdAt:new Date().toISOString(),passed:false};
try {
 const uploaded=await fetch(origin+"/api/files?purpose=resume",{method:"POST",headers:{...headers,"content-type":"application/pdf","x-file-name":"synthetic.pdf"},body:pdf});const {file}=await uploaded.json();if(!file)throw new Error("Upload failed");
 const created=await call("/api/jd/resumes/"+file.id+"/parse","POST",{version:file.version});
 const result=await call("/api/ai/jobs/"+created.job.id+"/run","POST");
 Object.assign(report,{model:result.job.model,status:result.job.status,text:result.job.result.text,passed:result.job.result.text.includes("Java")&&result.job.status==="succeeded"});
} catch(error){report.error=String(error);} finally {await call("/api/profile?confirm=DELETE","DELETE");writeFileSync("reports/jd-document.json",JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
