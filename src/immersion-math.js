import { MathUtils, Vector3 } from 'three';
import { PLANET_RADIUS, SUN_DIRECTION } from './flight.js';

export const KM_PER_UNIT=25000;
// One display second represents 1,000 mission seconds; these are cinematic readouts.
export const MISSION_TIME_SCALE=1000;
const eclipseTangent=new Vector3(-.55,.85,-.25).addScaledVector(SUN_DIRECTION,-new Vector3(-.55,.85,-.25).dot(SUN_DIRECTION)).normalize();

export function offsetEclipseCamera(position,progress){
  const weight=Math.exp(-Math.pow((progress-.75)/.052,2));
  return position.addScaledVector(eclipseTangent,2.72*weight);
}

// Angular-disc overlap: a fully hidden star cannot produce a lens flare.
export function visibleSolarFraction(camera,sunPosition,sunRadius=7){
  const toPlanet=camera.clone().negate(),toSun=sunPosition.clone().sub(camera);
  if(toSun.length()<=toPlanet.length())return 1;
  const planetAngle=Math.asin(Math.min(1,PLANET_RADIUS/toPlanet.length()));
  const sunAngle=Math.asin(Math.min(1,sunRadius/toSun.length()));
  const separation=toPlanet.angleTo(toSun);
  if(separation>=planetAngle+sunAngle)return 1;
  if(separation<=Math.abs(planetAngle-sunAngle))return planetAngle>=sunAngle?0:1-planetAngle**2/sunAngle**2;
  const d=separation,a=planetAngle,b=sunAngle;
  const overlap=a*a*Math.acos(MathUtils.clamp((d*d+a*a-b*b)/(2*d*a),-1,1))+
    b*b*Math.acos(MathUtils.clamp((d*d+b*b-a*a)/(2*d*b),-1,1))-
    .5*Math.sqrt(Math.max(0,(-d+a+b)*(d+a-b)*(d-a+b)*(d+a+b)));
  return MathUtils.clamp(1-overlap/(Math.PI*b*b),0,1);
}

export function readTelemetry(position,velocity){
  const altitude=Math.max(0,(position.length()-PLANET_RADIUS)*KM_PER_UNIT);
  const sunlight=MathUtils.clamp(position.clone().normalize().dot(SUN_DIRECTION)*.5+.5,0,1);
  const temperature=92+sunlight*142+44*Math.exp(-altitude/18000)+Math.min(velocity,250)*.06;
  return {altitude,velocity,temperature};
}

export function dampWarp(current,progressSpeed,delta,disabled=false){
  if(disabled)return 0;
  const target=MathUtils.smoothstep(Math.abs(progressSpeed),.035,.28);
  return MathUtils.lerp(current,target,1-Math.exp(-delta*(target>current?10:4.5)));
}
