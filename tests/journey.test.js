import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { sampleFlight } from '../src/flight.js';
import { GAS_END,BLACK_HOLE_CENTER,gasProgress,journeyState,applyJourneyCamera } from '../src/journey.js';

test('the first five chapter positions still address the complete original flight',()=>{
  for(let i=0;i<=4;i++)assert.ok(Math.abs(gasProgress(i/7)-i/4)<1e-12);
  for(let pixels=0;pixels<=3600;pixels+=19){
    const old=sampleFlight(pixels/3600),mapped=sampleFlight(gasProgress(pixels/6300));
    assert.ok(old.position.distanceTo(mapped.position)<1e-10);
    assert.ok(Math.abs(old.fov-mapped.fov)<1e-10);
  }
});

test('jump is confined to chapter six and fully resolves before the black-hole shots',()=>{
  for(const p of [0,1/7,2/7,3/7,4/7]){
    const state=journeyState(p);assert.equal(state.jump,0);assert.equal(state.reveal,0);assert.ok(state.planetVisible);
  }
  assert.ok(journeyState(5/7).jump>.99);assert.equal(journeyState(5/7).planetVisible,false);
  for(const p of [6/7,1]){assert.equal(journeyState(p).jump,0);assert.equal(journeyState(p).reveal,1);assert.ok(journeyState(p).canOrbit);}
});

test('the interstellar camera is continuous, begins at the original ending, and pulls away for the epilogue',()=>{
  globalThis.innerWidth=1440;globalThis.innerHeight=900;
  const last=sampleFlight(1),departure=new PerspectiveCamera(),camera=new PerspectiveCamera();
  departure.position.copy(last.position);departure.lookAt(last.target);departure.fov=last.fov;
  applyJourneyCamera(camera,departure,GAS_END,0,new Vector2(),false);
  assert.ok(camera.position.distanceTo(departure.position)<1e-10);assert.equal(camera.fov,departure.fov);
  let previous=departure.position.clone();
  for(let i=0;i<=3000;i++){
    applyJourneyCamera(camera,departure,GAS_END+(1-GAS_END)*i/3000,0,new Vector2(),false);
    assert.ok(camera.position.distanceTo(previous)<2);
    assert.ok(camera.position.distanceTo(BLACK_HOLE_CENTER)>20);
    assert.ok([...camera.position.toArray(),...camera.quaternion.toArray(),camera.fov].every(Number.isFinite));
    previous.copy(camera.position);
  }
  applyJourneyCamera(camera,departure,5/7,0,new Vector2(),false);assert.ok(camera.fov>95);
  applyJourneyCamera(camera,departure,6/7,0,new Vector2(),false);const close=camera.position.distanceTo(BLACK_HOLE_CENTER);
  applyJourneyCamera(camera,departure,1,0,new Vector2(),false);assert.ok(camera.position.distanceTo(BLACK_HOLE_CENTER)>close*2);
  applyJourneyCamera(camera,departure,5/7,0,new Vector2(),true);assert.ok(camera.fov<60);
});
