import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async({request})=>{expect((await request.delete('/api/profile?confirm=DELETE')).ok()).toBe(true);});
test('review shows one analysis at a time and restores section on refresh',async({page})=>{
 await page.goto('/?view=applications&tab=review');
 await expect(page.getByRole('heading',{name:'历史到达阶段'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'机会结束分析'})).toHaveCount(0);
 await page.getByRole('button',{name:'结束复盘',exact:false}).click();
 await expect(page.getByRole('heading',{name:'机会结束分析'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'机会结束分析'})).toBeVisible();
 await page.getByRole('button',{name:'渠道与公司',exact:false}).click();
 await expect(page.getByRole('heading',{name:'发现来源与实际投递渠道'})).toBeVisible();
 const axe=await new AxeBuilder({page}).include('main').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();expect(axe.violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
 await page.getByRole('button',{name:'整体表现',exact:false}).click();
 await page.screenshot({path:`reports/review-redesign-${test.info().project.name}.png`,fullPage:true});
});
test('today is prefilled for a fresh submission and a cleared date survives draft restore',async({page})=>{
 await page.goto('/?view=savedJobs');await page.getByRole('main').getByRole('button',{name:'记录已投岗位',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});let date=dialog.getByLabel('实际投递时间（可未知）');
 const value=await date.inputValue();expect(value.slice(0,10)).toBe(await page.evaluate(()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}));
 await date.fill('');await dialog.getByLabel('公司',{exact:true}).fill('合成日期保留公司');
 await expect(dialog.getByRole('status').first()).toContainText('草稿已保存到云端');await page.reload();
 dialog=page.getByRole('dialog',{name:'记录已投岗位',exact:true});date=dialog.getByLabel('实际投递时间（可未知）');await expect(date).toHaveValue('');
});
