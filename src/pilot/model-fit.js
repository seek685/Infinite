import { Box3, Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { PORT_FACE, SHIP_LENGTH, SHIP_ROTATION_OFFSET, STATION_ROTATION_OFFSET, STATION_SPAN } from './model-config.js';

const forwardExhaust=new Vector3(0,0,1);

function shipOrientation(root,box) {
  const left=root.getObjectByName('Thruster_L'),right=root.getObjectByName('Thruster_R'),nose=root.getObjectByName('Nose');
  const size=box.getSize(new Vector3()),center=box.getCenter(new Vector3()),back=new Vector3();
  if(left&&right){
    const a=left.getWorldPosition(new Vector3()),b=right.getWorldPosition(new Vector3());
    back.addVectors(a,b).multiplyScalar(.5).sub(nose?nose.getWorldPosition(new Vector3()):center).normalize();
    const up=new Vector3().crossVectors(back,b.sub(a)).normalize();
    if(up.lengthSq()>.5){
      const across=new Vector3().crossVectors(up,back);
      return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across,up,back)).invert();
    }
  }
  // Only infer a different longitudinal axis when it clearly dominates the hull.
  if(nose)back.copy(center).sub(nose.getWorldPosition(new Vector3())).normalize();
  else if(size.x>Math.max(size.y,size.z)*1.6)back.set(1,0,0);
  else if(size.y>Math.max(size.x,size.z)*1.6)back.set(0,1,0);
  else back.copy(forwardExhaust);
  return new Quaternion().setFromUnitVectors(back.lengthSq()?back:forwardExhaust,forwardExhaust);
}

export function fitModel(root,kind) {
  const fitted=new Group();
  fitted.add(root);fitted.updateWorldMatrix(true,true);
  const box=new Box3().setFromObject(fitted);
  if(box.isEmpty())return null;
  const ship=kind==='ship';
  const orientation=ship?shipOrientation(root,box):null;
  fitted.quaternion.setFromEuler(ship?SHIP_ROTATION_OFFSET:STATION_ROTATION_OFFSET);
  if(orientation)fitted.quaternion.multiply(orientation);
  fitted.updateWorldMatrix(true,true);
  box.setFromObject(fitted,true);
  const size=box.getSize(new Vector3());
  const scale=(ship?SHIP_LENGTH:STATION_SPAN)/(ship?size.z:Math.max(size.x,size.y,size.z));
  if(!Number.isFinite(scale)||scale<=0)return null;
  fitted.scale.setScalar(scale);
  fitted.position.copy(box.getCenter(new Vector3())).multiplyScalar(-scale);
  fitted.updateWorldMatrix(true,true);
  return {fitted,front:size.z*scale/2};
}

// Move the visual station to the existing approach corridor, including an animated port.
// A port can roll about its normal while its mouth stays underneath the fixed cyan gate.
export function stationMount(fitted,front) {
  const carrier=new Group();
  carrier.add(fitted);
  let port=fitted.getObjectByName('DockingPort');
  if(!port){
    port=new Object3D();port.position.z=front;carrier.add(port);
  }
  const relative=new Matrix4(),normal=new Vector3(),center=new Vector3(),spin=new Quaternion();
  function align(spinAngle){
    port.updateWorldMatrix(true,false);
    relative.copy(carrier.matrixWorld).invert().multiply(port.matrixWorld);
    normal.copy(forwardExhaust).transformDirection(relative);
    carrier.quaternion.setFromUnitVectors(normal,forwardExhaust);
    if(spinAngle)carrier.quaternion.premultiply(spin.setFromAxisAngle(forwardExhaust,spinAngle));
    center.setFromMatrixPosition(relative).applyQuaternion(carrier.quaternion);
    carrier.position.copy(PORT_FACE).sub(center);
    carrier.updateWorldMatrix(true,false);
  }
  align(0);
  return {carrier,port,align};
}
