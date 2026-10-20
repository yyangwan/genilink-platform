import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1060},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await mkdir(path.join(root,'images'),{recursive:true});
  const views=['overview','platforms','brands','sources','evidence','actions','brief','measure'];
  const checks=[];
  for(const view of views){
    await page.evaluate(name=>showView(name),view);
    await page.locator('main h1').waitFor();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow)throw new Error(`${view}: desktop horizontal overflow`);
    await page.screenshot({path:path.join(root,'images',`${view}.png`),fullPage:true});
    checks.push({view,title:await page.locator('main h1').innerText(),horizontalOverflow:false});
  }
  await page.evaluate(()=>showView('platforms'));
  await page.getByRole('button',{name:'查看对应原文证据'}).nth(1).click();
  if(!(await page.locator('main').innerText()).includes('回答采用旧版参数'))throw new Error('platform evidence link failed');
  await page.screenshot({path:path.join(root,'images','evidence-parameter.png'),fullPage:true});
  await page.getByRole('button',{name:'打开持久化原文'}).click();
  if(!await page.getByRole('dialog').isVisible())throw new Error('source snapshot modal failed');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Kimi',exact:true}).click();
  if(!(await page.locator('main').innerText()).includes('价格比较中'))throw new Error('platform evidence tab failed');
  await page.evaluate(()=>showView('brands'));
  await page.getByRole('button',{name:'确认身份并加入竞品'}).click();
  await page.getByRole('button',{name:'确认作为竞品'}).click();
  await page.getByRole('button',{name:'重点品牌 · 3',exact:true}).click();
  if(await page.locator('[data-row="brandrow"]').count()!==3)throw new Error('brand confirmation failed');
  await page.evaluate(()=>showView('sources'));
  await page.getByRole('button',{name:'访问受限',exact:true}).click();
  if(await page.locator('[data-row="sourcerow"]').count()!==1)throw new Error('source status filter failed');
  await page.getByRole('button',{name:'全部文章',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索来源'}).fill('不存在的标题');
  if(!await page.locator('#searchEmpty').isVisible())throw new Error('empty search state failed');
  await page.evaluate(()=>showView('actions'));
  await page.getByRole('button',{name:'创建内容方案',exact:true}).click();
  await page.getByLabel('方案标题').fill('试点规格页更新');
  await page.getByRole('button',{name:'创建方案草稿',exact:true}).click();
  if(!await page.getByRole('dialog').isVisible())throw new Error('brief draft modal failed');
  await page.keyboard.press('Escape');
  if(await page.getByRole('dialog').isVisible())throw new Error('modal escape failed');
  await page.evaluate(()=>{document.getElementById('toast').style.display='none';state.platform='DeepSeek';showView('evidence')});
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('mobile document overflow');
  await page.screenshot({path:path.join(root,'images','evidence-mobile.png'),fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile(path.join(root,'verification.json'),JSON.stringify({screens:checks,browserErrors:errors,interactionChecks:['platform evidence link','source snapshot modal','platform evidence tabs','brand confirmation and focus list','source status filter','empty search state','content brief flow','modal keyboard dismissal','mobile evidence layout']},null,2));
  console.log('8 desktop screenshots + parameter evidence variant + mobile screenshot exported. Interaction checks passed; no browser errors.');
} finally {await browser.close();}
