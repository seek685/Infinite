import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Matrix4, Vector3 } from 'three';
import { BOOST_SPEED, HULL_RADIUS, createFlightState, fly, resolveContact } from '../src/pilot/flight.js';

const coast={yaw:0,pitch:0,thrust:false,brake:false,boost:false};
const forward={...coast,thrust:true}, boost={...forward,boost:true};
function simulate(state, input, seconds, fps=60) {
  for(let n=0;n<Math.ceil(seconds*fps);n++)fly(state,input,Math.min(1/fps,seconds-n/fps));
}

test('thrust, boost, inertia and braking work at different frame rates',()=>{
  const slow=createFlightState(), fast=createFlightState();
  for(const [state,fps] of [[slow,30],[fast,120]]){
    simulate(state,forward,2,fps);
    assert.ok(state.velocity.z < -1.2);
    simulate(state,boost,3,fps);
    assert.ok(state.velocity.length()>3.2&&state.velocity.length()<=BOOST_SPEED);
    simulate(state,{...coast,yaw:1,pitch:.5},.25,fps);
    assert.ok(state.velocity.z < -2,'coasting preserves forward momentum while turning');
    assert.ok(state.bank>.04&&state.forward.x<0&&state.forward.y>0);
    simulate(state,{...coast,brake:true},1,fps);
    assert.ok(state.velocity.length()<.025);
  }
  assert.ok(slow.position.distanceTo(fast.position)<.065);
});

test('a rotating belt rock deflects an impact while a clear ring gap allows passage',()=>{
  const frame=new Matrix4().makeRotationFromEuler(new Euler(.13,.67,.31));
  const inverse=frame.clone().invert(),rock={center:new Vector3(4.9,0,.4),radius:.082};
  const up=new Vector3(0,1,0).transformDirection(frame),state=createFlightState();
  state.position.copy(rock.center).applyMatrix4(frame).addScaledVector(up,.10);
  state.velocity.copy(up).multiplyScalar(-1.6);
  assert.equal(resolveContact(state,[rock],frame,inverse),'rock');
  assert.ok(state.velocity.dot(up)>.6);
  assert.ok(state.position.clone().applyMatrix4(inverse).distanceTo(rock.center)>=rock.radius+HULL_RADIUS);
  state.position.set(5.3,0,.4).applyMatrix4(frame);
  assert.equal(resolveContact(state,[rock],frame,inverse),null);
});

test('the atmosphere and outer perimeter keep a ship in reachable space',()=>{
  const state=createFlightState(),identity=new Matrix4();
  for(const [z,vz,kind] of [[2.85,-1,'atmosphere'],[30.03,1,'perimeter']]){
    state.position.set(0,0,z);state.velocity.set(0,0,vz);
    assert.equal(resolveContact(state,[],identity,identity),kind);
    assert.ok(state.velocity.z*vz<0);
  }
});
