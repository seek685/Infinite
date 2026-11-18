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
await fs.mkdir('.qa',{recursive:true});
const browser=await chromium.launch({executablePath,headless:true});
const report=[];
const baseURL=process.env.PREVIEW_URL||'http://127.0.0.1:5173/';
const cases=[
  {name:'desktop',viewport:{width:1440,height:900},deviceScaleFactor:1},
  {name:'mobile',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true},
  {name:'small-mobile',viewport:{width:320,height:568},deviceScaleFactor:2,isMobile:true,hasTouch:true},
  {name:'wide-portrait',viewport:{width:767,height:1024},deviceScaleFactor:2,isMobile:true,hasTouch:true},
  {name:'landscape',viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true},
  {name:'reduced-motion',viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'},
];
try{
  for(const settings of cases){
    const {name,...options}=settings;
    const context=await browser.newContext(options),page=await context.newPage();
    const errors=[],warnings=[],failedRequests=[],navigations=[];
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());if(message.type()==='warning')warnings.push(message.text());});
    page.on('requestfailed',request=>failedRequests.push(`${request.failure()?.errorText} ${request.url()}`));
    page.on('response',response=>{if(response.status()>=400)failedRequests.push(`${response.status()} ${response.url()}`);});
    await page.goto(baseURL,{waitUntil:'networkidle',timeout:60000});
    await page.waitForFunction(()=>window.__ORBITAL__,null,{timeout:60000});
    await page.waitForTimeout(1100);
    const initial=await page.evaluate(()=>window.__ORBITAL__.diagnostics());
    assert.equal(initial.scrollHeight,initial.viewportHeight*8,'page should be exactly 800vh');
    assert.equal(await page.locator('.flight-navigation [data-stop]').count(),8);
    assert.ok(initial.particleCount>=20000);assert.ok(initial.bloom);
    assert.equal(initial.nebulaLayers,12);
    assert.ok(initial.moonRadius>.2&&initial.moonRadius<.5);
    assert.ok(initial.probeScale<.05);
    assert.equal(initial.solarVisibility,0,'the sun is behind the viewer in the approach');
    assert.equal(initial.audio.created,false,'audio must only be created by a user gesture');
    if(name==='reduced-motion')assert.ok(initial.paused);
    let motionPeak=null;
    if(name==='desktop'){
      await page.mouse.move(1100,240);await page.waitForTimeout(900);
      const moved=await page.evaluate(()=>window.__ORBITAL__.diagnostics().cameraPosition);
      assert.ok(moved.some((x,i)=>Math.abs(x-initial.cameraPosition[i])>.005),'mouse parallax must move the camera');
      await page.mouse.wheel(0,700);await page.waitForTimeout(300);
      motionPeak=await page.evaluate(()=>({warp:window.__ORBITAL__.diagnostics().warp,velocity:window.__ORBITAL__.diagnostics().telemetry.velocity}));
      assert.ok(motionPeak.warp>.03,'fast scrolling must stretch the background stars');
      assert.ok(motionPeak.velocity>1,'the velocity readout must reflect camera travel');
      await page.waitForTimeout(2000);
      assert.ok((await page.evaluate(()=>window.__ORBITAL__.diagnostics().progress))>.02,'native wheel must advance camera');
      await page.mouse.move(720,450);
      await page.waitForFunction(()=>{const d=window.__ORBITAL__.diagnostics();return d.warp<.015&&d.telemetry.velocity<.2;},null,{timeout:15000});
    }
    const shots=[];
    for(const [index,p]of Array.from({length:8},(_,i)=>i/7).entries()){
      await page.evaluate(p=>window.__ORBITAL__.seek(p),p);
      await page.waitForFunction(p=>Math.abs(window.__ORBITAL__.diagnostics().progress-p)<.001,p,{timeout:15000});
      await page.waitForTimeout(250);
      const state=await page.evaluate(()=>{
        const caption=document.querySelector('.film-caption').getBoundingClientRect();
        const nav=document.querySelector('.navigation').getBoundingClientRect();
        const footer=document.querySelector('.telemetry').getBoundingClientRect();
        const readouts=document.querySelector('.flight-readouts').getBoundingClientRect();
        const hudOverlap=readouts.left<caption.right&&readouts.right>caption.left&&readouts.top<caption.bottom&&readouts.bottom>caption.top;
        return {...window.__ORBITAL__.diagnostics(),layout:{caption:{top:caption.top,bottom:caption.bottom,width:caption.width,height:caption.height},navBottom:nav.bottom,footerTop:footer.top,readoutsBottom:readouts.bottom,hudOverlap,overflow:document.documentElement.scrollWidth>innerWidth,viewportArea:innerWidth*innerHeight}};
      });
      assert.equal(state.glError,0,'WebGL error');assert.equal(state.contextLost,false);
      assert.deepEqual(state.shaderErrors,[]);assert.ok(state.programs.every(p=>p.linked&&p.runnable));
      assert.equal(state.caption,index,'chapter should match flight progress');
      assert.equal(state.layout.overflow,false,'no horizontal page overflow');
      assert.ok(state.layout.caption.top>state.layout.navBottom,'caption overlaps navigation');
      assert.ok(state.layout.caption.bottom<state.layout.footerTop,'caption overlaps footer');
      assert.ok(state.layout.caption.width*state.layout.caption.height/state.layout.viewportArea<.15,'caption occupies more than 15% of the viewport');
      assert.equal(state.layout.hudOverlap,false,'new telemetry overlaps the existing caption');
      assert.ok(state.layout.readoutsBottom<state.layout.footerTop,'new telemetry overlaps the footer');
      assert.ok(Object.values(state.telemetry).every(Number.isFinite));
      assert.ok(state.telemetry.altitude>0&&state.telemetry.temperature>0);
      assert.ok(Math.hypot(...state.moonPosition)>6.1,'the moon belongs to the distant orbit');
      assert.ok(Math.hypot(...state.probePosition)>2.93&&Math.hypot(...state.probePosition)<3.8);
      if(index===3)assert.ok(state.solarVisibility>.01&&state.solarVisibility<.75,'the eclipse must expose a partial solar crescent');
      if(name==='reduced-motion')assert.equal(state.warp,0);
      if(index<5){assert.equal(state.journey.jump,0);assert.equal(state.journey.blackHoleVisible,false);}
      if(index===5){
        assert.ok(state.journey.jump>.99);assert.ok(state.journey.streakCount>=1000);
        assert.equal(state.journey.planetVisible,false);assert.ok(await page.locator('#orbit-button').isDisabled());
        assert.ok(name==='reduced-motion'?state.cameraFov<60:state.cameraFov>95);
      }
      if(index>=6){assert.equal(state.journey.jump,0);assert.equal(state.journey.reveal,1);assert.ok(state.journey.blackHoleVisible);}
      await page.screenshot({path:`.qa/${name}-${index}.png`});
      shots.push({p,camera:state.cameraPosition,fov:state.cameraFov,journey:state.journey,frameMs:Math.round(state.frameAverage*10)/10,programs:state.programs.length,pixelRatio:state.pixelRatio,solarVisibility:state.solarVisibility,telemetry:state.telemetry});
    }
    await page.locator('#restart').click();
    await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().progress<.005,null,{timeout:15000});
    assert.equal(await page.locator('#chapter-number').textContent(),'01 / 08');
    // The former pause control is now the explicitly requested opt-in SOUND switch.
    await page.locator('#sound-button').click();
    await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.state==='running');
    assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');
    await page.locator('#sound-button').click();
    await page.waitForFunction(()=>window.__ORBITAL__.diagnostics().audio.state==='suspended');
    if(name==='reduced-motion'){
      const before=await page.evaluate(()=>window.__ORBITAL__.diagnostics().moonPosition);
      await page.waitForTimeout(450);
      assert.deepEqual(await page.evaluate(()=>window.__ORBITAL__.diagnostics().moonPosition),before,'reduced motion must stop the moon orbit');
    }
    await page.locator('.flight-navigation [data-stop="3"]').click();
    await page.waitForFunction(()=>Math.abs(window.__ORBITAL__.diagnostics().progress-3/7)<.005,null,{timeout:15000});
    if(failedRequests.length)console.log(JSON.stringify({name,navigations,failedRequests}));
    assert.deepEqual(errors,[],'browser console errors');assert.deepEqual(failedRequests,[],'failed resources');
    const result={name,status:'PASS',particles:initial.particleCount,rocks:initial.rockCount,errors,warnings,failedRequests,motionPeak,shots};
    report.push(result);console.log(JSON.stringify(result));await context.close();
  }
}finally{
  await fs.writeFile('.qa/browser-report.json',JSON.stringify(report,null,2));
  await browser.close();
}
