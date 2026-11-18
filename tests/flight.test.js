import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { sampleFlight, PLANET_RADIUS, SUN_DIRECTION } from '../src/flight.js';

test('the full flight remains outside the outer atmosphere and has continuous motion',()=>{
  let previous=null;
  for(let i=0;i<=4000;i++){
    const frame=sampleFlight(i/4000);
    assert.ok(frame.position.length()>PLANET_RADIUS*1.075+.08,'camera intersects atmosphere');
    assert.ok(frame.position.distanceTo(frame.target)>.1,'camera loses its look direction');
    assert.ok(frame.fov>=35&&frame.fov<=75,'lens outside cinematic range');
    assert.ok(frame.position.toArray().every(Number.isFinite));
    if(previous)assert.ok(frame.position.distanceTo(previous)<.08,'camera path jumps');
    previous=frame.position.clone();
  }
});
test('eclipse positions the planet between the camera and the directional sun',()=>{
  const view=sampleFlight(.75).position.normalize();
  assert.ok(view.dot(SUN_DIRECTION)<-.9999);
});
test('fly-through actually crosses the ring plane, within its outer radius',()=>{
  const normal=new Vector3(0,1,0).applyAxisAngle(new Vector3(0,0,1),.31).applyAxisAngle(new Vector3(1,0,0),.13);
  assert.ok(sampleFlight(.17).position.dot(normal)>0);
  assert.ok(sampleFlight(.33).position.dot(normal)<0);
  let crossed=false;
  for(let i=170;i<330;i++){
    const a=sampleFlight(i/1000).position,b=sampleFlight((i+1)/1000).position;
    if(a.dot(normal)*b.dot(normal)<=0){assert.ok(a.length()>3.8&&a.length()<6.1);crossed=true;}
  }
  assert.ok(crossed);
});
