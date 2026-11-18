import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BLACK_HOLE_CENTER, HORIZON_RADIUS, journeyState } from './journey.js';
import singularityFragment from './shaders/singularity.frag.glsl?raw';
import warpVertex from './shaders/warp.vert.glsl?raw';
import warpFragment from './shaders/warp.frag.glsl?raw';

export function createSingularity(scene,camera,profile){
  const {compact}=profile;
  let seed=19473;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const blackHole=new THREE.Group();blackHole.name='The singularity / distant stellar system';
  blackHole.position.copy(BLACK_HOLE_CENTER);scene.add(blackHole);blackHole.visible=false;
  const horizon=new THREE.Mesh(new THREE.SphereGeometry(HORIZON_RADIUS,96,64),new THREE.MeshBasicMaterial({color:0x000000}));
  horizon.name='Opaque event horizon';blackHole.add(horizon);
  const starCount=profile.distantStars,positions=new Float32Array(starCount*3),colors=new Float32Array(starCount*3),sizes=new Float32Array(starCount);
  for(let i=0;i<starCount;i++){
    const azimuth=random()*Math.PI*2,y=random()*2-1,r=140+random()*500,s=Math.sqrt(1-y*y);
    positions.set([Math.cos(azimuth)*s*r,y*r,Math.sin(azimuth)*s*r],i*3);
    const warm=random()>.7,brightness=.22+random()*.75;
    colors.set((warm?[1,.76,.51]:[.61,.77,1]).map(c=>c*brightness),i*3);sizes[i]=r*(.0007+random()*.001);
  }
  const starsGeometry=new THREE.BufferGeometry();starsGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));starsGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));starsGeometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  const starMaterial=new THREE.ShaderMaterial({name:'Singularity depth stars',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uHeight:{value:innerHeight}},
    vertexShader:'attribute vec3 color;attribute float aSize;uniform float uHeight;varying vec3 vColor;void main(){vec4 p=modelViewMatrix*vec4(position,1);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*uHeight/max(1.0,-p.z),.6,4.0);vColor=color;}',
    fragmentShader:'varying vec3 vColor;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;gl_FragColor=vec4(vColor*exp(-r*r*65.0)*1.8,1.0);}'});
  blackHole.add(new THREE.Points(starsGeometry,starMaterial));

  const diskRotation=new THREE.Matrix4().makeRotationZ(.1),diskToWorld=new THREE.Matrix3().setFromMatrix4(diskRotation);
  const pass=new ShaderPass({name:'Curved 3D rays / accretion disc',defines:{MAX_STEPS:compact?88:112},uniforms:{tDiffuse:{value:null},uInverseProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},uWorldToDisk:{value:diskToWorld.clone().invert()},uDiskToWorld:{value:diskToWorld},uObserver:{value:new THREE.Vector3()},uTime:{value:0},uReveal:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:singularityFragment});
  pass.enabled=false;
  const rawRays=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const quadVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  const copy=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:quadVertex,fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb,1.0);}'});
  const shadowPass=new ShaderPass({name:'Preserve the captured-light horizon',uniforms:{tDiffuse:{value:null},uRayTarget:{value:null}},vertexShader:quadVertex,
    fragmentShader:'uniform sampler2D tDiffuse;uniform sampler2D uRayTarget;varying vec2 vUv;void main(){vec3 color=texture2D(tDiffuse,vUv).rgb;float capture=texture2D(uRayTarget,vUv).a;gl_FragColor=vec4(color*(1.0-smoothstep(.2,.98,capture)),1.0);}'});
  shadowPass.uniforms.uRayTarget.value=rawRays.texture;shadowPass.enabled=false;
  const renderRays=pass.render.bind(pass),disposeRays=pass.dispose.bind(pass);
  pass.setSize=(width,height)=>rawRays.setSize(width,height);
  pass.render=(renderer,writeBuffer,readBuffer,delta)=>{
    renderRays(renderer,rawRays,readBuffer,delta);copy.render(renderer,writeBuffer,rawRays,delta);
  };
  pass.dispose=()=>{disposeRays();copy.dispose();rawRays.dispose();};

  const streakCount=profile.warpStreaks;
  const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index.clone();geometry.setAttribute('position',plane.attributes.position.clone());geometry.setAttribute('uv',plane.attributes.uv.clone());geometry.instanceCount=streakCount;plane.dispose();
  const angle=new Float32Array(streakCount),radius=new Float32Array(streakCount),phase=new Float32Array(streakCount),speed=new Float32Array(streakCount);
  for(let i=0;i<streakCount;i++){angle[i]=random()*Math.PI*2;radius[i]=.65+Math.pow(random(),.7)*43;phase[i]=random();speed[i]=random();}
  for(const [name,data]of [['aAngle',angle],['aRadius',radius],['aPhase',phase],['aSpeed',speed]])geometry.setAttribute(name,new THREE.InstancedBufferAttribute(data,1));
  const warpMaterial=new THREE.ShaderMaterial({name:'Instanced 3D FTL light streams',uniforms:{uTime:{value:0},uJump:{value:0},uTravel:{value:0},uHeight:{value:innerHeight},uViewport:{value:new THREE.Vector2(innerWidth,innerHeight)}},vertexShader:warpVertex,fragmentShader:warpFragment,transparent:true,depthWrite:false,depthTest:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  const tunnel=new THREE.Mesh(geometry,warpMaterial);tunnel.name='Superluminal passage';tunnel.frustumCulled=false;tunnel.renderOrder=10;tunnel.visible=false;scene.add(tunnel);
  let state=journeyState(0);
  function update(progress,elapsed,pixelRatio){
    state=journeyState(progress);blackHole.visible=state.reveal>0;pass.enabled=blackHole.visible;shadowPass.enabled=blackHole.visible;tunnel.visible=state.jump>.0001;
    starMaterial.uniforms.uHeight.value=innerHeight*pixelRatio;
    warpMaterial.uniforms.uTime.value=elapsed;warpMaterial.uniforms.uJump.value=state.jump;warpMaterial.uniforms.uTravel.value=state.travel;
    warpMaterial.uniforms.uHeight.value=innerHeight*pixelRatio;
    warpMaterial.uniforms.uViewport.value.set(innerWidth*pixelRatio,innerHeight*pixelRatio);
    if(pass.enabled){
      camera.updateMatrixWorld(true);
      pass.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);pass.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
      pass.uniforms.uObserver.value.copy(camera.position).sub(BLACK_HOLE_CENTER).divideScalar(HORIZON_RADIUS);
      pass.uniforms.uTime.value=elapsed;pass.uniforms.uReveal.value=state.reveal;
    }
    return state;
  }
  function diagnostics(){return {jump:state.jump,reveal:state.reveal,planetVisible:state.planetVisible,streakCount,blackHoleVisible:blackHole.visible,raySteps:pass.material.defines.MAX_STEPS,blackHoleDistance:camera.position.distanceTo(BLACK_HOLE_CENTER),horizonRadius:HORIZON_RADIUS};}
  return {pass,shadowPass,update,diagnostics};
}
