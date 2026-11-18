import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { parsePost } from '../src/content/frontmatter.js';

const executablePath = process.env.BROWSER_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
const baseURL = process.env.PREVIEW_URL || 'http://127.0.0.1:5173/';
const files = (await fs.readdir('src/posts')).filter(name => name.endsWith('.md'));
const posts = await Promise.all(files.map(async name => parsePost(name, await fs.readFile('src/posts/' + name, 'utf8'))));
const sample = posts.find(post => post.slug === 'interval-in-the-rings');
const href = '#journal/' + encodeURIComponent(sample.slug);
const browser = await chromium.launch({ executablePath, headless: true });
await fs.mkdir('.qa', { recursive: true });

async function swipe(context, page, x, y) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x,y}]});
  for (let i=1; i<=12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x,y:y-i*18}]});
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
  await cdp.detach();
}

const results = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [844, 390]]) {
    const phone = width !== 1440;
    const context = await browser.newContext({viewport:{width,height},isMobile:phone,hasTouch:phone,deviceScaleFactor:1});
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if(message.type()==='error')errors.push(message.text());});
    page.on('requestfailed', request => failed.push(`${request.failure()?.errorText} ${request.url()}`));
    page.on('response', response => {if(response.status()>=400)failed.push(response.url());});
    await page.goto(baseURL, {waitUntil:'networkidle'});
    await page.waitForFunction(() => document.querySelector('#preloader').hidden);
    // Detect a document reload on the first lazy Markdown import or a hash change.
    await page.evaluate(() => {window.readerDocumentId='initial';});
    const open = page.locator('.site-navigation [href="#journal"]');
    await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
    await page.waitForFunction(() => document.querySelector('#chapter-number').textContent==='03 / 08');
    await page.waitForTimeout(350);
    const geometry = await page.evaluate(() => {
      const nodes=[...document.querySelectorAll('.navigation-start > button, .site-navigation a, .navigation-actions button, .flight-navigation')];
      const rects=nodes.map(node=>node.getBoundingClientRect());
      return rects.every((r,i)=>r.width>0&&r.left>=0&&r.right<=innerWidth+1&&rects.slice(i+1).every(s=>r.right<=s.left||s.right<=r.left||r.bottom<=s.top||s.bottom<=r.top));
    });
    assert.ok(geometry,'all five navigation actions and the chapter track have separate hit areas');
    await open.click();
    await page.waitForSelector('#reader[open] .journal-entry');
    const drawer = page.locator('#reader');
    await drawer.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
    const bounds=await drawer.boundingBox();
    assert.equal(bounds.width,phone?width:700);
    assert.equal(bounds.x+bounds.width,width,'open drawer lands flush with the right edge');
    assert.equal(await page.locator('.journal-entry').count(),posts.length);
    const dates = await page.locator('.entry-meta time').allTextContents();
    assert.deepEqual(dates,[...dates].sort().reverse());
    await page.getByRole('button',{name:sample.category,exact:true}).click();
    assert.equal(await page.locator('.journal-entry').count(),posts.filter(post=>post.category===sample.category).length);
    await page.locator('.journal-entry').filter({has:page.getByRole('heading',{name:sample.title,exact:true})}).click();
    await page.waitForSelector('.prose table');
    assert.equal(await page.locator('#reader-title').textContent(),sample.title);
    assert.ok(await page.locator('.prose pre code').count());
    assert.equal(await page.evaluate(()=>window.readerDocumentId),'initial');
    const held = await page.evaluate(()=>({y:scrollY,position:window.__ORBITAL__?.diagnostics().cameraPosition,progress:window.__ORBITAL__?.diagnostics().progress}));
    const scroller = page.locator('#reader-scroll');
    const area = await scroller.boundingBox();
    const x=area.x+area.width*.7,y=area.y+area.height*.8;
    if (phone) await swipe(context,page,x,y);
    else {await page.mouse.move(x,y);await page.mouse.wheel(0,640);}
    await page.waitForFunction(()=>document.querySelector('#reader-scroll').scrollTop>90);
    assert.equal(await page.evaluate(()=>scrollY),held.y,'reading scroll must not move the document');
    const overflow = await scroller.evaluate(node=>node.scrollWidth>node.clientWidth+1);
    assert.equal(overflow,false,'wide code and tables scroll inside the article');
    if (held.position) {
      const measured = await page.evaluate(async()=>{
        const sample=()=>window.__ORBITAL__.diagnostics();
        const first=sample(), start=performance.now();
        let previous=first.sceneTime, frames=0;
        do {
          await new Promise(resolve=>requestAnimationFrame(resolve));
          const now=sample().sceneTime;
          if(now!==previous){frames++;previous=now;}
        } while(performance.now()-start<850);
        const last=sample(), duration=(performance.now()-start)/1000;
        return {position:last.cameraPosition,progress:last.progress,hz:frames/duration,rotation:(last.sceneTime-first.sceneTime)/duration};
      });
      assert.deepEqual(measured.position,held.position);
      assert.equal(measured.progress,held.progress);
      assert.ok(measured.hz>0&&measured.hz<=(width<768?9:13),'3D paint budget while reading');
      assert.ok(measured.rotation>0&&measured.rotation<.5,'background rotation eases down');
    }
    await page.goBack();
    await page.waitForSelector('.journal-list');
    assert.equal(await page.getByRole('button',{name:sample.category,exact:true}).getAttribute('aria-pressed'),'true');
    await page.locator('.reader-toolbar [href="#projects"]').click();
    await page.waitForFunction(()=>document.querySelector('.project-orbit')?.naturalWidth>0);
    assert.ok(await page.locator('.project-grid a[href^="https://"]').count()>=3);
    await page.locator('.reader-toolbar [href="#about"]').click();
    assert.ok(await page.locator('.contact-links a[href$="/issues"]').isVisible());
    if(phone)await page.locator('#reader-close').tap();else await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#reader').open);
    assert.equal(new URL(page.url()).hash,'');
    assert.equal(await page.title(),'ORBITAL | Infinite Li');
    assert.equal(await page.evaluate(()=>window.readerDocumentId),'initial','reading history stays inside the original 3D document');
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'#journal');
    if(held.position){
      const after=await page.evaluate(()=>window.__ORBITAL__.diagnostics());
      assert.ok(Math.abs(held.progress-after.progress)<.001,`flight moved after closing: ${held.progress} (scroll ${held.y}) → ${after.progress} (scroll ${await page.evaluate(()=>scrollY)})`);
    }
    const before=await page.evaluate(()=>scrollY);
    if(phone)await swipe(context,page,width*.7,height*.8);
    else {await page.mouse.move(400,450);await page.mouse.wheel(0,430);}
    await page.waitForFunction(start=>scrollY>start+40,before);
    if(width===390){
      const direct=await context.newPage();
      await direct.goto(baseURL+href);await direct.waitForSelector('#reader[open] .prose table');
      await direct.waitForFunction(()=>document.querySelector('#preloader').hidden);
      await direct.setViewportSize({width:844,height:390});await direct.waitForTimeout(300);
      assert.equal((await direct.locator('#reader').boundingBox()).width,844);
      await direct.locator('#reader-close').click();await direct.waitForFunction(()=>!document.querySelector('#reader').open);
      assert.equal(new URL(direct.url()).hash,'');
      await direct.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    const result={width,height,status:'PASS',posts:posts.length,touch:phone,errors,failed};
    results.push(result);console.log(JSON.stringify(result));
    await context.close();
  }
} finally {
  await fs.writeFile('.qa/reader-report.json',JSON.stringify(results,null,2));
  await browser.close();
}
