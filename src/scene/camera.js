import { MathUtils, Vector3 } from 'three';
import { sampleFlight } from '../flight.js';
import { offsetEclipseCamera } from '../immersion-math.js';

const frame={position:new Vector3(),target:new Vector3()};
const smoothstep=(a,b,x)=>{const t=MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

export function applyGasCamera(camera,progress,pointer,reducedMotion,width=innerWidth,height=innerHeight){
  sampleFlight(progress,frame);
  const narrowPortrait=width<768&&height>width;
  const portrait=narrowPortrait||width/height<.85;
  if(portrait){
    const closePass=1-smoothstep(.08,.22,Math.abs(progress-.5));
    frame.position.multiplyScalar(MathUtils.lerp(1.45,1,closePass));
    frame.target.x*=.2;frame.target.y-=1.35*(1-closePass);
  }
  let wide=0;
  camera.fov=frame.fov+(portrait?7:0);
  if(narrowPortrait){
    // Fit the complete outer ring in wide shots, retaining both intentional fly-throughs.
    const ringPass=1-smoothstep(.05,.14,Math.abs(progress-.25));
    const horizonPass=1-smoothstep(.08,.22,Math.abs(progress-.5));
    wide=1-Math.max(ringPass,horizonPass);
    camera.fov+=2*wide;
    const halfAngle=Math.atan(Math.tan(MathUtils.degToRad(camera.fov/2))*width/height);
    const fitDistance=6.15/Math.sin(halfAngle*.9);
    frame.position.setLength(MathUtils.lerp(frame.position.length(),Math.max(frame.position.length(),fitDistance),wide));
    frame.target.multiplyScalar(1-wide);
  }
  camera.position.copy(frame.position);
  offsetEclipseCamera(camera.position,progress);
  const parallax=reducedMotion?0:MathUtils.clamp((frame.radius-2.8)*.018,.012,.2);
  camera.position.x+=pointer.x*parallax;camera.position.y-=pointer.y*parallax;
  const composition=portrait?0:-.32*Math.exp(-Math.pow((progress-.25)/.105,2))-.22*Math.exp(-Math.pow((progress-.78)/.15,2));
  camera.setViewOffset(width,height,composition*width,wide?-.06*height*wide:0,width,height);
  camera.lookAt(frame.target);camera.rotateZ(frame.roll+pointer.x*.006);
}
