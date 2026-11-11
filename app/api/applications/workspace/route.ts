import { submissionDisplaySql } from "@/lib/submission-display";
import { z } from "zod";
import { apiError, getDatabase, mapRecord, requireApiUser, safeJson } from "@/lib/server-data";
import { submissionStages, submissionWorkspaceSummary } from "@/lib/submission-workspace";

export async function GET(request: Request) {
  try {
    const {userId}=await requireApiUser();
    const input=z.object({q:z.string().max(240).default(""),stage:z.enum(["all",...submissionStages,"unknown"]).default("all"),sort:z.enum(["updated","company","deadline","appliedAt"]).default("updated"),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const db=getDatabase();
    const values:unknown[]=[userId];
    let filter="owner_id = ? AND kind = 'applications' AND deleted_at IS NULL";
    if(input.stage==="unknown"){filter+=" AND (json_extract(data,'$.stage') IS NULL OR json_extract(data,'$.stage') NOT IN ("+submissionStages.map(()=>"?").join(",")+"))";values.push(...submissionStages);}
    else if(input.stage!=="all"){filter+=" AND json_extract(data,'$.stage') = ?";values.push(input.stage);}
    if(input.q){filter+=" AND instr(lower(coalesce(json_extract(data,'$.company'),'') || ' ' || coalesce(json_extract(data,'$.role'),'') || ' ' || coalesce(json_extract(data,'$.location'),'')), lower(?)) > 0";values.push(input.q);}
    const order={appliedAt:"coalesce(nullif(json_extract(data,'$.appliedAt'),''),'0000') DESC, id",updated:"updated_at DESC, id",company:"json_extract(data,'$.company') COLLATE NOCASE, id",deadline:"coalesce(nullif(json_extract(data,'$.deadline'),''),'9999-12-31'), id"}[input.sort];
    const result=await db.batch<Record<string,unknown>>([
      db.prepare("SELECT id,kind,json_object('stage',json_extract(data,'$.stage'),'appliedAt',json_extract(data,'$.appliedAt'),'nextFollowUpAt',json_extract(data,'$.nextFollowUpAt'),'lastContactAt',json_extract(data,'$.lastContactAt'),'closure',json_extract(data,'$.closure'),'applicationId',json_extract(data,'$.applicationId'),'from',json_extract(data,'$.from'),'to',json_extract(data,'$.to'),'category',json_extract(data,'$.category'),'status',json_extract(data,'$.status'),'dueAt',json_extract(data,'$.dueAt'),'checklist',json_extract(data,'$.checklist')) AS data FROM records WHERE owner_id = ? AND deleted_at IS NULL AND kind IN ('applications','job_submissions','application_events','activity_events','tasks','offers','interviews')").bind(userId),
      db.prepare("SELECT count(*) AS total FROM records WHERE "+filter).bind(...values),
      db.prepare("SELECT application.*, ("+submissionDisplaySql+") AS submission_display FROM (SELECT * FROM records WHERE "+filter+" ORDER BY "+order+" LIMIT ? OFFSET ?) AS application").bind(...values,input.pageSize,(input.page-1)*input.pageSize),
      db.prepare("SELECT coalesce(json_extract(data,'$.stage'),'unknown') AS stage, count(*) AS count FROM records WHERE "+filter+" GROUP BY json_extract(data,'$.stage')").bind(...values),
    ]);
    const filteredStageCounts: Record<string,number> = {};
    for (const row of result[3].results) { const stage=submissionStages.includes(row.stage as typeof submissionStages[number])?String(row.stage):"unknown"; filteredStageCounts[stage]=(filteredStageCounts[stage]||0)+Number(row.count); }
    const serverNow=new Date().toISOString();
    const projected=result[0].results.map(row=>({id:String(row.id),kind:String(row.kind),data:safeJson<Record<string,any>>(String(row.data),{})}));
    return Response.json({records:result[2].results.map(row=>({...mapRecord(row),submission:row.submission_display?safeJson(String(row.submission_display),null):null})),summary:submissionWorkspaceSummary(projected,serverNow),filteredStageCounts,filteredCount:Number(result[1].results[0].total),page:input.page,pageSize:input.pageSize,serverNow});
  }catch(error){return apiError(error);}
}
