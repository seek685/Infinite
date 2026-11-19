import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { PLANET_RADIUS } from '../flight.js';

export const SPAWN = new Vector3(.86, .92, 8.40);
export const STATION = new Vector3(1.08, .82, 5.22);
export const DOCK = STATION.clone().add(new Vector3(0, 0, .74));
export const HULL_RADIUS = .095;
export const BOOST_SPEED = 3.4;
const angles = new Euler(0, 0, 0, 'YXZ');
const normal = new Vector3();
const ringPoint = new Vector3();

export function createFlightState() {
  return {
    position: SPAWN.clone(), velocity: new Vector3(), forward: new Vector3(0, 0, -1),
    attitude: new Quaternion(), yaw: 0, pitch: 0, bank: 0,
    yawRate: 0, pitchRate: 0, boost: 0, power: 0,
  };
}

export function orient(state) {
  state.attitude.setFromEuler(angles.set(state.pitch, state.yaw, 0));
  state.forward.set(0, 0, -1).applyQuaternion(state.attitude);
}

export function fly(state, input, dt) {
  const { damp, clamp } = MathUtils;
  state.yawRate = damp(state.yawRate, input.yaw * 1.55, 6, dt);
  state.pitchRate = damp(state.pitchRate, input.pitch * 1.18, 6, dt);
  state.yaw += state.yawRate * dt;
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -1.48, 1.48);
  state.bank = damp(state.bank, state.yawRate * .31, 4.5, dt);
  orient(state);
  state.boost = damp(state.boost, input.thrust && input.boost && !input.brake ? 1 : 0, 3.2, dt);
  state.power = damp(state.power, input.thrust && !input.brake ? .55 + .45 * state.boost : .06, 5, dt);
  // Drag acts on the world velocity. Turning never rotates away the previous momentum.
  const drag = input.brake ? 5.2 : input.thrust ? 1.65 : .8;
  const retain = Math.exp(-drag * dt);
  const targetSpeed = input.thrust && !input.brake ? MathUtils.lerp(1.3, BOOST_SPEED, state.boost) : 0;
  const coastTime = (1 - retain) / drag;
  state.position.addScaledVector(state.velocity, coastTime).addScaledVector(state.forward, targetSpeed * (dt - coastTime));
  state.velocity.multiplyScalar(retain).addScaledVector(state.forward, targetSpeed * (1 - retain));
}

function bounce(state, direction, penetration) {
  state.position.addScaledVector(direction, penetration + .003);
  const inward = state.velocity.dot(direction);
  if (inward < 0) state.velocity.addScaledVector(direction, -1.48 * inward);
}

// Rock centers are in the rotating ring's local coordinates. Both ring transforms are rigid.
export function resolveContact(state, rocks, ringMatrix, inverseRing) {
  const radius = state.position.length();
  if (radius < PLANET_RADIUS + HULL_RADIUS) {
    bounce(state, normal.copy(state.position).normalize(), PLANET_RADIUS + HULL_RADIUS - radius);
    return 'atmosphere';
  }
  if (radius > 30) {
    bounce(state, normal.copy(state.position).normalize().negate(), radius - 30);
    return 'perimeter';
  }
  if (radius > 6.5 || radius < 3.5) return null;
  ringPoint.copy(state.position).applyMatrix4(inverseRing);
  if (Math.abs(ringPoint.y) > .34) return null;
  for (const rock of rocks) {
    const reach = HULL_RADIUS + rock.radius;
    const squared = ringPoint.distanceToSquared(rock.center);
    if (squared >= reach * reach) continue;
    normal.subVectors(ringPoint, rock.center);
    if (squared < 1e-10) normal.set(0, 1, 0);
    normal.transformDirection(ringMatrix);
    bounce(state, normal, reach - Math.sqrt(squared));
    return 'rock';
  }
  return null;
}
