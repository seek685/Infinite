import { AnimationMixer, LoadingManager, LoopRepeat } from 'three';
import { fitModel, stationMount } from './model-fit.js';
import { disposeModel } from './models.js';

export function createModelAssets(model,station,lighting) {
  const status={ship:'procedural',station:'procedural'};
  const mixers=[];
  const manager=new LoadingManager();
  let disposed=false,berth=null,stationAnimated=false;

  async function replace(loader,kind,enabled) {
    if(!enabled)return;
    status[kind]='loading';
    let root,mixer;
    try{
      const gltf=await loader.loadAsync('/models/'+kind+'.glb');
      root=gltf.scene;
      if(disposed)return;
      const fit=fitModel(root,kind);
      if(!fit)return;
      lighting.illuminate(fit.fitted,true);
      if(gltf.animations.length){
        mixer=new AnimationMixer(root);
        for(const clip of gltf.animations)mixer.clipAction(clip).setLoop(LoopRepeat,Infinity).play();
        mixer.update(0);
      }
      if(kind==='ship'){
        model.ship.add(fit.fitted);
        for(const [i,side] of ['L','R'].entries()){
          model.mounts.thrusters[i]=root.getObjectByName('Thruster_'+side)||model.mounts.thrusters[i];
          model.mounts.wingtips[i]=root.getObjectByName('Wingtip_'+side)||model.mounts.wingtips[i];
        }
        model.mounts.nose=root.getObjectByName('Nose')||model.mounts.nose;
        model.hull.visible=false;
      }else{
        berth=stationMount(fit.fitted,fit.front);
        station.station.add(berth.carrier);
        stationAnimated=!!mixer;station.hull.visible=false;
      }
      if(mixer)mixers.push(mixer);
      status[kind]='glb';
    }finally{
      // Keep each procedural hull live until its own complete replacement commits.
      if(status[kind]!=='glb'){
        status[kind]='procedural';
        if(mixer){mixer.stopAllAction();mixer.uncacheRoot(root);}
        if(root)disposeModel(root);
      }
    }
  }
  async function preload() {
    if(!import.meta.env.PILOT_SHIP_GLB&&!import.meta.env.PILOT_STATION_GLB)return;
    const [{GLTFLoader},{DRACOLoader}]=await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),import('three/addons/loaders/DRACOLoader.js'),
    ]);
    if(disposed)return;
    const draco=new DRACOLoader(manager).setDecoderPath('/draco/').setWorkerLimit(2);
    const loader=new GLTFLoader(manager).setDRACOLoader(draco);
    try{
      await Promise.allSettled([
        replace(loader,'ship',import.meta.env.PILOT_SHIP_GLB),
        replace(loader,'station',import.meta.env.PILOT_STATION_GLB),
      ]);
    }finally{draco.dispose();}
  }
  const ready=preload().catch(()=>{}); // A failed optional loader chunk also leaves both hulls usable.
  return {status,ready,update(dt,time){
    for(const mixer of mixers)mixer.update(dt);
    if(berth)berth.align(stationAnimated?0:time*.085);
  },dispose(){
    disposed=true;manager.abort();
    for(const mixer of mixers){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());}
    mixers.length=0;
  }};
}
