import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { sampleFlight, SUN_DIRECTION, PLANET_RADIUS } from '../src/flight.js';
import { visibleSolarFraction,offsetEclipseCamera,readTelemetry,dampWarp,KM_PER_UNIT } from '../src/immersion-math.js';

test('the planet completely masks an aligned sun; an offset reveals only its edge',()=>{
  const sun=SUN_DIRECTION.clone().multiplyScalar(220);
  const camera=sampleFlight(.75).position;
  assert.equal(visibleSolarFraction(camera,sun),0);
  for(const scale of [1,1.45]){
    const shifted=offsetEclipseCamera(camera.clone().multiplyScalar(scale),.75);
    const visible=visibleSolarFraction(shifted,sun);
    assert.ok(visible>.01&&visible<.5,`visible solar area: ${visible}`);
    assert.ok(shifted.length()>PLANET_RADIUS*1.075);
  }
  const opposite=new Vector3(10,12,0);
  assert.equal(visibleSolarFraction(opposite,sun),1);
});
test('eclipse drift leaves other principal shots intact and remains continuous',()=>{
  for(const p of [0,.25,.5,1]){
    const position=sampleFlight(p).position;
    assert.ok(offsetEclipseCamera(position.clone(),p).distanceTo(position)<1e-8);
  }
  let previous;
  for(let i=0;i<=4000;i++){
    const position=offsetEclipseCamera(sampleFlight(i/4000).position,i/4000);
    assert.ok(position.length()>PLANET_RADIUS*1.075);
    if(previous)assert.ok(position.distanceTo(previous)<.09);
    previous=position;
  }
});
test('readouts derive from camera altitude, illumination and motion',()=>{
  const day=readTelemetry(SUN_DIRECTION.clone().multiplyScalar(4),25);
  const night=readTelemetry(SUN_DIRECTION.clone().multiplyScalar(-4),0);
  assert.equal(day.altitude,(4-PLANET_RADIUS)*KM_PER_UNIT);
  assert.equal(day.velocity,25);assert.ok(day.temperature>night.temperature);
  assert.ok(readTelemetry(new Vector3(0,0,12),0).altitude>day.altitude);
});
test('warp stretches with fast motion, relaxes at rest and respects reduced motion',()=>{
  let warp=0;
  for(let i=0;i<30;i++)warp=dampWarp(warp,.8,1/60);
  assert.ok(warp>.95);
  for(let i=0;i<180;i++)warp=dampWarp(warp,0,1/60);
  assert.ok(warp<.001);
  assert.equal(dampWarp(1,.8,1/60,true),0);
});
