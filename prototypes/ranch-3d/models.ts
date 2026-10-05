import * as THREE from 'three';

export type Species = 'chicken' | 'rabbit' | 'goat';
export interface AnimalRig { root:THREE.Group; body:THREE.Group; head:THREE.Group; legs:THREE.Group[]; ears:THREE.Object3D[]; tail:THREE.Object3D; kind:Species }
const sphere = new THREE.SphereGeometry(1,24,18);
const materials = new Map<number,THREE.MeshStandardMaterial>();
export function material(color:number,roughness=.9){
  if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness}));
  return materials.get(color)!;
}
export function blob(parent:THREE.Object3D,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number){
  const m=new THREE.Mesh(sphere,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
export function tube(parent:THREE.Object3D,points:THREE.Vector3[],radius:number,color:number){
  const curve=new THREE.CatmullRomCurve3(points);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,16,radius,7,false),material(color));mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function beam(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,color:number,r2=r){
  const d=new THREE.Vector3().subVectors(b,a),m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r,d.length(),9),material(color));
  m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function pivot(parent:THREE.Object3D,x:number,y:number,z:number){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
function eye(parent:THREE.Object3D,x:number,y:number,z:number,r:number){
  blob(parent,0x4d3c2b,x,y,z,r*1.08,r*1.05,r*.55);
  blob(parent,0x171d17,x,y,z+.006,r*.78,r*.80,r*.6);
  blob(parent,0xf6f1dd,x-r*.23,y+r*.32,z+r*.36,r*.16,r*.16,r*.1);
}
function chicken(){
  const root=new THREE.Group(),body=pivot(root,0,0,0),head=pivot(body,0,1.01,.32);
  blob(body,0xa66c39,0,.67,-.01,.31,.39,.43);
  blob(body,0xbc8645,0,.72,.21,.27,.32,.31);
  blob(body,0xce9a55,0,.84,.34,.15,.30,.18);
  blob(head,0xd4a567,0,.07,.03,.17,.20,.19);
  blob(head,0xd9b480,0,-.08,.09,.14,.13,.14);
  for(const side of [-1,1]){
    eye(head,side*.116,.093,.148,.034);
    blob(head,0xc15a42,side*.045,-.125,.21,.046,.085,.035);
    const wing=pivot(body,side*.23,.78,-.04);wing.rotation.z=side*-.13;
    blob(wing,0x925c32,0,-.03,0,.12,.25,.32);
    for(let i=0;i<5;i++){const feather=blob(wing,0xb0783f,side*.035,-.12+i*.027,-.15+i*.065,.075,.17,.062);feather.rotation.x=-.32;}
  }
  const beak=new THREE.Mesh(new THREE.ConeGeometry(.067,.17,10),material(0xd5a153));beak.rotation.x=Math.PI/2;beak.position.set(0,.0,.248);head.add(beak);beak.castShadow=true;
  for(let i=0;i<4;i++)blob(head,0xbc4d3c,0,.24+Math.sin(i*.9)*.032,-.075+i*.05,.043,.074,.056);
  const tail=pivot(body,0,.72,-.35);tail.rotation.x=-.37;
  for(let i=-2;i<=2;i++){const f=blob(tail,i%2?0x69513a:0x845732,i*.061,.17,-.09,.059,.28,.07);f.rotation.z=-i*.13;}
  const legs:THREE.Group[]=[];
  for(const side of [-1,1]){
    const leg=pivot(body,side*.12,.36,.0);legs.push(leg);
    beam(leg,new THREE.Vector3(0,0,0),new THREE.Vector3(0,-.30,.04),.026,0xc49c54);
    for(let i=-1;i<=1;i++)beam(leg,new THREE.Vector3(0,-.31,.045),new THREE.Vector3(i*.055,-.33,.15),.014,0xc49c54);
  }
  return {root,body,head,legs,ears:[],tail,kind:'chicken'} as AnimalRig;
}
function rabbit(){
  const root=new THREE.Group(),body=pivot(root,0,0,0),head=pivot(body,0,.70,.42);
  blob(body,0xd7ccb4,0,.44,-.02,.32,.35,.46);
  blob(body,0xe3d7c2,0,.44,.20,.27,.31,.26);
  blob(head,0xe9dfcb,0,.065,0,.25,.25,.235);
  blob(head,0xefe4d0,-.09,-.08,.19,.112,.10,.105);blob(head,0xefe4d0,.09,-.08,.19,.112,.10,.105);
  blob(head,0xb48d84,0,-.035,.285,.032,.025,.021);
  for(const side of [-1,1])eye(head,side*.176,.078,.16,.034);
  const ears:THREE.Object3D[]=[];
  for(const side of [-1,1]){
    const ear=pivot(head,0,0,0);ears.push(ear);
    const points=[new THREE.Vector3(side*.13,.23,-.05),new THREE.Vector3(side*.36,.31,-.04),new THREE.Vector3(side*.43,.08,.03),new THREE.Vector3(side*.35,-.20,.09)];
    tube(ear,points,.081,0xdbccb2);
    tube(ear,points.map(p=>p.clone().add(new THREE.Vector3(0,0,.057))),.033,0xbfa08f);
    blob(ear,0xdbccb2,side*.35,-.2,.09,.073,.09,.073);
  }
  const tail=blob(body,0xf0e6d3,0,.44,-.48,.12,.13,.12);
  const legs:THREE.Group[]=[];
  for(const side of [-1,1])for(const back of [true,false]){
    const leg=pivot(body,side*(back?.23:.15),back?.36:.39,back?-.20:.28);legs.push(leg);
    if(back)blob(leg,0xd3c5ad,0,-.025,0,.16,.22,.19);
    else blob(leg,0xe0d4bc,0,-.13,.03,.065,.17,.075);
    blob(leg,0xe4d8c1,0,back?-.29:-.33,.12,back?.12:.077,.055,back?.20:.125);
  }
  return {root,body,head,legs,ears,tail,kind:'rabbit'} as AnimalRig;
}
function goat(){
  const root=new THREE.Group(),body=pivot(root,0,0,0),head=pivot(body,0,1.29,.65);
  blob(body,0xc9b69a,0,.95,-.05,.37,.39,.70);
  blob(body,0xd8cbb0,0,.83,.36,.34,.36,.35);
  blob(body,0xd3c3a6,0,1.07,.49,.245,.38,.25);
  blob(head,0xe0d0b4,0,.12,.05,.20,.28,.25);
  blob(head,0xc7b497,0,-.005,.245,.135,.13,.22);
  blob(head,0x807262,0,-.033,.407,.10,.073,.028);
  for(const side of [-1,1]){
    eye(head,side*.17,.16,.22,.034);
    blob(head,0x9c8b73,side*.054,-.01,.425,.014,.012,.01);
    const ear=blob(head,0xc8b18e,side*.275,.135,.05,.16,.070,.12);ear.rotation.z=-side*.24;
    blob(head,0xaf9680,side*.32,.147,.095,.092,.044,.057);
    tube(head,[new THREE.Vector3(side*.13,.33,-.08),new THREE.Vector3(side*.15,.51,-.18),new THREE.Vector3(side*.14,.60,-.34),new THREE.Vector3(side*.11,.57,-.48)],.045,0x786e57);
    const brow=blob(head,0xd1b996,side*.139,.225,.19,.073,.028,.039);brow.rotation.z=side*.1;
  }
  const beard=new THREE.Mesh(new THREE.ConeGeometry(.073,.20,9),material(0xc4b296));beard.rotation.z=Math.PI;beard.position.set(0,-.15,.22);beard.castShadow=true;head.add(beard);
  const tail=pivot(body,0,1.03,-.69);
  tube(tail,[new THREE.Vector3(0,0,0),new THREE.Vector3(0,.14,-.14),new THREE.Vector3(.02,.16,-.24)],.056,0xd3c1a1);
  const legs:THREE.Group[]=[];
  for(const side of [-1,1])for(const z of [-.42,.40]){
    const leg=pivot(body,side*.235,.84,z);legs.push(leg);
    blob(leg,0xc9b89b,0,-.18,0,.076,.26,.09);
    beam(leg,new THREE.Vector3(0,-.35,0),new THREE.Vector3(0,-.70,.035),.048,0xb6a084,.042);
    blob(leg,0x5b5647,0,-.76,.045,.065,.065,.091);
    beam(leg,new THREE.Vector3(0,-.79,.13),new THREE.Vector3(0,-.79,.05),.004,0x302e28);
  }
  return {root,body,head,legs,ears:[],tail,kind:'goat'} as AnimalRig;
}
export function makeAnimal(kind:Species){return kind==='chicken'?chicken():kind==='rabbit'?rabbit():goat();}
