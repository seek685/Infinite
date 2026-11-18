import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { safeArc, planetOccludes, MIN_ORBIT_RADIUS } from './exploration-math.js';
import { postForAnchor, postHref } from './content/journal.js';

const observations=[
  {id:'storm',label:'STORM EYE',title:'风暴巨眼',parent:'planet',point:[.34,.13,.94],radius:2.84,
    copy:'巨大的椭圆涡旋，被相邻纬度的高速云带不断拉伸。明暗交错的细丝，记录着差速自转与深层对流在云顶留下的痕迹。'},
  {id:'division',label:'CASSINI DIVISION',title:'卡西尼环缝',parent:'rings',point:[Math.sin(.88),0,Math.cos(.88)],radius:5.16,
    copy:'看似空白的环缝，仍有稀薄尘埃穿行。这里以土星卡西尼缝为灵感：轨道共振持续扰动冰粒，雕刻出星环之间的暗色边界。'},
  {id:'ionosphere',label:'POLAR IONOSPHERE',title:'极光电离层',parent:'planet',point:[-.24,.82,.52],radius:2.94,
    copy:'在高纬度的稀薄大气中，带电粒子沿磁场汇入极区。遥望这道青色地平线，想象粒子激发气体时，短暂点亮的极光。'},
];

export function createExploration({camera,canvas,anchors,reducedMotion,lockFlight,resumeFlight,routePose,orbitContext=()=>null}){
  const button=document.querySelector('#orbit-button'),layer=document.querySelector('#hotspots');
  const record=document.querySelector('#field-record'),closeButton=document.querySelector('#record-close');
  const articleLink=record.querySelector('#record-article');
  const caption=document.querySelector('.film-caption'),navigation=document.querySelector('.flight-navigation');
  const scratchCamera=new PerspectiveCamera(),projected=new Vector3(),direction=new Vector3(),normal=new Vector3(),tangent=new Vector3();
  const target=new Vector3();
  const center=new Vector3(),relativeStart=new Vector3(),relativeEnd=new Vector3();
  let minDistance=MIN_ORBIT_RADIUS,maxDistance=42;
  let controls,mode='flight',selected=null,transition=null,elapsed=0,afterExit;
  const pins=observations.map((data,index)=>{
    const element=document.createElement('button');element.className='hotspot';element.dataset.hotspot=data.id;
    element.setAttribute('aria-label',`探索${data.title}`);element.setAttribute('aria-pressed','false');element.hidden=true;
    element.style.setProperty('--pulse-delay',`${index*-.9}s`);
    const label=document.createElement('span');label.className='hotspot-label';label.textContent=`0${index+1} / ${data.label}`;
    element.append(label);layer.append(element);
    const pin={...data,element,local:new Vector3(...data.point).normalize().multiplyScalar(data.radius),world:new Vector3(),visible:false};
    element.addEventListener('click',()=>focus(pin));return pin;
  });

  function worldPoint(pin){
    pin.world.copy(pin.local);
    if(pin.id==='storm'){
      // Follow the existing shader's latitude-dependent cloud drift as well as mesh rotation.
      const drift=elapsed*.012*(.16+Math.sin(pin.local.y/pin.radius*9)*.07);
      pin.world.applyAxisAngle(new Vector3(0,1,0),-drift);
    }
    anchors[pin.parent].localToWorld(pin.world);return pin.world;
  }
  function reflect(){
    const active=mode!=='flight';
    document.body.classList.toggle('exploring',active);document.documentElement.classList.toggle('orbit-locked',active);
    button.textContent=active?'EXIT ORBIT':'FREE ORBIT';button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'返回八幕航线':'自由漫游：拖拽环绕，滚轮缩放');
    caption.inert=active;caption.setAttribute('aria-hidden',String(active));navigation.inert=active;
    document.querySelector('.orbit-symbol').disabled=active;
    document.querySelector('.orbit-instructions').textContent=(matchMedia('(pointer: coarse)').matches?'单指环绕 · 双指缩放':'拖拽环绕 · 滚轮缩放')+(center.lengthSq()===0?' · 点击光标探索':'');
  }
  function hideRecord(){
    selected=null;record.classList.remove('is-open');record.setAttribute('aria-hidden','true');record.inert=true;
    document.body.classList.remove('record-open');pins.forEach(pin=>pin.element.setAttribute('aria-pressed','false'));
  }
  function showRecord(pin){
    document.querySelector('#record-number').textContent=`FIELD NOTE / 0${pins.indexOf(pin)+1}`;
    document.querySelector('#record-kicker').textContent=pin.label;
    document.querySelector('#record-title').textContent=pin.title;
    document.querySelector('#record-copy').textContent=pin.copy;
    const post=postForAnchor(pin.id);
    articleLink.hidden=!post;
    if(post){
      articleLink.href=postHref(post);
      articleLink.setAttribute('aria-label',`阅读日志《${post.title}》`);
    }else articleLink.removeAttribute('href');
    record.classList.add('is-open');record.setAttribute('aria-hidden','false');record.inert=false;
    document.body.classList.add('record-open');closeButton.focus({preventScroll:true});
  }
  function pose(position,lookAt,fov=50){
    scratchCamera.position.copy(position);scratchCamera.up.set(0,1,0);scratchCamera.lookAt(lookAt);
    return {position:position.clone(),quaternion:scratchCamera.quaternion.clone(),fov,offset:0,offsetY:0};
  }
  function connectControls(){
    controls?.dispose();
    const orientation=camera.quaternion.clone();
    controls=new OrbitControls(camera,canvas);controls.target.copy(target);
    controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;
    controls.rotateSpeed=.55;controls.zoomSpeed=.65;controls.minDistance=selected?.65:minDistance;controls.maxDistance=maxDistance;
    controls.cursorStyle='grab';controls.update();camera.quaternion.copy(orientation);
  }
  function animateTo(destination,onComplete,duration=1.7){
    transition?.tween.kill();if(controls)controls.enabled=false;
    const from={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,offset:camera.view?.enabled?camera.view.offsetX/camera.view.fullWidth:0,offsetY:camera.view?.enabled?camera.view.offsetY/camera.view.fullHeight:0};
    const next={from,destination,onComplete,progress:0,done:false};
    next.tween=gsap.to(next,{progress:1,duration:reducedMotion.matches?.01:duration,ease:'power2.inOut',onComplete:()=>{next.done=true;}});
    transition=next;
  }
  function activate(){
    if(mode==='flight'){
      lockFlight();const context=orbitContext();center.copy(context?.center||new Vector3());minDistance=context?.minDistance||MIN_ORBIT_RADIUS;maxDistance=context?.maxDistance||42;
    }
    mode='entering';afterExit=undefined;hideRecord();reflect();
  }
  function enter(){
    activate();target.copy(center);
    const destination=pose(camera.position,target,50);
    animateTo(()=>destination,()=>{mode='orbit';connectControls();},1.2);
  }
  function exit(callback){
    if(mode==='flight'){callback?.();return;}
    afterExit=callback;mode='returning';hideRecord();reflect();
    animateTo(()=>{
      routePose(scratchCamera);
      return {position:scratchCamera.position,quaternion:scratchCamera.quaternion,fov:scratchCamera.fov,offset:scratchCamera.view?.enabled?scratchCamera.view.offsetX/scratchCamera.view.fullWidth:0,offsetY:scratchCamera.view?.enabled?scratchCamera.view.offsetY/scratchCamera.view.fullHeight:0};
    },()=>{
      controls?.dispose();controls=null;mode='flight';canvas.style.touchAction='pan-y';canvas.style.cursor='';
      reflect();resumeFlight();button.focus({preventScroll:true});const callback=afterExit;afterExit=undefined;callback?.();
    },1.8);
  }
  function focus(pin){
    activate();selected=pin;mode='focusing';pin.element.setAttribute('aria-pressed','true');
    animateTo(()=>{
      worldPoint(pin);target.copy(pin.world);
      const position=pin.world.clone();
      if(pin.id==='division'){
        normal.set(0,1,0).transformDirection(anchors.rings.matrixWorld);
        tangent.crossVectors(normal,pin.world).normalize();
        position.addScaledVector(normal,1.15).addScaledVector(tangent,.65).addScaledVector(pin.world.clone().normalize(),.32);
      }else if(pin.id==='ionosphere'){
        normal.copy(pin.world).normalize();tangent.crossVectors(normal,new Vector3(0,1,0)).normalize();
        position.addScaledVector(tangent,3.5).addScaledVector(normal,.12);
      }else position.setLength(3.64);
      return pose(position,target,pin.id==='division'?56:58);
    },()=>{mode='orbit';connectControls();showRecord(pin);},2.1);
  }
  function closeRecord(){
    if(!selected)return;
    hideRecord();mode='entering';target.set(0,0,0);
    const position=camera.position.clone().setLength(Math.max(camera.position.length(),8.4));
    const destination=pose(position,target,50);
    animateTo(()=>destination,()=>{mode='orbit';connectControls();button.focus({preventScroll:true});},1.2);
  }
  const toggle=()=>{if(mode==='flight'||mode==='returning')enter();else exit();};
  const keydown=event=>{
    if(event.key==='Escape'&&mode!=='flight'){event.preventDefault();if(selected)closeRecord();else exit();}
  };
  button.addEventListener('click',toggle);closeButton.addEventListener('click',closeRecord);document.addEventListener('keydown',keydown);

  function update(delta,time){
    elapsed=time;
    if(transition){
      const next=transition,destination=next.destination(),t=next.progress;
      relativeStart.copy(next.from.position).sub(center);relativeEnd.copy(destination.position).sub(center);
      safeArc(relativeStart,relativeEnd,t,camera.position).add(center);
      camera.quaternion.slerpQuaternions(next.from.quaternion,destination.quaternion,t);
      camera.fov=MathUtils.lerp(next.from.fov,destination.fov,t);
      const offset=MathUtils.lerp(next.from.offset,destination.offset,t);
      const offsetY=MathUtils.lerp(next.from.offsetY,destination.offsetY,t);
      camera.setViewOffset(innerWidth,innerHeight,offset*innerWidth,offsetY*innerHeight,innerWidth,innerHeight);
      if(next.done){transition=null;next.onComplete();}
    }else if(mode==='orbit'){
      if(selected){
        worldPoint(selected);direction.copy(selected.world).sub(controls.target);camera.position.add(direction);controls.target.copy(selected.world);
      }
      controls.update(delta);
      direction.copy(camera.position).sub(center);
      if(direction.length()<minDistance){camera.position.copy(direction.setLength(minDistance)).add(center);camera.lookAt(controls.target);}
    }
  }
  function projectHotspots(time,enabled=true){
    if(!enabled){pins.forEach(pin=>{pin.visible=false;pin.element.hidden=true;});return;}
    elapsed=time;camera.updateMatrixWorld(true);
    const captionBounds=mode==='flight'?caption.getBoundingClientRect():null;
    const recordBounds=record.classList.contains('is-open')?record.getBoundingClientRect():null;
    for(const pin of pins){
      worldPoint(pin);projected.copy(pin.world).project(camera);
      const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
      const overlaps=rect=>rect&&x>rect.left-22&&x<rect.right+22&&y>rect.top-22&&y<rect.bottom+22;
      pin.visible=projected.z>-1&&projected.z<1&&x>24&&x<innerWidth-24&&y>105&&y<innerHeight-100&&!planetOccludes(camera.position,pin.world)&&!overlaps(captionBounds)&&!overlaps(recordBounds);
      pin.element.hidden=!pin.visible;pin.element.disabled=!!transition;
      if(pin.visible)pin.element.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    }
  }
  function diagnostics(){return {mode,selected:selected?.id||null,controlsEnabled:controls?.enabled||false,transition:!!transition,target:controls?.target.toArray()||[0,0,0],hotspots:pins.map(pin=>({id:pin.id,visible:pin.visible,position:pin.world.toArray()}))};}
  function setSuspended(suspended){
    transition?.tween.paused(suspended);
    if(controls&&mode==='orbit')controls.enabled=!suspended;
  }
  function dispose(){transition?.tween.kill();controls?.dispose();pins.forEach(pin=>pin.element.remove());button.removeEventListener('click',toggle);closeButton.removeEventListener('click',closeRecord);document.removeEventListener('keydown',keydown);}
  return {get active(){return mode!=='flight';},update,projectHotspots,exit,setSuspended,diagnostics,dispose};
}
