import { Vector3, MathUtils } from 'three';

export const PLANET_RADIUS = 2.8;
export const SUN_DIRECTION = new Vector3(-0.55, 0.32, 0.77).normalize();
const eclipseAzimuth = Math.atan2(-SUN_DIRECTION.x, -SUN_DIRECTION.z);
const eclipseLatitude = Math.asin(-SUN_DIRECTION.y);

// Interpolation in spherical coordinates prevents a chord from crossing the planet.
const shots = [
  { p:0, r:14.6, az:.12, lat:.26, target:[-2.3,.2,0], fov:43, roll:-.025 },
  { p:.17, r:8.0, az:.4, lat:.18, target:[-.8,.1,0], fov:49, roll:-.07 },
  { p:.25, r:5.92, az:.55, lat:.065, target:[.4,.15,-1.0], fov:58, roll:-.13 },
  { p:.33, r:5.25, az:.65, lat:-.06, target:[.3,.3,1.4], fov:62, roll:-.10 },
  { p:.5, r:3.24, az:.7, lat:.55, target:[.34,1.27,2.43], fov:67, roll:.09 },
  { p:.61, r:4.8, az:1.66, lat:.18, target:[0,.3,0], fov:51, roll:.05 },
  { p:.75, r:10.6, az:eclipseAzimuth, lat:eclipseLatitude, target:[-.6,.1,0], fov:42, roll:0 },
  { p:.86, r:13.8, az:eclipseAzimuth+.13, lat:eclipseLatitude+.03, target:[-1.4,0,0], fov:43, roll:-.02 },
  { p:1, r:22.0, az:eclipseAzimuth+.7, lat:.2, target:[-3.2,.6,0], fov:42, roll:-.04 },
];

function tangent(index, property) {
  const a=shots[Math.max(0,index-1)], b=shots[Math.min(shots.length-1,index+1)];
  return (b[property]-a[property])/(b.p-a.p);
}
function hermite(a,b,ma,mb,t,span) {
  const t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a+(t3-2*t2+t)*ma*span+(-2*t3+3*t2)*b+(t3-t2)*mb*span;
}

export function sampleFlight(progress, output = {position:new Vector3(),target:new Vector3()}) {
  const p=MathUtils.clamp(progress,0,1);
  let index=shots.findIndex((shot,i)=>i<shots.length-1 && p<=shots[i+1].p);
  if(index<0) index=shots.length-2;
  const a=shots[index], b=shots[index+1], span=b.p-a.p, t=(p-a.p)/span;
  const value=key=>hermite(a[key],b[key],tangent(index,key),tangent(index+1,key),t,span);
  const r=Math.max(PLANET_RADIUS*1.13,value('r')), az=value('az'), lat=value('lat');
  output.position.set(r*Math.cos(lat)*Math.sin(az),r*Math.sin(lat),r*Math.cos(lat)*Math.cos(az));
  const smooth=t*t*(3-2*t);
  output.target.set(...a.target).lerp(new Vector3(...b.target),smooth);
  output.fov=value('fov'); output.roll=value('roll'); output.radius=r;
  return output;
}
