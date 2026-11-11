"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, Field } from "./shared";
import type { StoredFile } from "./types";
export function DefaultResumePreference({resumes,onChanged}:{resumes:StoredFile[];onChanged:()=>Promise<void>}) {
 const [settings,setSettings]=useState<any>(null),[choice,setChoice]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const revision=resumes.map(r=>r.id+":"+r.version).join(",");
 useEffect(()=>{let active=true;api<any>("/api/settings/submission-defaults").then(data=>{if(active){setSettings(data);setChoice(current=>current&&resumes.some(r=>r.id===current)?current:data.resolvedResume?.fileId||"");setError("");}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision,resumes]);
 async function save(clear=false){setBusy(true);try{const selected=clear?null:await api<any>(`/api/files/identity?id=${encodeURIComponent(choice)}`);const result=await api<any>("/api/settings/submission-defaults",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({version:settings.version,defaultSubmissionResume:selected?{fileId:selected.fileId,version:selected.version,sha256:selected.sha256}:null})});setSettings(result);setChoice(result.resolvedResume?.fileId||"");await onChanged();toast.success(clear?"已取消默认简历":"默认投递简历已保存，历史记录不变");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="panel default-resume-preference"><h2>默认投递简历</h2><p>{settings?.resolvedResume?`当前：${settings.resolvedResume.displayName} · v${settings.resolvedResume.version}`:"尚未设置有效默认简历"}。仅用于新增时预选，上传新版不会自动替换。</p>{error&&<p role="alert">{error}</p>}<div className="card-actions"><Field label="默认简历文件"><select disabled={busy||!settings} aria-label="默认简历文件" value={choice} onChange={e=>setChoice(e.target.value)}><option value="">选择已完成简历</option>{resumes.filter(r=>r.metadata.libraryType!=="optimization").map(r=><option key={r.id} value={r.id}>{r.metadata.displayName||r.filename} · v{r.version}{settings?.resolvedResume?.fileId===r.id?"（默认）":""}</option>)}</select></Field><Button disabled={busy||!choice||!settings} onClick={()=>save()}>设为默认</Button><Button variant="outline" disabled={busy||!settings?.defaultSubmissionResume} onClick={()=>save(true)}>取消默认</Button></div></section>;
}
