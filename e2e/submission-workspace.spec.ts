import { test, expect, type APIResponse } from "@playwright/test";
const json=async(response:APIResponse)=>{const text=await response.text();expect(response.ok(),text).toBe(true);return JSON.parse(text);};
test.describe.configure({mode:"serial"});test.beforeEach(async({request})=>{await json(await request.delete("/api/profile?confirm=DELETE"));});
test("server totals include all 501 records and unknown stages independently of page size",async({request})=>{
 const records=Array.from({length:501},(_,i)=>({id:crypto.randomUUID(),kind:"applications",title:"合成分页岗位"+i,data:{company:"合成公司"+i,role:"Java 后端",stage:i===500?"准备简历":"已投递"}}));
 const preview=await json(await request.post("/api/data/imports",{data:{filename:"synthetic-paging.json",content:JSON.stringify({schemaVersion:6,records,files:[],aiJobs:[],aiJobAttempts:[]})}}));await json(await request.post(`/api/data/imports/${preview.importId}/commit`,{data:{}}));
 const ids=new Set<string>();for(let page=1;page<=6;page++){const result=await json(await request.get(`/api/applications/workspace?page=${page}&pageSize=100`));expect(result.summary.totalRecords).toBe(501);expect(result.summary.totalSubmitted).toBe(500);expect(result.summary.stageCounts.unknown).toBe(1);expect(result.filteredCount).toBe(501);for(const row of result.records)ids.add(row.id);}expect(ids.size).toBe(501);
 const unknown=await json(await request.get("/api/applications/workspace?stage=unknown"));expect(unknown.filteredCount).toBe(1);expect(unknown.records[0].data.stage).toBe("准备简历");
 const legacy=unknown.records[0];await json(await request.patch("/api/records",{data:{id:legacy.id,version:legacy.version,data:{notes:"人工补充备注"}}}));expect((await json(await request.get("/api/applications/workspace?stage=unknown"))).records[0].data.stage).toBe("准备简历");
 expect((await json(await request.get("/api/applications/workspace?q=合成公司500"))).filteredCount).toBe(1);
 const foreign=await json(await request.get("/api/applications/workspace",{headers:{"oai-authenticated-user-id":"other-owner"}}));expect(foreign.summary.totalRecords).toBe(0);expect(foreign.records).toHaveLength(0);
});
