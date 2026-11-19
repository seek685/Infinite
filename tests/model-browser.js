// Browser-only probe for the isolated build made by verify:models.
import { Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { createShip, createStation, disposeModel } from '../src/pilot/models.js';
import { createModelAssets } from '../src/pilot/model-assets.js';
import { createPilotLighting } from '../src/pilot/lighting.js';
import { createEffects } from '../src/pilot/effects.js';
import { PORT_FACE } from '../src/pilot/model-config.js';

function reflectedLight(renderer,hull) {
  const scene=new Scene(),material=hull.material.clone(),sample=new Mesh(hull.geometry,material);
  scene.add(sample);material.emissiveIntensity=0;
  const camera=new PerspectiveCamera(42,1,.01,40);camera.position.set(3,2,6);camera.lookAt(0,0,0);
  const target=new WebGLRenderTarget(64,64),pixels=new Uint8Array(64*64*4);
  function measure(){
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
    return pixels.reduce((sum,x,i)=>i%4===3?sum:sum+x,0);
  }
  const lit=measure();material.envMapIntensity=0;const dark=measure();
  renderer.setRenderTarget(null);material.dispose();target.dispose();
  return lit-dark;
}

window.checkFlightModels=async function(){
  const renderer=new WebGLRenderer({antialias:false}),world=new Scene();
  const model=createShip(),station=createStation(),effects=createEffects(model.ship,model.mounts);
  world.add(model.ship,station.station,effects.group);model.ship.position.set(1,.2,6);model.ship.rotation.y=.5;
  station.station.position.set(1,.8,3);
  const camera=new PerspectiveCamera(52,1,.01,30);camera.position.set(1,1,7);camera.lookAt(model.ship.position);
  const lighting=createPilotLighting(renderer,world);lighting.illuminate(model.hull);lighting.illuminate(station.station);
  const assets=createModelAssets(model,station,lighting);
  const report={startsWithFallback:model.hull.visible&&station.hull.visible};
  try{
    await assets.ready;
    Object.assign(report,{models:{...assets.status},shipFallback:model.hull.visible,stationFallback:station.hull.visible});
    const point=node=>node.getWorldPosition(new Vector3());
    const exhaust=model.mounts.thrusters[0],first=point(exhaust);
    assets.update(.5,.5);const middle=point(exhaust);
    if(assets.status.ship==='glb'){
      const hull=model.ship.getObjectByName('FixtureHull'),other=station.station.getObjectByName('FixtureHull');
      report.geometry=hull.geometry.attributes.position.count;
      report.physical=hull.material.isMeshPhysicalMaterial;
      report.emission=hull.material.emissiveIntensity;
      report.sharedReflection=!other||hull.material.envMap===other.material.envMap;
      report.reflectedLight=reflectedLight(renderer,hull);
      report.socketTravel=first.distanceTo(middle);
    }
    const state={power:.6,velocity:new Vector3(0,0,1)};
    const vertices=object=>object.geometry.getAttribute('position');
    const vertex=(object,i=0)=>new Vector3().fromBufferAttribute(vertices(object),i);
    effects.update(0,state);
    const jets=model.ship.children.find(o=>o.isPoints);
    report.jetError=model.ship.localToWorld(vertex(jets)).distanceTo(middle);
    effects.update(.025,state);effects.update(.025,state);
    const trail=effects.group.children.find(o=>o.isLineSegments);
    report.trailError=model.mounts.wingtips.reduce((sum,node,i)=>sum+vertex(trail,i*2).distanceTo(point(node)),0);
    effects.scan({position:station.station.position},.4,camera);
    const beam=effects.group.children.find(o=>o.isLine&&!o.isLineSegments);
    report.scanError=vertex(beam).distanceTo(point(model.mounts.nose));
    if(assets.status.station==='glb'){
      const port=station.station.getObjectByName('DockingPort');
      report.portError=point(port).distanceTo(station.station.localToWorld(PORT_FACE.clone()));
      report.portNormalError=port.getWorldDirection(new Vector3()).distanceTo(new Vector3(0,0,1));
      report.gateClearance=point(port).distanceTo(point(station.gate));
    }
    assets.update(.5,1);report.loopError=point(exhaust).distanceTo(first);
    lighting.update(model.ship,camera);renderer.render(world,camera);
    report.glError=renderer.getContext().getError();
    report.shadersCompiled=renderer.info.programs.every(p=>p.diagnostics?.runnable!==false);
    return report;
  }finally{assets.dispose();disposeModel(world);lighting.dispose();renderer.dispose();}
};
