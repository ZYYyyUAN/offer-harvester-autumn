import { test, expect, type APIResponse } from "@playwright/test";

const json = async (response: APIResponse) => { expect(response.ok(), await response.text()).toBe(true); return response.json(); };
test.beforeEach(async ({request}) => { await json(await request.delete('/api/profile?confirm=DELETE')); });

test('local rules and profile reuse run automatically without paid AI and respect manual channel clearing', async ({page,request}) => {
  await json(await request.post('/api/company-profiles',{data:{legalName:'合成复用主体有限公司',companyNature:'foreign_invested',companyTags:['banking']}}));
  await page.goto('/?view=savedJobs');await page.getByRole('main').getByRole('button',{name:'记录已投岗位',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});
  await dialog.getByLabel('公司',{exact:true}).fill('合成复用主体有限公司');
  await dialog.getByLabel('岗位',{exact:true}).fill('后端');
  await dialog.getByLabel('岗位链接',{exact:true}).fill('https://www.zhipin.com/job_detail/synthetic.html');
  await expect(dialog.getByLabel('公司性质',{exact:true})).toHaveValue('foreign_invested');
  await expect(dialog.getByLabel('实际提交渠道',{exact:true})).toHaveValue('boss');
  await dialog.getByLabel('实际提交渠道',{exact:true}).selectOption('unknown');
  await dialog.getByText('渠道识别与公司资料',{exact:true}).click();
  await dialog.getByRole('button',{name:'重新识别渠道',exact:true}).click();
  await expect(dialog.getByLabel('实际提交渠道',{exact:true})).toHaveValue('unknown');
  expect((await json(await request.get('/api/ai/jobs'))).jobs).toHaveLength(0);
  await dialog.getByRole('button',{name:'保存已投记录',exact:true}).click();await expect(dialog).toBeHidden();
  const metadata=(await json(await request.get('/api/records?kind=applications'))).records[0].data.jobMetadata;
  expect(metadata.fieldStates.companyTags.status).toBe('suggested');
  expect(metadata.actualSubmission.channel).toBe('unknown');
});

test('screenshot is an optional fallback, restores without reupload and survives subsequent link extraction', async ({page,request}) => {
  await page.goto('/?view=savedJobs');await page.getByRole('main').getByRole('button',{name:'记录已投岗位',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});
  await dialog.getByText('链接无法读取？用截图识别',{exact:true}).click();
  await dialog.locator('input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64')});
  await dialog.getByLabel('完整 JD',{exact:true}).fill('用户手动保留的 JD');
  await dialog.getByRole('button',{name:'识别截图',exact:true}).click();
  await expect(dialog.getByText('发现字段冲突，当前保留你的填写')).toBeVisible();
  await expect(dialog.getByRole('status').first()).toContainText('草稿已保存到云端');
  const files=(await json(await request.get('/api/files?purpose=job_screenshot'))).files;expect(files).toHaveLength(1);
  await page.reload();dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});
  await dialog.getByText('链接无法读取？用截图识别',{exact:true}).click();
  await expect(dialog.getByRole('button',{name:'识别截图',exact:true})).toBeEnabled();
  await expect(dialog.getByRole('link',{name:'查看已保存来源截图'})).toHaveAttribute('href',`/api/files/content?id=${files[0].id}`);
  await dialog.getByRole('button',{name:'识别截图',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存已投记录',exact:true})).toBeEnabled();
  expect((await json(await request.get('/api/files?purpose=job_screenshot'))).files).toHaveLength(1);
  await dialog.getByLabel('岗位链接',{exact:true}).fill('https://example.test/job');
  await dialog.getByRole('button',{name:'提取链接',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'保存已投记录',exact:true})).toBeEnabled();
  await expect(dialog.getByLabel('完整 JD',{exact:true})).toHaveValue('用户手动保留的 JD');
  await dialog.getByRole('button',{name:'保存已投记录',exact:true}).click();await expect(dialog).toBeHidden();
  const application=(await json(await request.get('/api/records?kind=applications'))).records[0];
  expect(application.data.screenshotFileId).toBe(files[0].id);
  expect(application.data.jd).toBe('用户手动保留的 JD');
});
