import { Group, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { posts, postHref } from '../content/journal.js';
import { safeArc } from '../exploration-math.js';
import { GAS_END } from '../journey.js';
import { PLANET_RADIUS } from '../flight.js';
import { BOOST_SPEED, DOCK, STATION, createFlightState, fly, orient, resolveContact } from './flight.js';
import { createShip, createStation, createBeacons, disposeModel } from './models.js';
import { createEffects, ringDebris } from './effects.js';
import { createPilotHUD } from './hud.js';

export function createPilot({universe, audio, reader, button, reducedMotion, routePose, lockFlight, resumeFlight}) {
  const {camera, scene, anchors}=universe;
  const world=new Group(), model=createShip(), ship=model.ship, station=createStation(), beacons=createBeacons(posts);
  const effects=createEffects(ship), {debris,rocks}=ringDebris(anchors.rocks);
  world.add(ship,station.station,beacons.group,debris,effects.group);
  station.station.position.copy(STATION); world.visible=false;
  const targets=[{id:'station',title:'中继空间站',position:DOCK,range:.43},...beacons.targets];
  const navTargets=[...targets,{id:'planet',title:'气态巨行星',position:new Vector3()}];
  const hud=createPilotHUD(targets,{interact,exit,cycle,acceptsInput:()=>mode==='cruising'&&!suspended});
  const chapterNav=document.querySelector('.flight-navigation'), caption=document.querySelector('.film-caption');
  const home=document.querySelector('.orbit-symbol'), hot=document.querySelector('#hotspots');
  const chase=new PerspectiveCamera(), route=new PerspectiveCamera();
  const from=new PerspectiveCamera(), look=new Vector3(), inverseRing=new Matrix4(), axis=new Vector3(0,0,1);
  const entryPosition=new Vector3(), departurePoint=new Vector3(), entryAttitude=new Quaternion();
  let state=createFlightState(), mode='idle', suspended=false, routeProgress=0, sceneProgress=0, relayStart=0;
  let phaseTime=0, clock=0, lastHit=-10, lastContact=null, hits=0, selected=0, nearby=null, actionTarget=null, releaseYaw=0, releasePitch=0;
  let returnCallback;

  function phase(next){mode=next;phaseTime=0;hud.setMode(next);}
  function reflect(active){
    document.body.classList.toggle('piloting',active);
    document.documentElement.classList.toggle('pilot-locked',active);
    button.textContent=active?'EXIT PILOT':'PILOT SHIP';button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'EXIT PILOT / 退出驾驶，返回航线':'PILOT SHIP / 驾驶探索');
    for(const el of [chapterNav,caption,hot])el.inert=active;
    caption.setAttribute('aria-hidden',String(active));home.disabled=active;
    document.querySelector('#orbit-button').disabled=active;
    hud.show(active);
  }
  function cycle(){selected=(selected+1)%navTargets.length;}
  function positionShip(){
    ship.position.copy(state.position);
    ship.quaternion.copy(state.attitude);
    ship.rotateZ(state.bank);
  }
  function chasePose(){
    const portrait=camera.aspect<.8;
    chase.position.set(0,portrait?.54:.48,(portrait?1.53:1.18)+state.boost*.09)
      .applyQuaternion(state.attitude).add(state.position);
    if(chase.position.length()<PLANET_RADIUS+.06)chase.position.setLength(PLANET_RADIUS+.06);
    look.set(0,.055,-.82).applyQuaternion(state.attitude).add(state.position);
    chase.lookAt(look);chase.rotateZ(reducedMotion.matches?0:state.bank*.13);
    chase.fov=(portrait?56:53)+(reducedMotion.matches?3:13)*state.boost;
  }
  function follow(dt){
    chasePose();
    camera.position.lerp(chase.position,1-Math.exp(-6.4*dt));
    if(camera.position.length()<PLANET_RADIUS+.055)camera.position.setLength(PLANET_RADIUS+.055);
    camera.quaternion.slerp(chase.quaternion,1-Math.exp(-7.5*dt));
    camera.fov=MathUtils.damp(camera.fov,chase.fov,5,dt);camera.updateProjectionMatrix();
  }
  function mixCamera(dest,t){
    safeArc(from.position,dest.position,t,camera.position);
    camera.quaternion.slerpQuaternions(from.quaternion,dest.quaternion,t);
    camera.fov=MathUtils.lerp(from.fov,dest.fov,t);
    const ax=from.view?.enabled?from.view.offsetX/from.view.fullWidth:0;
    const ay=from.view?.enabled?from.view.offsetY/from.view.fullHeight:0;
    const bx=dest.view?.enabled?dest.view.offsetX/dest.view.fullWidth:0;
    const by=dest.view?.enabled?dest.view.offsetY/dest.view.fullHeight:0;
    camera.setViewOffset(innerWidth,innerHeight,MathUtils.lerp(ax,bx,t)*innerWidth,MathUtils.lerp(ay,by,t)*innerHeight,innerWidth,innerHeight);
  }
  function startBoarding(){from.copy(camera,false);world.visible=true;phase('boarding');}
  function enter(progress){
    if(mode!=='idle')return;
    state=createFlightState(); routeProgress=sceneProgress=progress;selected=0;nearby=actionTarget=null;
    clock=0;lastHit=-10;lastContact=null;hits=0;suspended=false;returnCallback=null;
    scene.add(world);
    lockFlight(false);reflect(true);hud.suspend(false);effects.reset();positionShip();
    if(progress>GAS_END+.00001){relayStart=progress;phase('inbound');}
    else startBoarding();
  }
  function finishExit(){
    world.visible=false;world.removeFromParent();phase('idle');reflect(false);audio.pilotDrive(null);
    resumeFlight();button.focus({preventScroll:true});
    const callback=returnCallback;returnCallback=null;callback?.();
  }
  function exit(callback){
    if(mode==='idle'){callback?.();return;}
    if(callback)returnCallback=callback;
    if(mode==='returning'||mode==='outbound')return;
    nearby=actionTarget=null;effects.scan(null);audio.pilotDrive(null);
    if(mode==='inbound'){relayStart=sceneProgress;phase('outbound');}
    else{from.copy(camera,false);phase('returning');}
  }
  function proximity(){
    let closest=null,distance=Infinity;
    for(const target of targets){
      const d=state.position.distanceToSquared(target.position);
      const inside=target.post?d<target.range**2:
        Math.hypot(state.position.x-DOCK.x,state.position.y-DOCK.y)<.315&&Math.abs(state.position.z-DOCK.z)<target.range;
      if(inside&&d<distance){closest=target;distance=d;}
    }
    return closest;
  }
  function interact(){
    if(mode!=='cruising'||suspended)return;
    const target=proximity();
    if(!target)return;
    selected=targets.indexOf(target);actionTarget=target;nearby=null;
    entryPosition.copy(state.position);entryAttitude.copy(ship.quaternion);
    state.velocity.set(0,0,0);state.yawRate=state.pitchRate=0;
    phase(target.post?'scanning':'docking');
  }
  function suspend(value){
    suspended=value;hud.suspend(value);
    if(value)audio.pilotDrive(null);
    if(!value&&mode==='docked'){
      selected=targets.length>1?1:0;
      entryPosition.copy(state.position);
      departurePoint.copy(DOCK);departurePoint.z+=.38;
      look.subVectors(targets[selected].position,departurePoint);
      releaseYaw=targets.length>1?Math.atan2(-look.x,-look.z):Math.PI;
      releasePitch=targets.length>1?Math.atan2(look.y,Math.hypot(look.x,look.z)):0;
      phase('releasing');
    }
  }
  function move(dt){
    const input=hud.commands();
    const steps=Math.max(1,Math.ceil(dt/.016));
    for(let i=0;i<steps;i++){
      fly(state,input,dt/steps);
      const contact=resolveContact(state,rocks,debris.matrix,inverseRing);
      if(contact&&clock-lastHit>.55){
        lastHit=clock;lastContact=contact;hits++;
        effects.impact(look.copy(state.position).addScaledVector(state.forward,.13));audio.shieldImpact();
      }
    }
    positionShip();follow(dt);nearby=proximity();
  }
  function interactFrame(dt){
    const duration=mode==='scanning'?.76:mode==='docking'?1.18:1.0;
    const t=Math.min(phaseTime/duration,1), eased=MathUtils.smootherstep(t,0,1);
    state.power=MathUtils.damp(state.power,.08,5,dt);state.boost=MathUtils.damp(state.boost,0,5,dt);
    if(mode==='docking'){
      state.position.copy(entryPosition).lerp(look.copy(STATION).addScaledVector(axis,.67),eased);
      ship.position.copy(state.position);ship.quaternion.copy(entryAttitude).slerp(chaseAlignment,eased);
      state.attitude.copy(ship.quaternion);state.bank=0;
    }else if(mode==='releasing'){
      state.position.copy(entryPosition).lerp(departurePoint,eased);
      state.yaw=releaseYaw*eased;state.pitch=releasePitch*eased;orient(state);positionShip();
    }else effects.scan(actionTarget,t,camera);
    follow(dt);
    if(t<1)return;
    if(mode==='docking'){
      state.pitch=state.yaw=0;orient(state);phase('docked');
      reader.open('#projects',button);
    }else if(mode==='scanning'){
      effects.scan(null);phase('cruising');reader.open(postHref(actionTarget.post),button);
    }else phase('cruising');
    actionTarget=null;
  }
  const chaseAlignment=new Quaternion();
  function update(dt){
    if(suspended||mode==='idle')return;
    clock+=dt;phaseTime+=dt;
    anchors.rings.updateWorldMatrix(true,false);
    debris.matrix.copy(anchors.rings.matrixWorld);debris.matrixWorldNeedsUpdate=true;
    inverseRing.copy(debris.matrix).invert();
    if(mode==='inbound'||mode==='outbound'){
      const t=MathUtils.smootherstep(phaseTime/(reducedMotion.matches?.25:1.35),0,1);
      sceneProgress=MathUtils.lerp(relayStart,mode==='inbound'?GAS_END:routeProgress,t);
      routePose(camera,sceneProgress);
      if(t===1){if(mode==='inbound')startBoarding();else finishExit();}
    }else if(mode==='boarding'||mode==='returning'){
      const t=MathUtils.smootherstep(phaseTime/(reducedMotion.matches?.18:1.5),0,1);
      if(mode==='boarding'){
        chasePose();mixCamera(chase,t);
        if(t===1){camera.clearViewOffset();phase('cruising');}
      }else{
        routePose(route,Math.min(routeProgress,GAS_END));mixCamera(route,t);
        if(t===1){
          if(routeProgress>GAS_END+.00001){world.visible=false;relayStart=GAS_END;phase('outbound');}
          else finishExit();
        }
      }
    }else if(mode==='cruising')move(dt);
    else if(mode!=='docked')interactFrame(dt);
    if(mode==='idle')return;
    station.update(clock);beacons.update(clock);effects.update(dt,state);
    if(!suspended&&['cruising','scanning','docking','releasing'].includes(mode)){
      audio.pilotDrive(Math.min(1,state.velocity.length()/BOOST_SPEED*.74+state.power*.26));
    }
    camera.updateMatrixWorld();
    const message=mode==='scanning'?'SCANNING  /  正在解码':mode==='docking'?'DOCKING  /  对接中':
      mode==='releasing'?'UNDOCKING  /  离港':clock-lastHit<.6?'SHIELD  /  护盾接触':'';
    if(world.visible)hud.update(state,camera,navTargets[selected],mode==='cruising'?nearby:null,message,clock);
  }
  return {enter,exit,update,suspend,get active(){return mode!=='idle';},get progress(){return sceneProgress;},
    diagnostics:()=>({mode,suspended,position:state.position.toArray(),velocity:state.velocity.toArray(),speed:state.velocity.length(),
      yaw:state.yaw,pitch:state.pitch,yawRate:state.yawRate,pitchRate:state.pitchRate,bank:state.bank,boost:state.boost,
      hits,lastContact,near:nearby?.id??null,selected:navTargets[selected].id,
      targets:targets.map(t=>({id:t.id,position:t.position.toArray()})),
      beltRock:rocks[anchors.rocks.count].center.clone().applyMatrix4(debris.matrix).toArray()}),
    dispose(){audio.pilotDrive(null);model.markDisposed();hud.dispose();world.removeFromParent();disposeModel(world);}};
}
