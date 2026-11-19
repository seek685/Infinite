import { Color, Mesh, MeshBasicMaterial, PMREMGenerator, PointLight, Scene, SphereGeometry, Vector3 } from 'three';

export function createPilotLighting(renderer, world) {
  // Capture a broad planet, a thin luminous limb and two distant highlights in linear HDR.
  const sky=new Scene(), geometry=new SphereGeometry(1,24,16);
  sky.background=new Color(.032,.042,.067);
  function reflector(position,scale,color) {
    const source=new Mesh(geometry,new MeshBasicMaterial({color:new Color(...color),toneMapped:false}));
    source.position.set(...position);source.scale.set(...scale);source.rotation.z=.18;sky.add(source);
  }
  reflector([.6,-4.3,1.1],[4.4,1.7,2.5],[.43,.78,1.12]);
  reflector([-.6,-2.95,1.1],[2.9,.14,1.1],[1.45,2.4,2.85]);
  reflector([-3.2,2.2,4.0],[1.15,.60,.85],[4.8,4.55,4.12]);
  reflector([3.5,1.6,-3.0],[.49,1.74,.62],[1.5,2.15,3.42]);
  const generator=new PMREMGenerator(renderer);
  let environment;
  try{environment=generator.fromScene(sky,.035,.1,24);}
  finally{generator.dispose();geometry.dispose();sky.children.forEach(source=>source.material.dispose());}
  environment.texture.name='Pilot / planetary limb reflections';

  const bounce=new PointLight('#9bdfea',.85,2.3);
  const rim=new PointLight('#c6dafe',1.1,2.6);
  bounce.name='Planet bounce';rim.name='Hull rim';world.add(bounce,rim);
  const radial=new Vector3(),side=new Vector3();
  function illuminate(root,imported=false) {
    const materials=new Set();
    root.traverse(object=>{
      if(object.isMesh)for(const material of [object.material].flat())materials.add(material);
    });
    for(const material of materials){
      if(!material?.isMeshStandardMaterial)continue;
      material.envMap=environment.texture;
      material.envMapIntensity=imported ? .55 : .30;
      if(imported&&(material.emissiveMap||material.emissive.getHex()!==0))material.emissiveIntensity*=1.6;
      material.needsUpdate=true;
    }
  }
  function update(ship,camera) {
    radial.copy(ship.position).normalize().negate();radial.y-=.42;
    bounce.position.copy(ship.position).addScaledVector(radial.normalize(),.86);
    radial.subVectors(ship.position,camera.position).normalize();
    side.set(.52,.34,0).applyQuaternion(ship.quaternion);
    rim.position.copy(ship.position).addScaledVector(radial,.98).add(side);
  }
  return {illuminate,update,dispose:()=>environment.dispose()};
}
