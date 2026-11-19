import * as T from 'three';

export function ringDebris(source) {
  const rocks = [], frame = new T.Matrix4(), scale = new T.Vector3();
  for (let i=0;i<source.count;i++) {
    source.getMatrixAt(i,frame);
    scale.setFromMatrixScale(frame);
    rocks.push({center:new T.Vector3().setFromMatrixPosition(frame),radius:Math.max(scale.x,scale.y,scale.z)});
  }
  const count = 38;
  const debris = new T.InstancedMesh(source.geometry.clone(),source.material.clone(),count);
  const rock = new T.Object3D();
  for (let i=0;i<count;i++) {
    const a=.96+i*2.39996, r=4.1+(i%7)*.27, size=.045+(i%4)*.014;
    rock.position.set(r*Math.cos(a),.066*Math.sin(i*7),r*Math.sin(a));
    if(i===0)rock.position.set(1.12,-.012,5.15);
    rock.rotation.set(i*.23,i*.81,i);
    rock.scale.set(size,size*.83,size*1.18);
    rock.updateMatrix();
    debris.setMatrixAt(i,rock.matrix);
    rocks.push({center:rock.position.clone(),radius:size*1.14});
  }
  debris.matrixAutoUpdate=false;
  return {debris,rocks};
}

function dynamicGeometry(count, colored=false) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage));
  if(colored)g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage));
  return g;
}

export function createEffects(ship,mounts) {
  const group=new T.Group(), head=new T.Vector3(), end=new T.Vector3();
  const shipInverse=new T.Matrix4(), relative=new T.Matrix4(), nozzles=[new T.Matrix4(),new T.Matrix4()];
  const particle=new T.Vector3();
  const jets=dynamicGeometry(88,true);
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(16,16,0,16,16,16);
  gradient.addColorStop(0,'#fff'); gradient.addColorStop(.28,'#c8dded'); gradient.addColorStop(1,'#000');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,32,32);
  const jetPoints=new T.Points(jets,new T.PointsMaterial({map:new T.CanvasTexture(canvas),size:.016,
    vertexColors:true,transparent:true,opacity:.48,depthWrite:false,blending:T.AdditiveBlending}));
  jetPoints.frustumCulled=false; ship.add(jetPoints);
  const emission=Array.from({length:88},(_,i)=>({phase:(i*.618034)%1,angle:i*2.4,rad:Math.sqrt((i*.75488)%1)}));
  const trailLength=28, trailGeo=dynamicGeometry((trailLength-1)*4,true);
  const trail=new T.LineSegments(trailGeo,new T.LineBasicMaterial({vertexColors:true,transparent:true,
    opacity:.42,depthWrite:false,blending:T.AdditiveBlending}));
  const traces=Array.from({length:2},()=>Array.from({length:trailLength},()=>new T.Vector3()));
  let trailTick=0, traceCount=0, emissionPhase=0;
  trail.frustumCulled=false; group.add(trail);
  const sparkCount=20, sparkGeo=dynamicGeometry(sparkCount*2);
  const sparks=new T.LineSegments(sparkGeo,new T.LineBasicMaterial({color:new T.Color(2.8,1.55,.59),
    transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  sparks.frustumCulled=false; sparks.visible=false; group.add(sparks);
  const sparkOrigin=new T.Vector3(), rays=Array.from({length:sparkCount},()=>new T.Vector3());
  let sparkAge=1;
  const beamGeo=dynamicGeometry(2);
  const beam=new T.Line(beamGeo,new T.LineBasicMaterial({color:new T.Color(.5,2.9,3.2),transparent:true,
    depthWrite:false,blending:T.AdditiveBlending}));
  const pulse=new T.Mesh(new T.TorusGeometry(.085,.004,6,40),new T.MeshBasicMaterial({
    color:new T.Color(.42,2.2,2.5),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  beam.frustumCulled=false; beam.visible=pulse.visible=false; group.add(beam,pulse);
  function update(dt,state) {
    const power=state.power, speed=state.velocity.length();
    ship.updateWorldMatrix(true,false);
    shipInverse.copy(ship.matrixWorld).invert();
    mounts.thrusters.forEach((socket,i)=>{
      socket.updateWorldMatrix(true,false);
      relative.multiplyMatrices(shipInverse,socket.matrixWorld);
      // Follow an animated nozzle's direction, keeping plume length in flight units.
      nozzles[i].extractRotation(relative).setPosition(particle.setFromMatrixPosition(relative));
    });
    emissionPhase+=dt*(2.7+power*1.8);
    emission.forEach(({phase,angle,rad},i)=>{
      const age=(phase+emissionPhase)%1, width=(.005+.013*(1-age)) * rad;
      particle.set(Math.cos(angle)*width,Math.sin(angle)*width,age*(.071+power*.26)).applyMatrix4(nozzles[i%2]);
      jets.attributes.position.setXYZ(i,particle.x,particle.y,particle.z);
      const light=(1-age)**1.4*(.30+power);
      jets.attributes.color.setXYZ(i,light*.7,light*2.35,light*3.7);
    });
    jets.attributes.position.needsUpdate=jets.attributes.color.needsUpdate=true;
    trailTick+=dt;
    if(trailTick>=1/45) {
      trailTick%=1/45; traceCount=Math.min(traceCount+1,trailLength);
      traces.forEach((history,side)=>{
        const latest=history.pop();
        mounts.wingtips[side].getWorldPosition(latest);
        history.unshift(latest);
      });
      let n=0;
      for(const history of traces)for(let i=1;i<traceCount;i++) {
        for(let j=i-1;j<=i;j++){
          const point=history[j],alpha=(1-j/(trailLength-1))**2*Math.min(1,speed);
          trailGeo.attributes.position.setXYZ(n,point.x,point.y,point.z);
          trailGeo.attributes.color.setXYZ(n++,alpha*.31,alpha*.79,alpha);
        }
      }
      trailGeo.setDrawRange(0,n);
      trailGeo.attributes.position.needsUpdate=trailGeo.attributes.color.needsUpdate=true;
    }
    sparkAge+=dt; sparks.visible=sparkAge<.42;
    if(sparks.visible){
      sparks.material.opacity=(1-sparkAge/.42)**1.1;
      rays.forEach((ray,i)=>{
        head.copy(sparkOrigin).addScaledVector(ray,sparkAge);
        end.copy(head).addScaledVector(ray,.022);
        sparkGeo.attributes.position.setXYZ(i*2,head.x,head.y,head.z);
        sparkGeo.attributes.position.setXYZ(i*2+1,end.x,end.y,end.z);
      });
      sparkGeo.attributes.position.needsUpdate=true;
    }
  }
  function scan(target, t, camera) {
    beam.visible=pulse.visible=!!target;
    if(!target)return;
    mounts.nose.getWorldPosition(head);
    end.copy(head).lerp(target.position,Math.min(1,t*4));
    beamGeo.attributes.position.setXYZ(0,head.x,head.y,head.z);
    beamGeo.attributes.position.setXYZ(1,end.x,end.y,end.z);
    beamGeo.attributes.position.needsUpdate=true;
    beam.material.opacity=Math.sin(Math.PI*t)*.9;
    pulse.position.copy(target.position); pulse.quaternion.copy(camera.quaternion);
    pulse.scale.setScalar(.5+2.4*t); pulse.material.opacity=(1-t)*.83;
  }
  return {group,update,scan,impact(position) {
    sparkOrigin.copy(position); sparkAge=0;
    for(const ray of rays)ray.randomDirection().multiplyScalar(.22+Math.random()*.6);
  },reset(){
    traceCount=0; trailGeo.setDrawRange(0,0); sparks.visible=false; sparkAge=1; scan(null);
  }};
}
