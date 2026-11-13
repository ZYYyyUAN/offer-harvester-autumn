import {test,expect} from '@playwright/test';
async function seed(request:any,status:string,type='company_metadata_verify'){
 const backup=await(await request.get('/api/data/export?format=json')).json(),id=crypto.randomUUID(),attemptId=crypto.randomUUID(),old='2020-01-01 00:00:00';
 backup.aiJobs.push({id,type,status,input_snapshot:JSON.stringify({company:'合成状态验收',sourceUrl:'https://example.test/slow-capture'}),source_refs:'[]',model:'qwen3.8-max',prompt_version:'synthetic',version:2,created_at:old,updated_at:old,started_at:old,finished_at:status==='cancelled'?old:null});
 backup.aiJobAttempts.push({id:attemptId,job_id:id,attempt_number:1,model:'qwen3.8-max',status:'running',token_usage:'{}',telemetry:'{}',started_at:old});
 const p=await(await request.post('/api/data/imports',{data:{filename:'synthetic.json',content:JSON.stringify(backup)}})).json();const committed=await request.post(`/api/data/imports/${p.importId}/commit`,{data:{}});expect(committed.ok(),await committed.text()).toBe(true);return id;
}
test.beforeEach(async({request})=>{await request.delete('/api/profile?confirm=DELETE');});
test('detail alone reconciles a lost worker and orphan cancelled attempt, owner isolated',async({request})=>{
 for(const status of ['running','cancelled']){
 const id=await seed(request,status);expect((await request.get(`/api/ai/jobs/${id}`,{headers:{'oai-authenticated-user-id':'outsider'}})).status()).toBe(404);
 const d=await(await request.get(`/api/ai/jobs/${id}`)).json();expect(d.job.status).toBe(status==='running'?'failed':'cancelled');expect(d.attempts[0].status).toBe(status==='running'?'failed':'cancelled');expect(d.attempts[0].telemetry.providerStatus).toBe('unknown');expect(d.attempts[0].tokenUsage).toEqual({});
 const again=await(await request.get(`/api/ai/jobs/${id}`)).json();expect(again.job.version).toBe(d.job.version);
 }
});
test('cancellation closes attempt atomically and late result cannot overwrite it',async({request})=>{
 const id=(await(await request.post('/api/job-captures',{data:{sourceUrl:'https://example.test/slow-capture',wait:false}})).json()).job.id;
 const running=request.post(`/api/ai/jobs/${id}/run`);await expect.poll(async()=>(await(await request.get(`/api/ai/jobs/${id}`)).json()).attempts.length).toBe(1);
 expect((await request.post(`/api/ai/jobs/${id}/cancel`)).ok()).toBe(true);let d=await(await request.get(`/api/ai/jobs/${id}`)).json();expect(d.job.status).toBe('cancelled');expect(d.attempts[0].status).toBe('cancelled');await running;
 d=await(await request.get(`/api/ai/jobs/${id}`)).json();expect(d.job.result).toBeNull();expect(d.attempts[0].status).toBe('cancelled');expect(d.attempts[0].tokenUsage.total_tokens).toBe(50);
});
