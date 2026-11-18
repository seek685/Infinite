import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Euler, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { applyGasCamera } from '../src/scene/camera.js';
import { renderProfile } from '../src/scene/viewport.js';
import { visibleSolarFraction } from '../src/immersion-math.js';
import { SUN_DIRECTION } from '../src/flight.js';
import { applyJourneyCamera, BLACK_HOLE_CENTER, GAS_END } from '../src/journey.js';

test('desktop camera extraction preserves every archived pose and mouse offset',()=>{
  const {poses}=JSON.parse(readFileSync(new URL('./fixtures/desktop-camera.json',import.meta.url)));
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
  for(const pose of poses){
    const camera=new PerspectiveCamera();
    applyGasCamera(camera,pose.progress,new Vector2(...pose.pointer),false,1440,900);
    camera.position.toArray().forEach((value,i)=>near(value,pose.position[i]));
    camera.quaternion.toArray().forEach((value,i)=>near(value,pose.quaternion[i]));
    near(camera.fov,pose.fov);
    for(const key of Object.keys(pose.view))assert.equal(camera.view[key],pose.view[key]);
  }
});

test('portrait wide shots keep the complete tilted outer ring inside the viewport',()=>{
  for(const [width,height]of [[320,568],[390,844],[430,932],[767,1024],[767,800]])for(const progress of [0,.75,1]){
    const camera=new PerspectiveCamera();
    applyGasCamera(camera,progress,new Vector2(),true,width,height);camera.updateMatrixWorld(true);
    const center=new Vector3().project(camera);
    assert.ok(center.y<0&&center.y>-.22,'planet is centered slightly below the midline');
    for(let i=0;i<360;i++){
      const angle=i*Math.PI/180;
      const point=new Vector3(Math.cos(angle)*6.1,0,Math.sin(angle)*6.1).applyEuler(new Euler(.13,0,.31)).project(camera);
      assert.ok(Math.abs(point.x)<.95,`${width}px / ${progress}: ring clipped at ${point.x}`);
      assert.ok(Math.abs(point.y)<.9,'outer ring must stay vertically visible');
    }
    if(progress===.75){
      const fraction=visibleSolarFraction(camera.position,SUN_DIRECTION.clone().multiplyScalar(220));
      assert.ok(fraction>.01&&fraction<.75,`eclipse must remain partial: ${fraction}`);
    }
  }
});

test('mobile particle and resolution budgets preserve the required effects',()=>{
  const desktop=renderProfile(1440,3,false),phone=renderProfile(390,3,true),landscape=renderProfile(844,3,true);
  assert.equal(desktop.ringParticles,96000);assert.equal(desktop.rocks,1800);
  assert.ok(phone.ringParticles>=20000&&phone.ringParticles<desktop.ringParticles);
  assert.ok(phone.warpStreaks>=1000&&phone.warpStreaks<desktop.warpStreaks);
  assert.deepEqual(phone,landscape,'rotating a phone keeps its compact particle budget');
  for(const width of [320,767,768,1440])for(const dpr of [.8,1,2,3,4]){
    const profile=renderProfile(width,dpr,false);
    assert.ok(profile.pixelRatio<=Math.min(dpr,2));
    assert.equal(profile.compact,width<768);
  }
});

test('the mobile departure lens continues into the warp without a framing jump',()=>{
  globalThis.innerWidth=390;globalThis.innerHeight=844;
  const departure=new PerspectiveCamera(),camera=new PerspectiveCamera(),pointer=new Vector2();
  applyGasCamera(departure,1,pointer,true,390,844);
  applyJourneyCamera(camera,departure,GAS_END+1e-7,0,pointer,true);
  assert.ok(camera.position.distanceTo(departure.position)<1e-8);
  assert.ok(camera.quaternion.angleTo(departure.quaternion)<1e-7);
  assert.ok(Math.abs(camera.fov-departure.fov)<1e-8);
  assert.ok(Math.abs(camera.view.offsetY-departure.view.offsetY)<1e-8);
});

test('portrait black-hole shots leave the upper caption region clear',()=>{
  for(const [width,height]of [[320,568],[390,844],[767,1024]]){
    globalThis.innerWidth=width;globalThis.innerHeight=height;
    const departure=new PerspectiveCamera(),camera=new PerspectiveCamera(),pointer=new Vector2();
    applyGasCamera(departure,1,pointer,true,width,height);
    for(const progress of [6/7,1]){
      applyJourneyCamera(camera,departure,progress,0,pointer,true);camera.updateMatrixWorld(true);
      const center=BLACK_HOLE_CENTER.clone().project(camera);
      assert.ok(Math.abs(center.x)<.001);
      assert.ok(center.y<-.20&&center.y>-.28,'black hole belongs below the caption');
    }
  }
});
