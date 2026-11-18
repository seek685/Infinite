import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=process.env.BROWSER_PATH||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium',
].find(existsSync);
assert.ok(executablePath,'Set BROWSER_PATH to a Chromium browser executable');
const baseURL=process.env.PREVIEW_URL||'http://127.0.0.1:5173/';
const browser=await chromium.launch({executablePath,headless:true});
await fs.mkdir('.qa',{recursive:true});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],failedRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>failedRequests.push(request.url()));
  page.on('response',response=>{if(response.status()>=400)failedRequests.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(()=>{
    const audit=window.deliveryAudit={draws:0,drawsAtReady:0,progress:[0],programs:[]};
    for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
      const original=WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method]=function(...args){audit.draws++;return original.apply(this,args);};
    }
    const link=WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram=function(program){link.call(this,program);audit.programs.push(this.getProgramParameter(program,this.LINK_STATUS));};
    new MutationObserver(()=>{
      const value=document.querySelector('#preloader')?.getAttribute('aria-valuenow');
      if(value!==null&&value!==undefined&&Number(value)!==audit.progress.at(-1))audit.progress.push(Number(value));
      if(document.body?.classList.contains('ready')&&!audit.drawsAtReady)audit.drawsAtReady=audit.draws;
    }).observe(document,{subtree:true,attributes:true,attributeFilter:['aria-valuenow','class']});
  });
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/*',async route=>{if(route.request().resourceType()==='script')await gate;await route.continue();});
  await page.goto(baseURL,{waitUntil:'commit'});
  await page.locator('#preloader').waitFor({state:'visible'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const pending=await page.evaluate(()=>{
    const el=document.querySelector('#preloader'),rect=el.getBoundingClientRect();
    return {black:getComputedStyle(el).backgroundColor,progress:Number(el.getAttribute('aria-valuenow')),ready:document.body.classList.contains('ready'),draws:window.deliveryAudit.draws,fullScreen:rect.width===innerWidth&&rect.height===innerHeight};
  });
  assert.equal(pending.black,'rgb(0, 0, 0)');assert.equal(pending.progress,0);
  assert.equal(pending.ready,false);assert.equal(pending.draws,0);assert.ok(pending.fullScreen);
  await page.screenshot({path:'.qa/preloader-cold-start.png'});
  release();
  await page.waitForSelector('body.ready',{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#preloader').hidden);
  const audit=await page.evaluate(()=>window.deliveryAudit);
  assert.ok(audit.drawsAtReady>0,'reveal must follow a rendered WebGL frame');
  assert.equal(audit.progress.at(-1),100);assert.ok(audit.progress.every((p,i)=>i===0||p>=audit.progress[i-1]));
  assert.ok(audit.programs.length>15&&audit.programs.every(Boolean),'all startup GLSL programs must link');
  assert.equal(await page.title(),'ORBITAL | Infinite Li');
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),'ORBITAL | Infinite Li');
  assert.ok((await page.locator('meta[property="og:description"]').getAttribute('content')).length>20);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://infinite-li.cn/');
  assert.ok((await page.locator('link[rel="icon"]').getAttribute('href')).startsWith('data:image/svg+xml,'));

  // Native touch scrolling must survive the loader's temporary scroll lock.
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:680}]});
  for(let i=1;i<=16;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:680-i*25}]});
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>scrollY>100);
  await cdp.detach();
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const diagnostics=await page.evaluate(()=>window.__ORBITAL__?.diagnostics());
  if(diagnostics){assert.ok(diagnostics.pixelRatio<=1.25);assert.equal(diagnostics.particleCount,32000);assert.equal(diagnostics.glError,0);assert.deepEqual(diagnostics.shaderErrors,[]);}
  assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  const report={url:baseURL,status:'PASS',drawsAtReady:audit.drawsAtReady,progress:audit.progress,linkedPrograms:audit.programs.length,nativeTouch:true,rotation:true,errors,failedRequests};
  await fs.writeFile('.qa/delivery-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
