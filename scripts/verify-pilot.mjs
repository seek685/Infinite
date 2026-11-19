import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { parsePost } from '../src/content/frontmatter.js';

const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const baseURL=process.env.PREVIEW_URL||'http://127.0.0.1:5173/';
const filenames=(await fs.readdir('src/posts')).filter(file=>file.endsWith('.md'));
const articles=await Promise.all(filenames.map(async file=>parsePost(file,await fs.readFile('src/posts/'+file,'utf8'))));
const browser=await chromium.launch({executablePath,headless:true});
await fs.mkdir('.qa',{recursive:true});
const errors=[];
async function ready(page){
  page.setDefaultTimeout(60000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('response',res=>{if(res.status()>=400)errors.push(res.status()+' '+res.url());});
  await page.goto(baseURL);
  await page.locator('body.ready #preloader[hidden]').waitFor({state:'attached'});
}
const phase=(page,mode)=>page.waitForFunction(mode=>document.querySelector('.pilot-hud')?.dataset.mode===mode,mode);
const ship=page=>page.evaluate(()=>window.__ORBITAL__?.pilot());
async function forwardToAction(page,text){
  await page.keyboard.down('w');
  try{await page.locator('.pilot-action:visible').filter({hasText:text}).waitFor();}
  finally{await page.keyboard.up('w');}
  await page.keyboard.press('f');
}

// Read the visible belt rock's moving position, then steer with the same keys a player uses.
async function reachBelt(page){
  const down=new Set(),until=Date.now()+35000;
  try{
    while(Date.now()<until){
      const s=await ship(page);
      if(s.lastContact==='rock')return;
      const [dx,dy,dz]=s.beltRock.map((coordinate,i)=>coordinate-s.position[i]);
      const yaw=Math.atan2(-dx,-dz)-s.yaw, pitch=Math.atan2(dy,Math.hypot(dx,dz))-s.pitch;
      const steering=Math.atan2(Math.sin(yaw),Math.cos(yaw))-s.yawRate/6;
      const climb=pitch-s.pitchRate/6;
      const want=new Set();
      if(Math.abs(steering)>.025)want.add(steering>0?'a':'d');
      if(Math.abs(climb)>.025)want.add(climb>0?'q':'e');
      if(Math.abs(yaw)<.14&&Math.abs(pitch)<.14)want.add('w');
      else want.add('s');
      for(const key of down)if(!want.has(key)){await page.keyboard.up(key);down.delete(key);}
      for(const key of want)if(!down.has(key)){await page.keyboard.down(key);down.add(key);}
      await page.waitForTimeout(35);
    }
    assert.fail('ship did not make contact with the rotating belt');
  }finally{for(const key of down)await page.keyboard.up(key);}
}
try {
  const desktop=await browser.newContext({viewport:{width:1040,height:650},deviceScaleFactor:1});
  const page=await desktop.newPage();
  await ready(page);
  assert.equal(await page.locator('.pilot-hud').count(),0,'no pilot world or HUD on the scroll route');
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/\/pilot[\/-]|ship\.glb/.test(new URL(entry.name).pathname))),false,'pilot assets stay off the default route');
  await page.locator('[data-stop="2"]').click();
  await page.waitForFunction(()=>document.querySelector('#chapter-number').textContent==='03 / 08');
  await page.waitForTimeout(2000);
  const before=await page.evaluate(()=>({y:scrollY,progress:window.__ORBITAL__?.diagnostics().progress}));
  await page.locator('#pilot-button').click();
  await phase(page,'cruising');
  const start=await ship(page);
  if(start){
    assert.equal(start.targets.length,articles.length+1);
    assert.equal(await page.evaluate(()=>window.__ORBITAL__.diagnostics().audio.created),false);
  }
  assert.equal(await page.locator('.pilot-contacts span').count(),articles.length+1);
  for(let i=0;i<articles.length+1;i++)await page.keyboard.press('r');
  await page.locator('.pilot-target strong').filter({hasText:'气态巨行星'}).waitFor();
  await page.keyboard.press('r');
  await page.screenshot({path:'.qa/pilot-flight.png'});
  await page.mouse.wheel(0,740);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>scrollY),before.y);
  await forwardToAction(page,'DOCK');
  await page.locator('#reader[open] #reader-title').filter({hasText:'造物'}).waitFor();
  await page.locator('.reader-toolbar [href="#about"]').click();
  await page.waitForFunction(()=>location.hash==='#about');
  await page.keyboard.press('Escape');
  await phase(page,'cruising');
  assert.equal(await page.locator('#pilot-button').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'pilot-button');
  await forwardToAction(page,'SCAN');
  await page.locator('#reader[open] .prose p').first().waitFor();
  const slug=await page.evaluate(()=>decodeURIComponent(location.hash.slice('#journal/'.length)));
  assert.equal(await page.locator('#reader-title').textContent(),articles.find(a=>a.slug===slug).title);
  const held=await ship(page);
  await page.keyboard.press('w');
  await page.mouse.wheel(0,470);
  if(held)assert.deepEqual((await ship(page)).position,held.position,'reading freezes the pilot');
  await page.keyboard.press('Escape');
  await page.locator('#reader').waitFor({state:'hidden'});
  await page.locator('#sound-button').click();
  await page.keyboard.down('Shift');await page.keyboard.down('w');await page.keyboard.down('d');
  if(start)await page.waitForFunction(()=>{
    const p=window.__ORBITAL__.pilot(),d=window.__ORBITAL__.diagnostics();
    return p.speed>1.45&&p.boost>.6&&p.bank<-.1&&d.cameraFov>57&&d.audio.engineHz>40;
  });
  else await page.waitForTimeout(900);
  await page.keyboard.up('d');await page.keyboard.up('w');await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await phase(page,'idle');
  await page.waitForFunction(()=>document.querySelector('#chapter-number').textContent==='03 / 08');
  if(start){
    const returned=await page.evaluate(()=>window.__ORBITAL__.diagnostics());
    assert.ok(Math.abs(returned.progress-before.progress)<.003);
    assert.equal(returned.audio.engineHz,0);assert.equal(returned.glError,0);assert.deepEqual(returned.shaderErrors,[]);
  }
  // Hit a real rotating belt rock in development and the atmosphere on a static preview.
  await page.locator('#pilot-button').click();await phase(page,'cruising');
  if(start)await reachBelt(page);
  else{
    await page.keyboard.down('Shift');await page.keyboard.down('w');
    await page.locator('.pilot-feedback').filter({hasText:'护盾'}).waitFor();
    await page.keyboard.up('w');await page.keyboard.up('Shift');
  }
  if(start)assert.ok(await page.evaluate(()=>window.__ORBITAL__.diagnostics().audio.shieldHits>0));
  await page.locator('#pilot-button').click();await phase(page,'idle');
  await page.locator('[data-stop="7"]').click();
  await page.waitForFunction(()=>document.querySelector('#chapter-number').textContent==='08 / 08');
  await page.waitForTimeout(1800);
  await page.locator('#pilot-button').click();await phase(page,'cruising');
  await page.keyboard.press('Escape');await phase(page,'idle');
  await page.waitForFunction(()=>document.querySelector('#chapter-number').textContent==='08 / 08');
  await page.locator('#orbit-button').click();
  await page.waitForFunction(()=>document.body.classList.contains('exploring'));
  await page.locator('#pilot-button').click();await phase(page,'cruising');
  await page.keyboard.press('Escape');await phase(page,'idle');
  await desktop.close();
  console.log('Desktop passed: eight-stop route, docking, About, scanning '+slug+', reading isolation, boost, shield, audio and free orbit.');

  const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const mobile=await phone.newPage();await ready(mobile);
  await mobile.locator('#pilot-button').tap();await phase(mobile,'cruising');
  await mobile.screenshot({path:'.qa/pilot-mobile.png'});
  const cdp=await phone.newCDPSession(mobile);
  const pad=await mobile.locator('.pilot-stick').boundingBox(),throttle=await mobile.locator('[data-drive="boost"]').boundingBox();
  const stick={x:pad.x+pad.width*.81,y:pad.y+pad.height*.31,id:1};
  const boost={x:throttle.x+throttle.width*.5,y:throttle.y+throttle.height*.5,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick,boost]});
  await mobile.waitForFunction(()=>Number(document.querySelector('.pilot-velocity b').textContent)>22);
  const touched=await ship(mobile);
  if(touched){assert.ok(touched.bank<-.03);assert.ok(touched.pitch>0);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await mobile.locator('#pilot-button').tap();await phase(mobile,'idle');
  await mobile.locator('#pilot-button').tap();await phase(mobile,'cruising');
  const thrust=await mobile.locator('[data-drive="thrust"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:thrust.x+thrust.width/2,y:thrust.y+thrust.height/2}]});
  await mobile.locator('.pilot-action:visible').filter({hasText:'DOCK'}).waitFor();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await mobile.locator('.pilot-action').tap();await mobile.locator('#reader[open] #reader-title').filter({hasText:'造物'}).waitFor();
  await mobile.locator('#reader-close').tap();await phase(mobile,'cruising');
  assert.equal(await mobile.evaluate(()=>scrollY),0);
  await cdp.detach();await phone.close();
  assert.deepEqual(errors,[]);
  console.log('Touch passed: two-finger steering and boost, release, tap-to-dock, drawer return. No console or resource errors.');
}finally{await browser.close();}
