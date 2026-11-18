import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { visibleSolarFraction } from './immersion-math.js';
import flareFragment from './shaders/lens-flare.frag.glsl?raw';

// Isolated seed: additions never perturb the existing ring or star distributions.
let seed=7319;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const direction=()=>{const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y);return new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a));};

function createMoon(){
  const radius=.36,geometry=new THREE.SphereGeometry(radius,96,64),positions=geometry.attributes.position;
  const craters=Array.from({length:44},()=>({center:direction(),radius:.055+random()*.19,depth:.018+random()*.045}));
  const colors=new Float32Array(positions.count*3),n=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){
    n.fromBufferAttribute(positions,i).normalize();
    let height=.004*Math.sin(n.x*71+n.y*93+n.z*57)+.006*Math.sin(n.x*23-n.y*17+n.z*29);
    for(const crater of craters){
      const d=Math.sqrt(Math.max(0,2*(1-n.dot(crater.center))))/crater.radius;
      if(d<1.6)height+=crater.depth*(-Math.exp(-d*d*3.8)+.45*Math.exp(-Math.pow((d-.94)/.14,2)));
    }
    positions.setXYZ(i,n.x*radius*(1+height),n.y*radius*(1+height),n.z*radius*(1+height));
    const shade=.58+.14*Math.sin(n.x*47+n.z*63)*Math.sin(n.y*61)+height*1.2;
    colors.set([shade,shade*.97,shade*.91],i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
  const moon=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0}));
  moon.name='Cratered outer moon';return moon;
}

function createProbe(){
  const probe=new THREE.Group();probe.name='Deep-space probe';probe.scale.setScalar(.035);
  const metal=new THREE.MeshStandardMaterial({color:'#8a9290',roughness:.45,metalness:.72});
  const gold=new THREE.MeshStandardMaterial({color:'#9b8966',roughness:.65,metalness:.55});
  const panel=new THREE.MeshStandardMaterial({color:'#142a3b',roughness:.4,metalness:.48,side:THREE.DoubleSide});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.38,.44,.65),gold);probe.add(body);
  const grid=[];
  for(const side of [-1,1]){
    const wing=new THREE.Mesh(new THREE.BoxGeometry(1,.025,.58),panel);wing.position.set(side*.81,0,0);probe.add(wing);
    const spar=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.1,6),metal);spar.rotation.z=Math.PI/2;spar.position.x=side*.65;probe.add(spar);
    for(let j=0;j<7;j++){const x=side*.81-.5+j/6;grid.push(x,.016,-.29,x,.016,.29);}
    for(let j=0;j<4;j++){const z=-.29+j*.58/3;grid.push(side*.81-.5,.016,z,side*.81+.5,.016,z);}
  }
  const gridGeometry=new THREE.BufferGeometry();gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));
  probe.add(new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:'#4b6370',transparent:true,opacity:.65})));
  const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.012,.02,.95,8),metal);antenna.position.set(0,.58,.15);probe.add(antenna);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(.24,24,12,0,Math.PI*2,0,Math.PI/2),metal);dish.scale.y=.32;dish.position.y=.37;dish.rotation.x=Math.PI;probe.add(dish);
  const nozzle=new THREE.Mesh(new THREE.ConeGeometry(.12,.23,12,1,true),metal);nozzle.rotation.x=-Math.PI/2;nozzle.position.z=.42;probe.add(nozzle);
  const beaconMaterial=new THREE.MeshBasicMaterial({color:new THREE.Color(.3,3.4,2.9)});
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.046,12,8),beaconMaterial);beacon.position.set(.18,.26,-.2);probe.add(beacon);
  return {probe,beaconMaterial};
}

function cloudTexture(offset){
  const size=192,data=new Uint8Array(size*size*4);
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7+offset)*43758.5453;return n-Math.floor(n);};
  function noise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),sx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),sx),sy);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1)*2-1,v=y/(size-1)*2-1;
    let value=0,amplitude=.5,frequency=2.5;
    for(let octave=0;octave<5;octave++){value+=amplitude*noise(u*frequency+offset,v*frequency);amplitude*=.5;frequency*=2.1;}
    const fade=Math.pow(Math.max(0,1-u*u-v*v),2);
    const alpha=fade*Math.pow(THREE.MathUtils.smoothstep(value,.22,.72),1.25);
    const i=(y*size+x)*4;data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=Math.round(alpha*255);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createImmersion(scene,camera,sun){
  const moon=createMoon(),{probe,beaconMaterial}=createProbe();scene.add(moon,probe);
  const probeBase=new THREE.Vector3(.65,1.55,2.73).normalize().multiplyScalar(3.28);
  const probeAxis=new THREE.Vector3().crossVectors(probeBase,new THREE.Vector3(0,1,0)).normalize();
  const moonInclination=new THREE.Euler(.22,.1,-.08);
  const textures=[cloudTexture(13),cloudTexture(87),cloudTexture(173)];
  const clouds=new THREE.Group();clouds.name='Distant layered nebula';scene.add(clouds);
  const directions=[[-.25,.3,-1],[1,-.1,-.65],[-1,.25,.6],[-.45,.27,1]];
  directions.forEach((axis,index)=>{
    for(let depth=0;depth<3;depth++){
      const color=depth%2?new THREE.Color(.045,.025,.095):new THREE.Color(.018,.072,.085);
      const material=new THREE.MeshBasicMaterial({map:textures[(index+depth)%3],color,transparent:true,opacity:.36-depth*.045,blending:THREE.AdditiveBlending,depthWrite:false});
      const cloud=new THREE.Mesh(new THREE.PlaneGeometry(270+depth*35,190+depth*40),material);
      cloud.position.set(...axis).normalize().multiplyScalar(260+depth*75);
      cloud.position.x+=depth*24-24;cloud.position.y+=depth*14-14;
      cloud.lookAt(0,0,0);cloud.rotateZ(index*.8+depth*.5);clouds.add(cloud);
    }
  });
  const flare=new ShaderPass({name:'Occlusion-aware cinematic lens flare',uniforms:{tDiffuse:{value:null},uSunUV:{value:new THREE.Vector2()},uAspect:{value:1},uVisibility:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:flareFragment});
  const projected=new THREE.Vector3(),planetProjection=new THREE.Vector3(),cameraForward=new THREE.Vector3(),sunDirection=new THREE.Vector3();
  const flareOffset=new THREE.Vector2();
  let solarVisibility=0;
  function update(elapsed){
    const phase=3.78+elapsed*.012;
    moon.position.set(Math.cos(phase)*9.6,0,Math.sin(phase)*9.6).applyEuler(moonInclination);moon.rotation.y=elapsed*.018;
    probe.position.copy(probeBase).applyAxisAngle(probeAxis,elapsed*.004);probe.lookAt(0,0,0);probe.rotateZ(.55);
    const signal=.65+.35*Math.pow(.5+.5*Math.sin(elapsed*2.2),6);
    beaconMaterial.color.setRGB(.3*signal,3.4*signal,2.9*signal);
    camera.updateMatrixWorld(true);camera.getWorldDirection(cameraForward);sunDirection.copy(sun.position).sub(camera.position);
    projected.copy(sun.position).project(camera);
    const uvX=projected.x*.5+.5,uvY=projected.y*.5+.5;
    const edgeFade=1-THREE.MathUtils.smoothstep(Math.max(Math.abs(uvX-.5),Math.abs(uvY-.5)),.5,.7);
    solarVisibility=cameraForward.dot(sunDirection)>0?visibleSolarFraction(camera.position,sun.position)*edgeFade:0;
    // The optical center follows the visible crescent, rather than the hidden disc center.
    planetProjection.set(0,0,0).project(camera);
    flareOffset.set((projected.x-planetProjection.x)*camera.aspect,projected.y-planetProjection.y).normalize();
    const sunScreenRadius=(7/sunDirection.length())/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)));
    const crescentShift=(1-solarVisibility)*sunScreenRadius*.9;
    flare.uniforms.uSunUV.value.set(uvX+flareOffset.x*crescentShift/camera.aspect,uvY+flareOffset.y*crescentShift);
    flare.uniforms.uAspect.value=camera.aspect;flare.uniforms.uVisibility.value=solarVisibility;
  }
  function diagnostics(){return {solarVisibility,sunUV:flare.uniforms.uSunUV.value.toArray(),moonPosition:moon.position.toArray(),probePosition:probe.position.toArray(),moonRadius:.36,probeScale:.035,nebulaLayers:clouds.children.length};}
  return {flare,update,diagnostics,dispose:()=>textures.forEach(texture=>texture.dispose())};
}
