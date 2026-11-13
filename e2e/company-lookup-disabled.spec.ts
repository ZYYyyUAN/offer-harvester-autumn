import {test,expect} from '@playwright/test';
test('company lookup is blocked at create, run and retry while manual records remain usable',async({request,page})=>{
 const created=await request.post('/api/ai/jobs',{data:{type:'company_metadata_verify',input:{company:'合成止损主体'}}});expect(created.status()).toBe(503);expect((await created.json()).code).toBe('COMPANY_LOOKUP_DISABLED');
 const backup=await (await request.get('/api/data/export?format=json')).json();const id=crypto.randomUUID(),now=new Date().toISOString();backup.aiJobs.push({id,type:'company_metadata_verify',status:'queued',input_snapshot:JSON.stringify({company:'合成止损主体',sourceUrl:''}),source_refs:'[]',model:'qwen3.8-max',prompt_version:'company-metadata-v6',version:1,created_at:now,updated_at:now});
 const preview=await (await request.post('/api/data/imports',{data:{filename:'synthetic.json',content:JSON.stringify(backup)}})).json();expect((await request.post(`/api/data/imports/${preview.importId}/commit`,{data:{}})).ok()).toBe(true);
 for(const path of ['run','retry']){const r=await request.post(`/api/ai/jobs/${id}/${path}`);expect(r.status()).toBe(503);expect((await r.json()).code).toBe('COMPANY_LOOKUP_DISABLED');}
 const detail=await (await request.get(`/api/ai/jobs/${id}`)).json();expect(detail.attempts).toHaveLength(0);expect(detail.job.status).toBe("failed");expect(detail.job.errorCode).toBe("COMPANY_LOOKUP_DISABLED");
 await page.goto('/?view=savedJobs');await page.getByRole('main').getByRole('button',{name:'记录已投岗位',exact:true}).click();await expect(page.getByRole('button',{name:'核实性质',exact:true})).toBeDisabled();await expect(page.getByLabel('公司性质',{exact:true})).toBeEnabled();
});
