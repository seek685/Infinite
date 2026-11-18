import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PLANET_RADIUS, SUN_DIRECTION } from './flight.js';
import { createImmersion } from './immersion.js';
import { createSingularity } from './singularity.js';
import { renderProfile } from './scene/viewport.js';
import noise from './shaders/noise.glsl?raw';
import sphereVertex from './shaders/sphere.vert.glsl?raw';
import planetFragment from './shaders/planet.frag.glsl?raw';
import atmosphereFragment from './shaders/atmosphere.frag.glsl?raw';
import ringVertex from './shaders/ring.vert.glsl?raw';
import ringFragment from './shaders/ring.frag.glsl?raw';
import ringDustFragment from './shaders/ring-dust.frag.glsl?raw';

function randomGenerator(seed) {
  return () => {seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
const random=randomGenerator(2186);
const range=(a,b)=>a+(b-a)*random();
const normalRandom=()=>Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(2*Math.PI*random());
const bands=[[3.8,4.55],[4.68,5.1],[5.22,5.75],[5.82,6.1]];
function ringRadius(){
  const pick=random();const band=bands[pick<.35?0:pick<.69?1:pick<.95?2:3];
  return Math.sqrt(range(band[0]**2,band[1]**2));
}

const starsVertex=`
attribute vec3 aColor; attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uHeight; uniform float uPixelRatio; uniform float uDust;
uniform float uWarp; uniform float uAspect;
varying vec3 vColor; varying float vAlpha;
varying vec2 vStretchDirection; varying float vStretch;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
 vec2 projected=gl_Position.xy/gl_Position.w;
 vStretchDirection=normalize(projected*vec2(uAspect,-1.0)+vec2(.0001));
 vStretch=1.0+uWarp*smoothstep(.12,.95,length(projected))*7.0*(1.0-uDust);
 float baseSize=clamp(aSize*uHeight*uPixelRatio/max(-mv.z,1.0),.6,mix(8.0,140.0,uDust));
 gl_PointSize=mix(min(baseSize*vStretch,32.0),baseSize,uDust);
 vColor=aColor;vAlpha=mix(.78+sin(uTime*.18+aPhase)*.22,.065,uDust);
}`;
const starsFragment=`
uniform float uDust; varying vec3 vColor; varying float vAlpha;
varying vec2 vStretchDirection; varying float vStretch;
void main(){
 vec2 p=gl_PointCoord-.5;
 if(uDust<.5)p=vec2(dot(p,vStretchDirection),dot(p,vec2(-vStretchDirection.y,vStretchDirection.x))*vStretch);
 float r=length(p);if(r>.5)discard;
 float core=exp(-r*r*85.0),halo=exp(-r*15.0)*.15;
 float soft=pow(max(0.0,1.0-r*2.0),3.0);
 vec3 color=vColor*mix(core*2.0+halo,soft,uDust);
 gl_FragColor=vec4(color,vAlpha*mix(1.0,soft,uDust));
}`;
const gradeShader={
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uResolution:{value:new THREE.Vector2()}},
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;uniform vec2 uResolution;varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 centered=vUv-.5;vec2 offset=centered*dot(centered,centered)*.0014;
    vec3 color=texture2D(tDiffuse,vUv).rgb;
    color.r=texture2D(tDiffuse,vUv+offset).r;color.b=texture2D(tDiffuse,vUv-offset).b;
    float vignette=1.0-smoothstep(.15,.74,length(centered))*.31;
    float grain=hash(vUv*uResolution+fract(uTime)*173.0)-.5;
    color=color*vec3(.98,1.0,1.025)*vignette+grain*.009;
    gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
  }`
};

export async function createUniverse(canvas,onProgress=()=>{}) {
  onProgress(30);
  const profile=renderProfile(innerWidth,devicePixelRatio,matchMedia('(pointer: coarse)').matches);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',precision:'highp'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.debug.checkShaderErrors=true;
  const shaderErrors=[],glErrors=[];
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
    const error=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');
    shaderErrors.push(error);console.error('ORBITAL GLSL:',error);
  };
  let pixelRatio=profile.pixelRatio;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#020409');
  const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.035,1200);
  camera.position.set(0,4,15);
  const system=new THREE.Group();system.rotation.set(.13,0,.31);scene.add(system);
  system.updateMatrixWorld(true);
  const ringNormal=new THREE.Vector3(0,1,0).transformDirection(system.matrixWorld);
  const time={value:0},height={value:innerHeight},ratio={value:pixelRatio};
  const warp={value:0},aspect={value:innerWidth/innerHeight};
  const shared={uTime:time,uSun:{value:SUN_DIRECTION},uRingNormal:{value:ringNormal}};

  const planetMaterial=new THREE.ShaderMaterial({
    name:'Six-octave turbulent atmosphere / gas surface',uniforms:shared,
    vertexShader:sphereVertex,fragmentShader:planetFragment.replace('#include <orbital_noise>',noise)
  });
  const planet=new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS,192,128),planetMaterial);
  system.add(planet);
  const atmosphereGeometry=new THREE.SphereGeometry(PLANET_RADIUS,128,96);
  for(const layer of [{scale:1.002,power:8.0,strength:4.8,side:THREE.FrontSide},{scale:1.018,power:4.0,strength:1.0,side:THREE.BackSide},{scale:1.044,power:5.0,strength:.25,side:THREE.BackSide}]){
    const material=new THREE.ShaderMaterial({name:'Fresnel scattering shell',uniforms:{uSun:{value:SUN_DIRECTION},uStrength:{value:layer.strength},uPower:{value:layer.power}},vertexShader:sphereVertex,fragmentShader:atmosphereFragment,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:layer.side});
    const shell=new THREE.Mesh(atmosphereGeometry,material);shell.scale.setScalar(layer.scale);system.add(shell);
  }

  // Actual 3D points, with orbital thickness, radial gaps and a world-space planet shadow.
  const particleCount=profile.ringParticles;
  const ringPositions=new Float32Array(particleCount*3),ringSizes=new Float32Array(particleCount),ringSeeds=new Float32Array(particleCount);
  for(let i=0;i<particleCount;i++){
    const radius=ringRadius(),angle=random()*Math.PI*2;
    ringPositions.set([Math.cos(angle)*radius,normalRandom()*.009,Math.sin(angle)*radius],i*3);
    ringSizes[i]=range(.0035,.013);ringSeeds[i]=random();
  }
  const ringGeometry=new THREE.BufferGeometry();ringGeometry.setAttribute('position',new THREE.BufferAttribute(ringPositions,3));ringGeometry.setAttribute('aSize',new THREE.BufferAttribute(ringSizes,1));ringGeometry.setAttribute('aSeed',new THREE.BufferAttribute(ringSeeds,1));
  const ringMaterial=new THREE.ShaderMaterial({name:'Lit ice / orbital particle field',uniforms:{...shared,uPixelRatio:ratio,uHeight:height},vertexShader:ringVertex,fragmentShader:ringFragment,transparent:true,depthWrite:false});
  const rings=new THREE.Group();rings.add(new THREE.Points(ringGeometry,ringMaterial));system.add(rings);
  const dustGeometry=new THREE.RingGeometry(3.8,6.1,512,1);dustGeometry.rotateX(-Math.PI/2);
  const dustMaterial=new THREE.ShaderMaterial({name:'Optically thin ring dust',uniforms:shared,vertexShader:sphereVertex,fragmentShader:ringDustFragment,side:THREE.DoubleSide,transparent:true,depthWrite:false});
  const ringDust=new THREE.Mesh(dustGeometry,dustMaterial);ringDust.renderOrder=1;rings.add(ringDust);

  // Near the fly-through, individual silhouettes become real instanced rock meshes.
  const rockCount=profile.rocks;
  const rockGeometry=new THREE.IcosahedronGeometry(1,1);
  const vertices=rockGeometry.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
    const shape=.82+.15*Math.sin(x*9.2+y*6.1+z*4.7)+.08*Math.sin(x*17.0-z*11.3);
    vertices.setXYZ(i,x*shape,y*shape,z*shape);
  }
  rockGeometry.computeVertexNormals();
  const rockMaterial=new THREE.MeshStandardMaterial({color:'#7a8a90',roughness:.86,metalness:.1});
  const rocks=new THREE.InstancedMesh(rockGeometry,rockMaterial,rockCount);
  const dummy=new THREE.Object3D();
  for(let i=0;i<rockCount;i++){
    const radius=ringRadius(),angle=random()*Math.PI*2,scale=range(.004,.018);
    dummy.position.set(Math.cos(angle)*radius,normalRandom()*.025,Math.sin(angle)*radius);
    dummy.rotation.set(random()*6,random()*6,random()*6);dummy.scale.set(scale,scale*range(.5,1.4),scale*range(.7,1.6));dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate=true;rings.add(rocks);
  const sunlight=new THREE.DirectionalLight('#fff0d8',2.0);sunlight.position.copy(SUN_DIRECTION).multiplyScalar(100);scene.add(sunlight);
  scene.add(new THREE.AmbientLight('#19344c',.06));

  function makeStars(count,isDust=false){
    const positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),phases=new Float32Array(count);
    const palette=[new THREE.Color(.55,.68,.86),new THREE.Color(.98,.82,.59),new THREE.Color(.79,.87,.93),new THREE.Color(.61,.66,.91)];
    for(let i=0;i<count;i++){
      if(isDust){
        const x=normalRandom()*150;positions.set([x,normalRandom()*16+x*.32+30,normalRandom()*30-190],i*3);
        const color=i%3===0?new THREE.Color(.095,.15,.20):new THREE.Color(.12,.09,.18);colors.set(color.toArray(),i*3);sizes[i]=range(2,7);
      }else{
        const r=i<count*.1?range(25,85):range(120,650),theta=random()*Math.PI*2,cos=range(-1,1),sin=Math.sqrt(1-cos*cos);
        positions.set([r*sin*Math.cos(theta),r*cos,r*sin*Math.sin(theta)],i*3);
        const color=palette[Math.floor(random()*palette.length)].clone().multiplyScalar(range(.25,1.2));colors.set(color.toArray(),i*3);
        sizes[i]=r*range(.0007,.0016)*(random()>.985?2.3:1);
      }
      phases[i]=random()*Math.PI*2;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aColor',new THREE.BufferAttribute(colors,3));geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1));
    const material=new THREE.ShaderMaterial({name:isDust?'Volumetric nebula particles':'Multi-depth temperature stars',uniforms:{uTime:time,uHeight:height,uPixelRatio:ratio,uDust:{value:isDust?1:0},uWarp:warp,uAspect:aspect},vertexShader:starsVertex,fragmentShader:starsFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const cloud=new THREE.Points(geometry,material);scene.add(cloud);return cloud;
  }
  makeStars(profile.stars);makeStars(profile.dust,true);

  const sun=new THREE.Mesh(new THREE.SphereGeometry(7.0,32,24),new THREE.MeshBasicMaterial({color:new THREE.Color(12,9.5,7.0)}));sun.position.copy(SUN_DIRECTION).multiplyScalar(220);scene.add(sun);
  const corona=new THREE.Mesh(new THREE.PlaneGeometry(140,140),new THREE.ShaderMaterial({
    name:'Solar corona',uniforms:{uTime:time},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uTime;void main(){vec2 p=(vUv-.5)*2.0;float r=length(p);float a=atan(p.y,p.x);float ray=1.0+sin(a*13.0+sin(a*31.0)*.6+uTime*.015)*.12;float falloff=exp(-r*8.0)*.56+exp(-r*3.5)*.035;float alpha=(1.0-smoothstep(.65,1.0,r));gl_FragColor=vec4(vec3(1.1,.9,.7)*falloff*ray,alpha);}`
  }));corona.position.copy(sun.position);scene.add(corona);

  const immersion=createImmersion(scene,camera,sun);
  const originalObjects=[...scene.children];
  const singularity=createSingularity(scene,camera,profile);
  const composer=new EffectComposer(renderer);
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.48,.55,1.02);
  composer.addPass(new RenderPass(scene,camera));composer.addPass(singularity.pass);composer.addPass(bloom);composer.addPass(immersion.flare);composer.addPass(new OutputPass());
  const grade=new ShaderPass(gradeShader);composer.addPass(grade);composer.addPass(singularity.shadowPass);
  function resize(){
    const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();
    pixelRatio=Math.min(pixelRatio,renderProfile(w,devicePixelRatio,matchMedia('(pointer: coarse)').matches).pixelRatio);
    renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);composer.setPixelRatio(pixelRatio);composer.setSize(w,h);
    height.value=h;ratio.value=pixelRatio;aspect.value=w/h;grade.uniforms.uResolution.value.set(w*pixelRatio,h*pixelRatio);
  }
  resize();
  onProgress(52);await new Promise(resolve=>requestAnimationFrame(resolve));
  await renderer.compileAsync(scene,camera);
  onProgress(72);
  const warmup=new THREE.Scene(),warmupPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),singularity.pass.material);
  warmup.add(warmupPlane);await renderer.compileAsync(warmup,camera);warmupPlane.geometry.dispose();
  onProgress(86);
  function render(elapsed,delta,warpStrength=0,progress=0){
    time.value=elapsed;planet.rotation.y=elapsed*.009;rings.rotation.y=elapsed*.0018;
    corona.lookAt(camera.position);grade.uniforms.uTime.value=elapsed;
    warp.value=warpStrength;immersion.update(elapsed);
    const journey=singularity.update(progress,elapsed,pixelRatio);
    originalObjects.forEach(object=>{object.visible=journey.planetVisible;});
    immersion.flare.enabled=journey.offset<.1;
    bloom.strength=THREE.MathUtils.lerp(.48,.18,journey.reveal);bloom.radius=THREE.MathUtils.lerp(.55,.3,journey.reveal);
    composer.render(delta);
  }
  function reduceResolution(){
    if(pixelRatio<=.85)return false;
    pixelRatio=Math.max(.85,pixelRatio-.15);resize();return true;
  }
  function diagnostics(){
    const gl=renderer.getContext(),error=gl.getError();
    if(error!==gl.NO_ERROR)glErrors.push(error);
    return {particleCount,rockCount,shaderErrors:[...shaderErrors],programs:renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??true,linked:gl.getProgramParameter(p.program,gl.LINK_STATUS)})),pixelRatio,webglVersion:gl.getParameter(gl.VERSION),glError:glErrors[0]||0,contextLost:gl.isContextLost(),bloom:composer.passes.includes(bloom),warp:warp.value,journey:singularity.diagnostics(),...immersion.diagnostics()};
  }
  function dispose(){
    scene.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.material){for(const material of [object.material].flat())material.dispose();}});
    composer.passes.forEach(pass=>pass.dispose?.());immersion.dispose();composer.dispose();renderer.dispose();
  }
  return {camera,anchors:{planet,rings},render,resize,reduceResolution,diagnostics,dispose};
}
