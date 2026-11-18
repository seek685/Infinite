import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const report=[];
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
try{
  for(const settings of [
    {name:'desktop',viewport:{width:1440,height:900}},
    {name:'mobile',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true},
    {name:'reduced-motion',viewport:{width:1280,height:800},reducedMotion:'reduce'},
  ]){
    const {name,...options}=settings,context=await browser.newContext(options),page=await context.newPage();
    const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    page.on('requestfailed',request=>requests.push(`${request.failure()?.errorText} ${request.url()}`));
    page.on('response',response=>{if(response.status()>=400)requests.push(`${response.status()} ${response.url()}`);});
    await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:5173/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__ORBITAL__);await page.waitForTimeout(1100);
    const state=()=>page.evaluate(()=>window.__ORBITAL__.diagnostics());
    const waitMode=mode=>page.waitForFunction(mode=>window.__ORBITAL__.diagnostics().exploration.mode===mode,mode);
    const seek=async progress=>{await page.evaluate(p=>window.__ORBITAL__.seek(p),progress);await page.waitForFunction(p=>Math.abs(window.__ORBITAL__.diagnostics().progress-p)<.0001,progress);await page.waitForTimeout(300);};
    const traceFraming=()=>page.evaluate(()=>{
      window.orbitFraming=[];
      const sample=()=>{window.orbitFraming.push(window.__ORBITAL__.diagnostics().cameraView.offsetY);window.orbitFrame=requestAnimationFrame(sample);};sample();
    });
    const checkFraming=async()=>{
      await page.waitForTimeout(80);
      const trace=await page.evaluate(()=>{cancelAnimationFrame(window.orbitFrame);return window.orbitFraming;});
      assert.ok(trace.length>10);
      assert.ok(trace.every((value,i)=>i===0||Math.abs(value-trace[i-1])<settings.viewport.height*.04),'portrait framing must interpolate without a cut');
    };
    const initial=await state();assert.equal(initial.audio.created,false);assert.equal(initial.exploration.mode,'flight');
    const navFits=await page.evaluate(()=>{
      const nav=document.querySelector('.flight-navigation').getBoundingClientRect(),actions=document.querySelector('.navigation-actions').getBoundingClientRect(),logo=document.querySelector('.orbit-symbol').getBoundingClientRect();
      const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      return !overlap(nav,actions)&&!overlap(nav,logo);
    });assert.ok(navFits,'top controls must not overlap the existing navigation');

    // Enter from an intermediate chapter while preserving its scroll position.
    await seek(1/7);await page.mouse.move(settings.viewport.width/2,settings.viewport.height/2);await page.waitForTimeout(900);
    const departure=await state();
    await page.locator('#orbit-button').click();await waitMode('orbit');
    assert.ok((await state()).exploration.controlsEnabled);
    assert.equal(await page.locator('.film-caption').getAttribute('aria-hidden'),'true');
    assert.ok(Number(await page.locator('.film-caption').evaluate(el=>getComputedStyle(el).opacity))<.01);
    const frozen=(await state()).progress;
    const beforeDrag=(await state()).cameraPosition;
    if(name==='mobile'){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:260,y:340}]});
      for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:260-i*12,y:340+i*3}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(650);
      const radiusBefore=Math.hypot(...(await state()).cameraPosition);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:145,y:350,id:1},{x:245,y:350,id:2}]});
      for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145-i*5,y:350,id:1},{x:245+i*5,y:350,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(500);
      assert.ok(Math.hypot(...(await state()).cameraPosition)<radiusBefore-.1,'pinch must zoom the free camera');await cdp.detach();
    }else{
      await page.mouse.move(1000,440);await page.mouse.down();await page.mouse.move(500,500,{steps:25});await page.mouse.up();await page.waitForTimeout(800);
      const radiusBefore=Math.hypot(...(await state()).cameraPosition);
      await page.mouse.wheel(0,-900);await page.waitForTimeout(600);
      assert.ok(Math.hypot(...(await state()).cameraPosition)<radiusBefore-.1,'wheel must zoom instead of scrolling the route');
    }
    assert.ok(distance(beforeDrag,(await state()).cameraPosition)>.3,'drag must move the free camera');
    assert.equal((await state()).progress,frozen,'free orbit must not advance the flight timeline');
    assert.ok(Math.hypot(...(await state()).cameraPosition)>=3.052-1e-6);
    await page.screenshot({path:`.qa/${name}-free-orbit.png`});
    await page.locator('#orbit-button').click();await waitMode('flight');await page.waitForTimeout(500);
    const returned=await state();
    assert.ok(Math.abs(returned.progress-departure.progress)<.0002,'exit must restore the prior flight progress');
    assert.ok(distance(returned.cameraPosition,departure.cameraPosition)<.2,'exit must return to the original shot');
    assert.equal(await page.locator('.film-caption').getAttribute('aria-hidden'),'false');
    await seek(0);

    const records=[];
    for(const id of (name==='desktop'?['storm','division','ionosphere']:['storm'])){
      const pin=page.locator(`[data-hotspot="${id}"]`);await pin.waitFor({state:'visible'});
      // The pins genuinely orbit every frame: click their current screen coordinates.
      const bounds=await pin.boundingBox();
      if(name==='mobile')await page.touchscreen.tap(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      else await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      await waitMode('orbit');await page.waitForFunction(()=>document.querySelector('#field-record').classList.contains('is-open'));
      await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#field-record')).opacity)>.99);
      await page.waitForTimeout(250);
      assert.equal((await state()).exploration.selected,id);
      const layout=await page.evaluate(()=>{
        const record=document.querySelector('#field-record').getBoundingClientRect(),nav=document.querySelector('.navigation').getBoundingClientRect(),hud=document.querySelector('.flight-readouts').getBoundingClientRect();
        return {top:record.top,bottom:record.bottom,nav:nav.bottom,hud:hud.top,width:record.width,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(layout.top>layout.nav&&layout.bottom<layout.hud,'field record must clear both navigation and telemetry');assert.equal(layout.overflow,false);
      assert.ok(Math.hypot(...(await state()).cameraPosition)>=3.052-1e-6);
      await page.screenshot({path:`.qa/${name}-record-${id}.png`});records.push(id);
      const articleLink=page.locator('#record-article');
      const articleLabel=await articleLink.getAttribute('aria-label');
      await articleLink.click();await page.waitForSelector('#reader[open] .prose p');
      assert.ok(articleLabel.includes(await page.locator('#reader-title').textContent()));
      assert.equal((await state()).exploration.controlsEnabled,false,'reading holds the close-up camera');
      if(name==='mobile'){
        await page.waitForTimeout(2200);
        const held=await state();await page.waitForTimeout(350);
        assert.equal((await state()).sceneTime,held.sceneTime,'a held surface landmark stays aligned throughout a long read');
        assert.deepEqual((await state()).cameraPosition,held.cameraPosition);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('#reader').open);
      assert.equal((await state()).exploration.selected,id,'Escape closes the article before the underlying field record');
      assert.equal((await state()).exploration.controlsEnabled,true);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'record-article');
      await page.locator('#record-close').click();await waitMode('orbit');
      assert.equal((await state()).exploration.selected,null);
      await page.locator('#orbit-button').click();await waitMode('flight');await page.waitForTimeout(300);
    }

    await seek(6/7);
    const blackHoleDeparture=await state();
    if(name==='mobile')await traceFraming();
    await page.locator('#orbit-button').click();await waitMode('orbit');
    if(name==='mobile')await checkFraming();
    assert.deepEqual((await state()).exploration.target,[0,0,-1800],'free orbit must use the current celestial body');
    const w=settings.viewport.width,h=settings.viewport.height;
    await page.mouse.move(w*.75,h*.42);await page.mouse.down();await page.mouse.move(w*.35,h*.55,{steps:20});await page.mouse.up();await page.waitForTimeout(500);
    assert.ok(distance((await state()).cameraPosition,blackHoleDeparture.cameraPosition)>.5);
    assert.ok((await state()).journey.blackHoleDistance>=11);
    assert.ok((await state()).exploration.hotspots.every(pin=>!pin.visible));
    await page.screenshot({path:`.qa/${name}-black-hole-orbit.png`});
    if(name==='mobile')await traceFraming();
    await page.locator('#orbit-button').click();await waitMode('flight');
    if(name==='mobile')await checkFraming();
    assert.ok(Math.abs((await state()).progress-6/7)<.0002);
    assert.ok(distance((await state()).cameraPosition,blackHoleDeparture.cameraPosition)<.2);
    assert.ok(Math.abs((await state()).cameraView.offsetY-blackHoleDeparture.cameraView.offsetY)<.1);
    await seek(0);

    // Toggle during a transition: only the final intent owns the camera.
    await page.locator('#orbit-button').click();await page.waitForTimeout(150);
    await page.locator('#orbit-button').click();await page.waitForTimeout(150);
    await page.locator('#orbit-button').click();await waitMode('orbit');
    await page.keyboard.press('Escape');await waitMode('flight');
    assert.equal(await page.locator('#orbit-button').getAttribute('aria-pressed'),'false');

    await page.locator('#sound-button').click();
    await page.waitForFunction(()=>{const a=window.__ORBITAL__.diagnostics().audio;return a.state==='running'&&a.rms>.001;});
    const sound=await state();assert.equal(sound.audio.sources,5);assert.ok(sound.audio.peak<.2);assert.equal(sound.audio.error,null);
    if(name==='desktop'){
      await page.mouse.move(1100,460);await page.mouse.wheel(0,1000);
      await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.frequency>450);
      const active=await state();assert.ok(active.audio.frequency>sound.audio.frequency+100);
      await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.frequency<210,null,{timeout:15000});
    }
    await page.locator('#sound-button').click();await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.state==='suspended');
    assert.equal((await state()).audio.rms,0);assert.equal((await state()).audio.enabled,false);
    await page.locator('#sound-button').click();await page.locator('#sound-button').click();
    await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.state==='suspended');
    assert.equal((await state()).audio.sources,5,'sound toggles must reuse the existing audio graph');
    const final=await state();assert.equal(final.glError,0);assert.deepEqual(final.shaderErrors,[]);assert.ok(final.programs.every(p=>p.linked&&p.runnable));
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    const result={name,status:'PASS',records,defaultSilent:!initial.audio.created,audioRms:sound.audio.rms,returnPositionError:distance(returned.cameraPosition,departure.cameraPosition),errors,requests};
    report.push(result);console.log(JSON.stringify(result));await context.close();
  }
}finally{await fs.writeFile('.qa/exploration-report.json',JSON.stringify(report,null,2));await browser.close();}
