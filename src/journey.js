import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export const CHAPTER_COUNT=8;
export const GAS_END=4/7;
export const BLACK_HOLE_CENTER=new Vector3(0,0,-1800);
export const HORIZON_RADIUS=2.5;
const lookCamera=new PerspectiveCamera(),closePosition=new Vector3(),farPosition=new Vector3(),lookTarget=new Vector3();

export function gasProgress(progress){return MathUtils.clamp(progress*7/4,0,1);}
export function journeyState(progress){
  const offset=Math.max(0,progress*7-4);
  const jump=MathUtils.smoothstep(offset,.05,.48)*(1-MathUtils.smoothstep(offset,1.2,1.78));
  const reveal=MathUtils.smoothstep(offset,1.32,1.82);
  return {offset,jump,reveal,planetVisible:offset<.94,canOrbit:offset<.00001||offset>=1.88,travel:MathUtils.smootherstep(offset,0,1.88)};
}

// The original flight sampler and its first five lenses are left untouched.
export function applyJourneyCamera(camera,departure,progress,time,pointer,reducedMotion){
  const state=journeyState(progress),portrait=innerWidth/innerHeight<.85;
  const epilogue=MathUtils.smootherstep(state.offset,2,3),distanceScale=portrait?1.7:1;
  closePosition.set(3.6,3.7,25).multiplyScalar(distanceScale).add(BLACK_HOLE_CENTER);
  farPosition.set(-16,8.5,67).multiplyScalar(portrait?1.45:1).add(BLACK_HOLE_CENTER);
  camera.position.copy(departure.position).lerp(closePosition,state.travel).lerp(farPosition,epilogue);
  lookTarget.copy(BLACK_HOLE_CENTER);if(portrait)lookTarget.y-=MathUtils.lerp(5,8,epilogue);
  lookCamera.position.copy(camera.position);lookCamera.lookAt(lookTarget);
  lookCamera.rotateZ(MathUtils.lerp(-.055,.025,epilogue));
  camera.quaternion.slerpQuaternions(departure.quaternion,lookCamera.quaternion,MathUtils.smootherstep(state.offset,.24,1.28));
  const framing=MathUtils.lerp(48,43,epilogue)+(portrait?7:0);
  camera.fov=MathUtils.lerp(departure.fov,framing,state.travel)+(reducedMotion?6:57)*state.jump;
  const departureOffset=departure.view?.enabled?departure.view.offsetX/departure.view.fullWidth:0;
  const offset=MathUtils.lerp(departureOffset,portrait?0:-.18,state.travel);
  camera.setViewOffset(innerWidth,innerHeight,offset*innerWidth,0,innerWidth,innerHeight);
  if(!reducedMotion){
    camera.translateX(Math.sin(time*47)*.018*state.jump+pointer.x*.08*state.reveal);
    camera.translateY(Math.sin(time*61+.7)*.012*state.jump-pointer.y*.08*state.reveal);
    camera.rotateZ(Math.sin(time*39)*.0016*state.jump);
  }
  return state;
}
