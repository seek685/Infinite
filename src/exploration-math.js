import { MathUtils, Quaternion, Vector3 } from 'three';
import { PLANET_RADIUS } from './flight.js';

export const MIN_ORBIT_RADIUS=PLANET_RADIUS*1.09;
const identity=new Quaternion(),arc=new Quaternion(),rotation=new Quaternion();
const startDirection=new Vector3(),endDirection=new Vector3();

// Interpolate directions on a sphere, never a straight chord through the planet.
export function safeArc(from,to,progress,output=new Vector3()){
  startDirection.copy(from).normalize();endDirection.copy(to).normalize();
  arc.setFromUnitVectors(startDirection,endDirection);
  rotation.slerpQuaternions(identity,arc,progress);
  const radius=Math.max(MIN_ORBIT_RADIUS,MathUtils.lerp(from.length(),to.length(),progress));
  return output.copy(startDirection).applyQuaternion(rotation).multiplyScalar(radius);
}

export function planetOccludes(camera,point){
  const dx=point.x-camera.x,dy=point.y-camera.y,dz=point.z-camera.z;
  const t=-(camera.x*dx+camera.y*dy+camera.z*dz)/(dx*dx+dy*dy+dz*dz);
  if(t<=0||t>=1)return false;
  return (camera.x+dx*t)**2+(camera.y+dy*t)**2+(camera.z+dz*t)**2<PLANET_RADIUS**2;
}
