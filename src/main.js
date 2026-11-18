import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { Vector2, Vector3, MathUtils, PerspectiveCamera } from 'three';
import { createUniverse } from './universe.js';
import { applyGasCamera } from './scene/camera.js';
import { preloader } from './ui/preloader.js';
import { createReader } from './ui/reader.js';
import { readTelemetry, dampWarp, KM_PER_UNIT, MISSION_TIME_SCALE } from './immersion-math.js';
import { createExploration } from './exploration.js';
import { createSpaceAudio } from './space-audio.js';
import { CHAPTER_COUNT, GAS_END, BLACK_HOLE_CENTER, HORIZON_RADIUS, gasProgress, journeyState, applyJourneyCamera } from './journey.js';

gsap.registerPlugin(ScrollTrigger);
preloader.advance(24);
const canvas=document.querySelector('#universe');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
const chapters=[
  ['THE APPROACH','Touch<br>the infinite.','向未知，靠近一点。','在光抵达之前，<br>让好奇心先行。'],
  ['THE RING PASSAGE','Between<br>worlds.','穿过亿万颗沉默的星尘。','每一道间隙，<br>都曾是一段漫长的时间。'],
  ['THE LIVING HORIZON','A world<br>in motion.','风暴之上，是另一种宁静。','漂浮的云海没有终点，<br>只有永不停歇的流动。'],
  ['THE SILENT ECLIPSE','Where light<br>holds its breath.','在黑暗的边缘，目睹光。','当一切归于寂静，<br>宇宙显露它的轮廓。'],
  ['THE RETURN','Still<br>only the beginning.','你所见的，只是开始。','带着新的目光，<br>再次望向无垠。'],
  ['WARP JUMP','Beyond<br>the light.','让距离，失去意义。','跨过星与星的沉默，<br>驶向时空的另一端。'],
  ['THE SINGULARITY','Where time<br>falls silent.','凝视，光也无法逃离的边界。','炽热光环的中央，<br>藏着宇宙最深的寂静。'],
  ['THE LAST HORIZON','Nothing ends.<br>It becomes.','宇宙的尽头，仍是开始。','最后一道光之后，<br>是尚未抵达的无限。'],
];
const title=document.querySelector('#chapter-title'),kicker=document.querySelector('#chapter-kicker'),subtitle=document.querySelector('#chapter-subtitle'),note=document.querySelector('#chapter-note'),caption=document.querySelector('.film-caption'),restart=document.querySelector('#restart'),number=document.querySelector('#chapter-number'),progressBar=document.querySelector('#flight-progress'),percent=document.querySelector('#flight-percent');
const spaceAudio=createSpaceAudio(document.querySelector('#sound-button'));
const pointer=new Vector2(),dampedPointer=new Vector2();
const flight={progress:0};
const departureCamera=new PerspectiveCamera(),telemetryPosition=new Vector3();
let activeChapter=-1,paused=reducedMotion.matches,universe,lenis,trigger,elapsed=0,lastTime=0,raf=0,frameCount=0,frameAverage=16.7,resizeTimer;
let renderedProgress=-1,renderDirty=true;
const renderedPointer=new Vector2();
const previousCamera=new Vector3();
const altitudeReadout=document.querySelector('#altitude-value'),velocityReadout=document.querySelector('#velocity-value'),temperatureReadout=document.querySelector('#temperature-value');
let previousProgress=0,cameraSampled=false,velocity=0,warpStrength=0,telemetry={},lastTelemetryPaint=0;
let exploration,frozenProgress=0;
let reading=false, rotationRate=1, lastReadingPaint=0, refreshOnResume=false;
const orbitButton=document.querySelector('#orbit-button');

function fail(error){
  preloader.fail(error);
}
const smoothstep=(a,b,x)=>{const t=MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function updateHUD(progress){
  const index=Math.min(CHAPTER_COUNT-1,Math.round(progress*(CHAPTER_COUNT-1)));
  const opacity=1-smoothstep(.29,.49,Math.abs(progress*(CHAPTER_COUNT-1)-index));
  if(index!==activeChapter){
    activeChapter=index;caption.dataset.chapter=String(index);
    const data=chapters[index];kicker.textContent=data[0];title.innerHTML=data[1];subtitle.textContent=data[2];note.innerHTML=data[3];number.textContent=`0${index+1} / 08`;
    restart.hidden=index!==CHAPTER_COUNT-1;
    document.querySelectorAll('.flight-navigation button').forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  }
  caption.style.opacity=opacity;
  caption.style.translate=`0 ${(1-opacity)*10}px`;
  progressBar.style.transform=`scaleX(${progress})`;
  percent.textContent=String(Math.round(progress*100)).padStart(3,'0');
  document.querySelector('.scroll-invitation').style.opacity=1-smoothstep(.90,1,progress);
}
function travelTo(progress){
  if(exploration?.active){exploration.exit(()=>travelTo(progress));return;}
  const y=progress*(document.documentElement.scrollHeight-innerHeight);
  if(lenis)lenis.scrollTo(y,{duration:1.7,immediate:reducedMotion.matches});
  else window.scrollTo({top:y,behavior:'instant'});
}
document.querySelectorAll('[data-stop]').forEach(button=>button.addEventListener('click',()=>travelTo(Number(button.dataset.stop)/(CHAPTER_COUNT-1))));
restart.addEventListener('click',()=>travelTo(0));
window.addEventListener('pointermove',event=>{
  if(reading||!finePointer.matches||reducedMotion.matches||exploration?.active)return;
  pointer.set(event.clientX/innerWidth-.5,event.clientY/innerHeight-.5);
},{passive:true});
document.addEventListener('pointerleave',()=>pointer.set(0,0));

function configureScroll(){
  trigger?.kill();lenis?.destroy();lenis=null;
  if(!reducedMotion.matches)lenis=new Lenis({lerp:.07,smoothWheel:true,syncTouch:false});
  lenis?.on('scroll',ScrollTrigger.update);
  trigger=gsap.fromTo(flight,{progress:0},{progress:1,ease:'none',scrollTrigger:{trigger:'.flight-scroll',start:'top top',end:'bottom bottom',scrub:reducedMotion.matches?true:1.8,invalidateOnRefresh:true}}).scrollTrigger;
  ScrollTrigger.refresh();
  if(reading){
    trigger.disable(false);lenis?.stop();
    trigger.animation.progress(frozenProgress);flight.progress=frozenProgress;
  }
}
reducedMotion.addEventListener('change',()=>{paused=reducedMotion.matches;pointer.set(0,0);renderDirty=true;if(!reading&&exploration?.active)exploration.exit(configureScroll);else configureScroll();});

function lockFlight(resetPointer=true){
  frozenProgress=flight.progress;trigger?.disable(false);lenis?.stop();
  if(resetPointer){pointer.set(0,0);dampedPointer.set(0,0);}
  renderDirty=true;
}
function resumeFlight(){
  const y=frozenProgress*(document.documentElement.scrollHeight-innerHeight);
  lenis?.start();
  if(lenis)lenis.scrollTo(y,{immediate:true,force:true});else window.scrollTo(0,y);
  // A paused scrub can still have an old destination if the reader opened mid-flight.
  const scrub=trigger?.getTween();
  if(scrub)scrub.resetTo('totalProgress',frozenProgress,frozenProgress).pause();
  flight.progress=frozenProgress;trigger?.animation.progress(frozenProgress);trigger?.enable(false,false);
  if(refreshOnResume){trigger?.refresh();refreshOnResume=false;}
  ScrollTrigger.update();previousProgress=flight.progress;renderDirty=true;
}
function setReading(open){
  reading=open;
  if(!exploration)return;
  exploration.setSuspended(open);
  if(open){
    if(!exploration.active)lockFlight(false);
    lastReadingPaint=performance.now();
  }else{
    if(!exploration.active)resumeFlight();
    lastTime=performance.now();cameraSampled=false;renderDirty=true;
  }
}
function applyFlightCamera(camera){
  if(flight.progress<=GAS_END)applyGasCamera(camera,gasProgress(flight.progress),dampedPointer,reducedMotion.matches);
  else{
    applyGasCamera(departureCamera,1,dampedPointer,reducedMotion.matches);
    applyJourneyCamera(camera,departureCamera,flight.progress,elapsed,dampedPointer,reducedMotion.matches);
  }
}

function draw(timestamp){
  const delta=Math.min((timestamp-lastTime)/1000||.016,.05);lastTime=timestamp;
  if(reading){
    const interval=1000/(innerWidth<768?8:12);
    const sincePaint=timestamp-lastReadingPaint;
    const animateBackground=!paused&&(!exploration.active||rotationRate>0);
    if(renderDirty||(animateBackground&&sincePaint>=interval)){
      const step=Math.min(Math.max(0,sincePaint)/1000,.25);
      // Settle a held observation to rest so a long article cannot move the landmark away.
      rotationRate=MathUtils.damp(rotationRate,exploration.active?0:.12,4,step);
      if(exploration.active&&rotationRate<.005)rotationRate=0;
      if(!paused)elapsed+=step*rotationRate;
      warpStrength=dampWarp(warpStrength,0,step,paused);
      universe.render(elapsed,step,warpStrength,flight.progress);
      spaceAudio.update(0,universe.camera.position,elapsed);
      lastReadingPaint=timestamp;renderDirty=false;
    }
    raf=requestAnimationFrame(draw);return;
  }
  lenis?.raf(timestamp);
  const damping=1-Math.exp(-delta*2.8);
  dampedPointer.lerp(pointer,damping);
  const camera=universe.camera;
  const journey=journeyState(flight.progress);
  orbitButton.disabled=!exploration.active&&!journey.canOrbit;
  if(exploration.active)exploration.update(delta,elapsed);else applyFlightCamera(camera);
  const speed=cameraSampled?camera.position.distanceTo(previousCamera)/delta*KM_PER_UNIT/MISSION_TIME_SCALE:0;
  velocity=MathUtils.lerp(velocity,speed,1-Math.exp(-delta*6));
  if(journey.reveal>.99){
    telemetryPosition.copy(camera.position).sub(BLACK_HOLE_CENTER);telemetry=readTelemetry(telemetryPosition,velocity);
    telemetry.altitude=Math.max(0,telemetryPosition.length()-HORIZON_RADIUS)*KM_PER_UNIT;
    telemetry.temperature=110+2400/Math.max(1,telemetryPosition.length()/HORIZON_RADIUS);
  }else telemetry=readTelemetry(camera.position,Math.max(velocity,journey.jump*1800000));
  const nextWarp=dampWarp(warpStrength,(flight.progress-previousProgress)/delta*7/4,delta,paused||reducedMotion.matches);
  if(Math.abs(nextWarp-warpStrength)>.001)renderDirty=true;
  warpStrength=nextWarp;previousProgress=flight.progress;previousCamera.copy(camera.position);cameraSampled=true;
  spaceAudio.update(Math.max(journey.jump,warpStrength,MathUtils.smoothstep(velocity,2,240)*.65),camera.position,elapsed);
  if(timestamp-lastTelemetryPaint>100){
    altitudeReadout.textContent=Math.round(telemetry.altitude).toLocaleString('en-US');
    velocityReadout.textContent=telemetry.velocity.toFixed(1);temperatureReadout.textContent=telemetry.temperature.toFixed(1);
    lastTelemetryPaint=timestamp;
  }
  if(!paused){rotationRate=MathUtils.damp(rotationRate,1,4,delta);elapsed+=delta*rotationRate;}
  if(!paused||exploration.active||renderDirty||Math.abs(renderedProgress-flight.progress)>1e-6||renderedPointer.distanceToSquared(dampedPointer)>1e-7){
    universe.render(elapsed,delta,warpStrength,flight.progress);updateHUD(flight.progress);
    renderedProgress=flight.progress;renderedPointer.copy(dampedPointer);renderDirty=false;
  }
  exploration.projectHotspots(elapsed,flight.progress<=GAS_END+.005);
  frameCount++;frameAverage=frameAverage*.98+delta*1000*.02;
  if(frameCount%360===0&&frameAverage>30)renderDirty=universe.reduceResolution()||renderDirty;
  raf=requestAnimationFrame(draw);
}
document.addEventListener('visibilitychange',()=>{
  cancelAnimationFrame(raf);
  if(!document.hidden&&universe){lastTime=performance.now();cameraSampled=false;raf=requestAnimationFrame(draw);}
});
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
    universe?.resize();renderDirty=true;
    if(reading){
      refreshOnResume=true;
      if(universe&&!exploration?.active)applyFlightCamera(universe.camera);
    }else ScrollTrigger.refresh();
  },160);
},{passive:true});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(raf);document.querySelector('.failure').hidden=false;document.querySelector('#failure-message').textContent='图形上下文已中断，请重新载入以恢复航行。';});

const reader=createReader(setReading);
try{
  universe=await createUniverse(canvas,preloader.advance);
  configureScroll();
  applyFlightCamera(universe.camera);
  exploration=createExploration({camera:universe.camera,canvas,anchors:universe.anchors,reducedMotion,lockFlight,resumeFlight,routePose:applyFlightCamera,
    orbitContext:()=>journeyState(flight.progress).offset>=1.88?{center:BLACK_HOLE_CENTER,minDistance:11,maxDistance:140}:null});
  if(reading)setReading(true);
  universe.render(0,0);
  if(universe.diagnostics().shaderErrors.length)throw new Error('着色器编译失败');
  preloader.advance(92);
  lastTime=performance.now();
  await new Promise((resolve,reject)=>{raf=requestAnimationFrame(timestamp=>{try{draw(timestamp);resolve();}catch(error){reject(error);}});});
  await preloader.complete();
  if(import.meta.env.DEV){
    window.__ORBITAL__={
      diagnostics:()=>({...universe.diagnostics(),preloader:preloader.diagnostics(),telemetry,exploration:exploration.diagnostics(),audio:spaceAudio.diagnostics(),progress:flight.progress,gasProgress:gasProgress(flight.progress),cameraPosition:universe.camera.position.toArray(),cameraFov:universe.camera.fov,cameraView:{...universe.camera.view},frameAverage,paused,reading,sceneTime:elapsed,caption:activeChapter,scrollHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight}),
      seek:progress=>{lenis?.scrollTo(progress*(document.documentElement.scrollHeight-innerHeight),{immediate:true});if(!lenis)window.scrollTo(0,progress*(document.documentElement.scrollHeight-innerHeight));},
    };
  }
}catch(error){fail(error);}

if(import.meta.hot)import.meta.hot.dispose(()=>{cancelAnimationFrame(raf);reader.dispose();lenis?.destroy();trigger?.kill();exploration?.dispose();spaceAudio.dispose();universe?.dispose();});
