import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.delete('/api/profile?confirm=DELETE');});
test('new intake defaults survive draft restore and are frozen on submission',async({page,request})=>{
 await page.goto('/?view=savedJobs');await page.getByRole('main').getByRole('button',{name:'记录已投岗位',exact:true}).click();let dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});
 await dialog.getByText('更多信息：内推、用工类型与公司标签',{exact:true}).click();await expect(dialog.getByLabel('岗位用工类型',{exact:true})).toHaveValue('direct_hire');await expect(dialog.getByLabel('是否内推',{exact:true})).toHaveValue('no');
 await dialog.getByLabel('公司',{exact:true}).fill('合成默认值验收');await dialog.getByLabel('岗位',{exact:true}).fill('后端');await expect(dialog.getByRole('status').first()).toContainText('草稿已保存到云端');await page.reload();dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});await dialog.getByRole('button',{name:'保存已投记录',exact:true}).click();await expect(dialog).toBeHidden();
 const backup=await(await request.get('/api/data/export?format=json')).json();const snapshot=backup.records.find((r:any)=>r.kind==='job_submissions').data.metadataSnapshot;expect(snapshot.employmentType).toBe('direct_hire');expect(snapshot.referralStatus).toBe('no');
});
