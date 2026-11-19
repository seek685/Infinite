import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const executablePath=process.env.BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
await fs.mkdir('.qa',{recursive:true});
// Build with actual public assets so Vite's presence checks and production chunk splitting are exercised.
const root=await fs.mkdtemp(path.resolve('.qa','pilot-glb-')),configFile=path.join(root,'vite.config.js');
assert.equal(path.dirname(root),path.resolve('.qa'));
let server,browser;
try{
  await fs.mkdir(path.join(root,'public/models'),{recursive:true});
  await fs.mkdir(path.join(root,'tests'));
  await Promise.all([
    fs.cp('src',path.join(root,'src'),{recursive:true}),fs.copyFile('index.html',path.join(root,'index.html')),
    fs.copyFile('vite.config.js',configFile),fs.cp('public/draco',path.join(root,'public/draco'),{recursive:true}),
    fs.copyFile('tests/model-browser.js',path.join(root,'tests/model-browser.js')),
    ...['ship','station'].map(kind=>fs.copyFile('tests/fixtures/pilot-model.glb',path.join(root,'public/models',kind+'.glb'))),
  ]);
  const check=path.join(root,'model-check.html');
  await fs.writeFile(check,'<!doctype html><link rel="icon" href="data:,"><script type="module" src="./tests/model-browser.js"></script>');
  await build({root,configFile,logLevel:'error',build:{rolldownOptions:{input:{site:path.join(root,'index.html'),check}}}});
  server=await preview({root,configFile,logLevel:'error',preview:{host:'127.0.0.1',port:0}});
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({executablePath,headless:true});
  // Each fresh context independently fetches the decoder and never sees a cached fixture.
  for(const broken of [[],['ship'],['station'],['ship','station']]){
    const ctx=await browser.newContext();const page=await ctx.newPage(),errors=[],urls=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>urls.push(r.url()));
    for(const kind of broken)await page.route('**/models/'+kind+'.glb',r=>r.fulfill({contentType:'model/gltf-binary',body:'invalid GLB'}));
    await page.goto(origin+'/model-check.html');
    await page.waitForFunction(()=>typeof window.checkFlightModels==='function');
    const result=await page.evaluate(()=>window.checkFlightModels());
    assert.equal(result.startsWithFallback,true);
    for(const kind of ['ship','station']){
      assert.equal(result.models[kind],broken.includes(kind)?'procedural':'glb');
      assert.equal(result[kind+'Fallback'],broken.includes(kind));assert.ok(urls.includes(origin+'/models/'+kind+'.glb'));
    }
    if(!broken.includes('ship')){
      assert.equal(result.geometry,6);assert.equal(result.physical,true);assert.equal(result.emission,3.2);
      assert.equal(result.sharedReflection,true);assert.ok(result.reflectedLight>100,'metal reflects measurable light without direct lighting');
      assert.ok(result.socketTravel>.02,'the engine animation moves its socket');
    }
    if(!broken.includes('station')){
      assert.ok(result.portError<1e-5&&result.portNormalError<1e-5);assert.ok(Math.abs(result.gateClearance-.37)<1e-5);
    }
    for(const key of ['jetError','trailError','scanError','loopError'])assert.ok(result[key]<1e-5,key+' '+result[key]);
    if(broken.length<2)for(const name of ['draco_wasm_wrapper.js','draco_decoder.wasm'])assert.ok(urls.includes(origin+'/draco/'+name));
    assert.ok(urls.every(url=>!/^https?:/.test(url)||new URL(url).origin===origin),'all assets are same-origin');
    assert.equal(result.glError,0);assert.equal(result.shadersCompiled,true);assert.deepEqual(errors,[]);
    console.log('GLB probe',result.models,'WebGL OK');await ctx.close();
  }
  // Exercise real gameplay, including the fixed radar berth and both reader destinations with imported models.
  const page=await browser.newPage({viewport:{width:900,height:560},reducedMotion:'reduce'});
  page.setDefaultTimeout(60000);
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  await page.goto(origin);await page.locator('body.ready #preloader[hidden]').waitFor({state:'attached'});
  assert.ok(!requests.some(url=>/\/models\/|\/draco\/|\/pilot-loaders-/.test(url)),'the scroll route is independent of pilot assets');
  await page.locator('#pilot-button').click();
  const cruise=()=>page.waitForFunction(()=>document.querySelector('.pilot-hud')?.dataset.mode==='cruising');
  await cruise();
  async function interact(prompt){
    await page.keyboard.down('w');
    try{await page.locator('.pilot-action:visible').filter({hasText:prompt}).waitFor();}
    finally{await page.keyboard.up('w');}
    await page.keyboard.press('f');
  }
  await interact('DOCK');await page.locator('#reader[open] #reader-title').filter({hasText:'造物'}).waitFor();
  await page.keyboard.press('Escape');await cruise();
  await interact('SCAN');await page.locator('#reader[open] .prose p').first().waitFor();
  assert.ok(requests.includes(origin+'/draco/draco_decoder.wasm'));assert.deepEqual(errors,[]);
  console.log('Imported-model flight, docking, project drawer and journal scan OK');
}finally{
  try{await browser?.close();}finally{
    try{if(server)await server.close();}finally{await fs.rm(root,{recursive:true,force:true});}
  }
}
