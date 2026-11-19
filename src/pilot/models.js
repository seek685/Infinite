import * as T from 'three';
import { THRUSTER_OFFSETS, WINGTIP_OFFSETS } from './model-config.js';

const metal = (color, roughness = .48, metalness = .55) =>
  new T.MeshStandardMaterial({color, roughness, metalness, emissive:color, emissiveIntensity:.13});
const luminous = (r, g, b) => new T.MeshBasicMaterial({color: new T.Color(r, g, b)});

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const result = new T.Mesh(geometry, material);
  result.position.set(x, y, z);
  parent.add(result);
  return result;
}

// Cross sections run from the sharp nose (-Z) to the engine deck (+Z).
function fuselage(sections) {
  const vertices = [], indices = [], sides = 8;
  for (const [z, width, height, base] of sections) {
    for (let j = 0; j < sides; j++) {
      const angle = j * Math.PI * 2 / sides;
      vertices.push(Math.cos(angle) * width, base + Math.sin(angle) * height, z);
    }
  }
  for (let row = 0; row < sections.length - 1; row++) {
    for (let j = 0; j < sides; j++) {
      const a = row * sides + j, b = row * sides + (j + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const last = (sections.length - 1) * sides;
  for (let j = 1; j < sides - 1; j++) indices.push(0, j + 1, j, last, last + j, last + j + 1);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wing(points, depth) {
  const shape = new T.Shape(points.map(([x, z]) => new T.Vector2(x, -z)));
  return new T.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelSegments: 1, bevelThickness: .002, bevelSize: .002})
    .rotateX(-Math.PI / 2);
}

export function createShip() {
  const ship = new T.Group(), hull = new T.Group();
  ship.add(hull);
  const ceramic = metal('#bdc9c8'), graphite = metal('#485661'), foil = metal('#a38356');
  const glass = new T.MeshPhysicalMaterial({color:'#152e39',emissive:'#22505a',emissiveIntensity:.46,
    metalness:.48,roughness:.16,clearcoat:1,clearcoatRoughness:.12});
  const ion = luminous(.35, 1.45, 1.82), marker = luminous(.4, 1.08, 1.1);
  mesh(hull, fuselage([[-.30,.003,.003,0],[-.15,.052,.025,.003],[-.034,.083,.043,.005],
    [.103,.089,.036,.008],[.19,.05,.02,.002]]), ceramic);
  mesh(hull, fuselage([[-.162,.006,.003,.022],[-.082,.038,.025,.035],[-.018,.044,.03,.043],
    [.035,.031,.012,.04]]), glass);
  mesh(hull, fuselage([[-.15,.002,.003,.024],[-.082,.002,.003,.060],[-.018,.002,.004,.073],
    [.036,.003,.003,.05]]),graphite);
  mesh(hull, wing([[-.012,.014],[0,-.065],[.012,.014],[.009,.136],[-.009,.136]],.009), graphite,0,.04);
  for (const side of [-1, 1]) {
    const signed = points => points.map(([x,z]) => [x*side,z]);
    mesh(hull, wing(signed([[.038,-.137],[.075,-.093],[.238,.128],[.225,.165],
      [.11,.12],[.065,.153],[.04,.112]]),.011), ceramic,0,-.011);
    mesh(hull, wing(signed([[.085,-.045],[.221,.128],[.213,.135],[.105,.05]]),.002), graphite,0,.005);
    mesh(hull, wing(signed([[.16,.052],[.185,.077],[.178,.083],[.154,.056]]),.002), foil,0,.008);
    mesh(hull, wing(signed([[.132,.094],[.208,.144],[.18,.134],[.116,.096]]),.003), graphite,0,.006);
    const fin = mesh(hull, wing(signed([[.08,.042],[.143,.159],[.138,.182],[.079,.126]]),.005), graphite);
    fin.rotation.z = side*.83;
    const x = side*.074;
    const nacelle = mesh(hull, new T.CylinderGeometry(.032,.039,.167,12),graphite,x,.005,.113);
    nacelle.rotation.x = Math.PI/2;
    for (const z of [.157,.179,.20]) mesh(hull,new T.TorusGeometry(.034,.0035,5,16),foil,x,.005,z);
    mesh(hull,new T.CircleGeometry(.029,24),graphite,x,.005,.201);
    mesh(hull,new T.TorusGeometry(.019,.0034,6,24),ion,x,.005,.203);
    mesh(hull,new T.BoxGeometry(.011,.005,.019),marker,side*.228,.006,.134);
  }
  instances(hull,new T.BoxGeometry(),graphite,12,(p,i)=>{
    const side=i<6?-1:1;
    p.position.set(side*.049,.041,.046+(i%6)*.012);
    p.scale.set(.024,.003,.0035);p.rotation.z=-side*.19;
  });

  function mount(position) {
    const node=new T.Object3D();
    node.position.copy(position);ship.add(node);return node;
  }
  const mounts={thrusters:THRUSTER_OFFSETS.map(mount),wingtips:WINGTIP_OFFSETS.map(mount),
    nose:mount(new T.Vector3(0,.015,-.27))};
  return {ship,hull,mounts};
}

function instances(parent, geometry, material, count, place) {
  const batches = new T.InstancedMesh(geometry, material, count), part = new T.Object3D();
  for (let i = 0; i < count; i++) {
    part.position.set(0,0,0); part.rotation.set(0,0,0); part.scale.setScalar(1);
    place(part, i);
    part.updateMatrix();
    batches.setMatrixAt(i,part.matrix);
  }
  parent.add(batches);
  return batches;
}

export function createStation() {
  const station = new T.Group(), hull = new T.Group(), wheel = new T.Group();
  station.add(hull);hull.add(wheel);
  const white = metal('#c1bfb0'), alloy = metal('#71818a'), dark = metal('#37414e');
  const brass = metal('#ab8251'), solar = metal('#233d60',.27,.42);
  const cyan = luminous(.24,2.4,2.5), nav = luminous(2.8,.16,.085);
  const torus = (parent,r,t,z,mat) => mesh(parent,new T.TorusGeometry(r,t,8,72),mat,0,0,z);
  for (const z of [-.082,.082]) {
    torus(wheel,.74,.023,z,alloy);
    torus(wheel,.62,.014,z,brass);
  }
  const cube = new T.BoxGeometry();
  function radial(part, count, index, radius, depth, sx, sy, sz) {
    const a = index * Math.PI * 2 / count;
    part.position.set(Math.cos(a)*radius,Math.sin(a)*radius,depth);
    part.rotation.z=a;
    part.scale.set(sx,sy,sz);
  }
  const habitat=new T.CylinderGeometry(1,1,1,8).rotateZ(Math.PI/2);
  instances(wheel,habitat,white,12,(p,i)=>radial(p,12,i,.72,0,.17,.135,.132));
  instances(wheel,cube,dark,24,(p,i)=>radial(p,24,i,.745,.126,.11,.04,.018));
  instances(wheel,cube,alloy,48,(p,i)=>radial(p,12,Math.floor(i/4)+((i%4)-1.5)*.041,.754,.119,.095,.009,.009));
  instances(wheel,cube,white,24,(p,i)=>radial(p,24,i+.5,.647,.105,.044,.02,.053));
  instances(wheel,cube,brass,24,(p,i)=>radial(p,12,Math.floor(i/2)+(i%2?.22:-.22),.737,.073,.067,.018,.057));
  instances(wheel,cube,alloy,12,(p,i)=>radial(p,6,i%6,.39,i<6?.072:-.072,.64,.023,.028));
  instances(wheel,cube,brass,36,(p,i)=>radial(p,36,i,.68,0,.018,.018,.166));
  // Two rows of outboard photovoltaic wings, with fine bus bars on their lit face.
  instances(wheel,cube,solar,8,(p,i)=>radial(p,4,i%4+.5,1.04,i<4?.07:-.07,.51,.125,.015));
  instances(wheel,cube,alloy,40,(p,i)=>{
    const row = Math.floor(i/5);
    radial(p,4,row%4+.5,.82+(i%5)*.103,row<4?.083:-.057,.006,.125,.006);
  });
  instances(wheel,cube,nav,4,(p,i)=>radial(p,4,i,.815,.108,.014,.035,.015));
  const axle = mesh(hull,new T.CylinderGeometry(.105,.125,.72,24),alloy);
  axle.rotation.x=Math.PI/2;
  for (const z of [-.34,-.21,.22,.36]) torus(hull,.113,.014,z,white);
  mesh(hull,new T.CircleGeometry(.098,24),dark,0,0,.364);
  torus(hull,.077,.005,.366,brass);
  instances(hull,cube,white,8,(p,i)=>radial(p,8,i,.09,.371,.021,.009,.011));
  const gate = torus(station,.315,.004,.74,cyan);
  for (let i=0;i<4;i++) {
    const arc = mesh(station,new T.TorusGeometry(.337,.007,6,12,.42),white,0,0,.74);
    arc.rotation.z=i*Math.PI/2-.21;
  }
  return {station,hull,gate, update(time) {
    wheel.rotation.z=time*.085;
    nav.color.setRGB(.36+3.1*Math.pow(Math.max(0,Math.cos(time*3.9)),18),.045,.025);
    gate.material.color.setRGB(.25,1.7+.35*Math.sin(time*2),2);
  }};
}

export function createBeacons(posts) {
  const group = new T.Group();
  const crystal = new T.OctahedronGeometry(.064), halo = new T.TorusGeometry(.113,.0024,5,44);
  const shell = new T.MeshBasicMaterial({color: new T.Color(.42,1.7,1.7),wireframe:true});
  const core = metal('#3e848e'), glow = luminous(.38,1.25,1.18);
  const targets = posts.map((post, i) => {
    const node = new T.Group(), spinner = new T.Group();
    const a = 1.87 + i * 2.3999632297, r = 4.7 + (i%4)*.37;
    if (i===0) node.position.set(-.58,1.10,6.54);
    else node.position.set(Math.cos(a)*r, .34 + .66*Math.sin(a*1.6), Math.sin(a)*r);
    mesh(spinner,crystal,shell);
    mesh(spinner,crystal,core).scale.setScalar(.62);
    mesh(spinner,halo,glow).rotation.x=.85;
    node.add(spinner); group.add(node);
    return {id:post.slug, title:post.title, position:node.position, post, spinner, range:.50};
  });
  return {group, targets, update(time) {
    targets.forEach(({spinner},i)=>{
      spinner.rotation.set(.24,time*.72+i,.13);
      spinner.position.y=.022*Math.sin(time*1.4+i);
    });
  }};
}

export function disposeModel(root) {
  const resources = new Set(),bitmaps=new Set();
  root.traverse(object=>{
    if (object.isInstancedMesh) object.dispose();
    if (object.isSkinnedMesh) resources.add(object.skeleton);
    if (object.geometry) resources.add(object.geometry);
    for (const material of [object.material].flat()) if (material) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture&&!value.isRenderTargetTexture) {
        resources.add(value);
        if(typeof ImageBitmap!=='undefined'&&value.image instanceof ImageBitmap)bitmaps.add(value.image);
      }
    }
  });
  resources.forEach(resource=>resource.dispose());
  bitmaps.forEach(bitmap=>bitmap.close());
}
