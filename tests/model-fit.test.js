import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, Object3D, Vector3 } from 'three';
import { fitModel, stationMount } from '../src/pilot/model-fit.js';
import { PORT_FACE, SHIP_LENGTH, SHIP_ROTATION_OFFSET, STATION_SPAN } from '../src/pilot/model-config.js';

const position=node=>node.getWorldPosition(new Vector3());
const close=(a,b)=>assert.ok(a.distanceTo(b)<1e-6,`${a.toArray()} / ${b.toArray()}`);
function socket(parent,name,x,y,z){
  const node=new Object3D();node.name=name;node.position.set(x,y,z);parent.add(node);return node;
}
function ship(){
  const root=new Group();root.position.set(20,7,10);root.scale.set(3,2,4);root.rotation.y=1.2;
  root.add(new Mesh(new BoxGeometry(3,2,8)));
  socket(root,'Thruster_L',-1,0,4);socket(root,'Thruster_R',1,0,4);socket(root,'Nose',0,0,-4);
  return root;
}
test('named landmarks align a rotated and translated ship without overwriting authored transforms',()=>{
  const root=ship();root.updateMatrix();const matrix=root.matrix.clone();
  const {fitted}=fitModel(root,'ship'),bounds=new Box3().setFromObject(fitted,true);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).z-SHIP_LENGTH)<1e-6);
  close(bounds.getCenter(new Vector3()),new Vector3());
  close(position(root.getObjectByName('Nose')),new Vector3(0,0,-SHIP_LENGTH/2));
  assert.ok(position(root.getObjectByName('Thruster_L')).x<0);assert.ok(root.matrix.equals(matrix));
});
test('a manual half turn is honored even when the ship has named sockets',()=>{
  const saved=SHIP_ROTATION_OFFSET.clone();
  try{
    SHIP_ROTATION_OFFSET.y=Math.PI;
    const root=ship();fitModel(root,'ship');
    close(position(root.getObjectByName('Nose')),new Vector3(0,0,SHIP_LENGTH/2));
  }finally{SHIP_ROTATION_OFFSET.copy(saved);}
});
test('dominant hull axes normalize unmarked ships and empty geometry keeps the fallback',()=>{
  for(const dimensions of [[24,4,6],[3,20,4],[3,2,10]]){
    const root=new Mesh(new BoxGeometry(...dimensions)),{fitted}=fitModel(root,'ship');
    assert.ok(Math.abs(new Box3().setFromObject(fitted,true).getSize(new Vector3()).z-SHIP_LENGTH)<1e-6);
  }
  assert.equal(fitModel(new Group(),'station'),null);
  assert.equal(fitModel(new Mesh(new BoxGeometry(0,0,0)),'ship'),null);
});
test('the animated port stays behind the fixed docking guide under a moving pilot world',()=>{
  const root=new Group();root.add(new Mesh(new BoxGeometry(8,5,3)));
  const port=socket(root,'DockingPort',1,.3,1.5);port.rotation.y=.6;
  const {fitted,front}=fitModel(root,'station');
  assert.ok(Math.abs(new Box3().setFromObject(fitted,true).getSize(new Vector3()).x-STATION_SPAN)<1e-6);
  const {carrier,align}=stationMount(fitted,front),station=new Group();
  station.position.set(3,1,7);station.rotation.set(.1,.32,.08);station.add(carrier);
  for(const angle of [0,.8,2.4]){
    port.position.x+=.4;port.rotation.z+=.25;align(angle);
    close(position(port),station.localToWorld(PORT_FACE.clone()));
    close(port.getWorldDirection(new Vector3()),station.getWorldDirection(new Vector3()));
  }
});
test('an unmarked station aligns its front face at the same physical berth',()=>{
  const root=new Mesh(new BoxGeometry(20,11,7));root.position.set(19,20,-10);
  const {fitted,front}=fitModel(root,'station'),{port,align}=stationMount(fitted,front);
  align(.7);close(position(port),PORT_FACE);
  assert.ok(Math.abs(new Box3().setFromObject(fitted,true).max.z-PORT_FACE.z)<1e-6);
});
