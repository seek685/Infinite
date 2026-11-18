import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { safeArc, planetOccludes, MIN_ORBIT_RADIUS } from '../src/exploration-math.js';

test('orbit handoffs remain outside the atmosphere, including opposite sides',()=>{
  for(const [from,to]of [[new Vector3(0,0,3.1),new Vector3(0,0,-22)],[new Vector3(3,.6,1),new Vector3(-5,3,-8)]]){
    let previous;
    for(let i=0;i<=1000;i++){
      const position=safeArc(from,to,i/1000);
      assert.ok(position.length()>=MIN_ORBIT_RADIUS-1e-8);
      if(previous)assert.ok(previous.distanceTo(position)<.1,'transition must be continuous');
      previous=position;
    }
    assert.ok(safeArc(from,to,0).distanceTo(from)<1e-8);
    assert.ok(safeArc(from,to,1).distanceTo(to)<1e-8);
  }
});

test('hotspots disappear behind the planet, without hiding near-side or outer-ring points',()=>{
  const camera=new Vector3(0,0,14);
  assert.equal(planetOccludes(camera,new Vector3(0,0,-2.84)),true);
  assert.equal(planetOccludes(camera,new Vector3(0,0,2.84)),false);
  assert.equal(planetOccludes(camera,new Vector3(5.16,0,-1)),false);
  assert.equal(planetOccludes(new Vector3(0,0,-14),new Vector3(0,0,2.84)),true);
});
