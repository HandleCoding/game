import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeAnimal,material,blob,beam,type AnimalRig,type Species } from './models';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const world=$('world'),loading=$('loading');
let toastTimer=0;
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('shown');window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('shown'),3200);}
function progress(n:number,message:string){$('loading-progress').style.width=n+'%';$('loading-percent').textContent=n+'%';$('loading-message').textContent=message;}
function fail(message:string){loading.classList.remove('done');$('loading-title').textContent='稍等，牧场还没准备好';$('loading-message').textContent=message;$<HTMLButtonElement>('retry').hidden=false;}
$('retry').addEventListener('click',()=>location.reload());
window.addEventListener('error',event=>{if(!world.dataset.ready)fail('加载遇到了问题，可以重新进入。');console.error(event.message);});
const yieldPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=matchMedia('(max-width:600px)').matches;
const rand=(()=>{let seed=71004;return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};})();
const ground=(x:number,z:number)=>.075*Math.sin(x*.48)*Math.cos(z*.45)+.13*Math.exp(-((x-5)**2+(z+4)**2)/18);
const at=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const boxGeom=new THREE.BoxGeometry(1,1,1);
function box(parent:THREE.Object3D,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number){const m=new THREE.Mesh(boxGeom,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}

async function start(){
  progress(12,'铺好草地，让阳光照进来。');await yieldPaint();
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:mobile?'low-power':'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,mobile?1.5:2));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  world.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','三维牧场：草地、围栏、小鸡、垂耳兔和山羊');
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;fail('画面暂时休息了，重新进入即可恢复。');});
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xc8dfdf);scene.fog=new THREE.Fog(0xc8dfdf,20,65);
  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,160);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=6;controls.maxDistance=38;
  controls.minPolarAngle=.45;controls.maxPolarAngle=1.35;controls.enablePan=true;controls.panSpeed=.65;controls.rotateSpeed=.52;
  controls.target.set(0,.55,.6);camera.position.set(mobile?7:8,mobile?8:8,mobile?12:13);controls.update();
  const homeCamera=camera.position.clone(),homeTarget=controls.target.clone();
  const hemi=new THREE.HemisphereLight(0xe6f2e6,0x74894e,1.65);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe3ad,2.3);sun.position.set(-10,16,9);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.camera.left=-13;sun.shadow.camera.right=13;sun.shadow.camera.top=13;sun.shadow.camera.bottom=-13;
  sun.shadow.camera.near=.1;sun.shadow.camera.far=45;sun.shadow.normalBias=.035;sun.shadow.bias=-.00012;sun.shadow.radius=3;scene.add(sun);
  const backlight=new THREE.DirectionalLight(0xdde8d2,.65);backlight.position.set(8,6,-10);scene.add(backlight);

  // Continuous mesh ground, vertex colour variations, all objects in world coordinates.
  const groundGeo=new THREE.PlaneGeometry(150,150,150,150);groundGeo.rotateX(-Math.PI/2);
  const positions=groundGeo.attributes.position,colors=new Float32Array(positions.count*3),color=new THREE.Color();
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,ground(x,z));const n=.035*Math.sin(x*.9)*Math.cos(z*1.2)+rand()*.023;
    color.setHSL(.245+n*.25,.46,Math.max(.23,.30+n-(Math.abs(x)+Math.abs(z))*.0003));color.toArray(colors,i*3);}
  groundGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));groundGeo.computeVertexNormals();
  const terrain=new THREE.Mesh(groundGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));terrain.receiveShadow=true;scene.add(terrain);

  // Curved sandy path from the farmhouse, with real geometry and soft edges.
  const pathCurve=new THREE.CatmullRomCurve3([at(-5,0,-4),at(-3,0,-1),at(2,0,3.2),at(4,0,9),at(5,0,15)]);
  const pathPos:number[]=[],pathIndices:number[]=[];
  for(let i=0;i<=80;i++){const u=i/80,p=pathCurve.getPoint(u),t=pathCurve.getTangent(u);const normal=at(-t.z,0,t.x).normalize();
    for(const sign of [-1,1]){const v=p.clone().addScaledVector(normal,sign*(.55+.06*Math.sin(i*.7)));pathPos.push(v.x,ground(v.x,v.z)+.014,v.z);}
    if(i<80){const n=i*2;pathIndices.push(n,n+2,n+1,n+1,n+2,n+3);}}
  const pathGeo=new THREE.BufferGeometry();pathGeo.setAttribute('position',new THREE.Float32BufferAttribute(pathPos,3));pathGeo.setIndex(pathIndices);pathGeo.computeVertexNormals();
  const path=new THREE.Mesh(pathGeo,new THREE.MeshStandardMaterial({color:0xcbb991,roughness:1,side:THREE.DoubleSide}));path.receiveShadow=true;scene.add(path);

  // A modest timber barn: beams, roof, doors and flower boxes, not a baked backdrop.
  const barn=new THREE.Group();barn.position.set(-5,ground(-5,-4),-4);scene.add(barn);
  box(barn,0xd6c7a3,0,1.25,0,3.0,2.5,2.45);
  for(const x of [-1.47,1.47])box(barn,0x78593a,x,1.25,1.24,.16,2.5,.15);
  for(let i=0;i<10;i++)box(barn,i%2?0xded1ae:0xcebc95,-1.37+i*.305,1.2,1.242,.025,2.35,.015);
  for(const side of [-1,1]){
    const roof=box(barn,0x976a52,side*.80,2.80,0,1.90,.15,3.00);roof.rotation.z=-side*.43;
    for(let row=0;row<5;row++){const plank=box(barn,row%2?0xaa7b5b:0xa17355,side*(.24+row*.32),3.08-row*.146,.0,.36,.055,2.98);plank.rotation.z=-side*.43;}}
  const gable=new THREE.Mesh(new THREE.ConeGeometry(1.7,.82,4),material(0xcfbd94));gable.position.set(0,2.73,0);gable.rotation.y=Math.PI/4;gable.scale.z=.73;gable.castShadow=true;barn.add(gable);
  const doorway=box(barn,0x5b4933,0,.88,1.27,1.18,1.76,.08);
  for(const x of [-.31,.31]){box(barn,0x9e8058,x,.84,1.34,.56,1.68,.09);box(barn,0x6e5438,x,.45,1.41,.5,.075,.05);box(barn,0x6e5438,x,1.23,1.41,.5,.075,.05);}
  box(barn,0x6c5439,0,1.80,1.34,1.42,.14,.18);
  beam(barn,at(-.55,.08,1.43),at(.55,1.70,1.43),.033,0x735b3c);
  for(const x of [-1.0,1.0]){box(barn,0x617a75,x,1.77,1.285,.41,.46,.035);box(barn,0x795c3d,x,1.77,1.33,.46,.04,.055);box(barn,0x795c3d,x,1.77,1.33,.04,.5,.055);}
  box(barn,0xc0b095,0,.03,1.8,1.65,.10,.65);
  const lanterns:THREE.Mesh[]=[];
  function lantern(x:number,y:number,z:number){const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);box(group,0x6e5332,0,0,0,.18,.3,.18);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.083,12,10),new THREE.MeshStandardMaterial({color:0xffd58a,emissive:0xffb54e,emissiveIntensity:.25}));bulb.position.z=.104;group.add(bulb);lanterns.push(bulb);return bulb;}
  lantern(-6.15,1.86,-2.65);

  // Fence rails and posts cast shadows and occlude passing animals.
  const fence=new THREE.Group();scene.add(fence);
  function fenceLine(x1:number,z1:number,x2:number,z2:number,count:number){let previous:THREE.Vector3|null=null;
    for(let i=0;i<=count;i++){const x=x1+(x2-x1)*i/count,z=z1+(z2-z1)*i/count,y=ground(x,z);
      box(fence,0xa18b64,x,y+.57,z,.16,1.14,.17);blob(fence,0xb4a078,x,y+1.13,z,.12,.095,.12);
      if(previous){for(const h of [.35,.82]){const a=previous.clone();a.y+=h;const b=at(x,y+h,z);beam(fence,a,b,.059,0xb6a078);}}
      previous=at(x,y,z);
    }}
  fenceLine(-7,-2.7,-7,6.0,6);fenceLine(-7,6,-2.0,6,4);fenceLine(3.8,6,7,6,3);fenceLine(7,6,7,-4.3,7);fenceLine(-2.8,-4.3,7,-4.3,7);

  // Sculpted trees and small distant woodland. Leaves sway around branch pivots.
  const leafGroups:{group:THREE.Group,phase:number}[]=[];
  function tree(x:number,z:number,size:number,phase=0){const g=new THREE.Group();g.position.set(x,ground(x,z),z);g.scale.setScalar(size);scene.add(g);
    beam(g,at(0,0,0),at(.08,3.3,-.1),.24,0x827154,.13);
    for(let i=0;i<5;i++){const a=i*1.9,top=at(Math.cos(a)*1.06,3.4+(i%2)*.43,Math.sin(a)*.97);beam(g,at(.03,2.15,-.02),top,.09,0x817055,.03);}
    const leaves=new THREE.Group();leaves.position.y=3.05;g.add(leaves);leafGroups.push({group:leaves,phase});
    for(let i=0;i<14;i++){const a=i*2.399,r=i===0?0:1.12;const m=blob(leaves,[0x7c9251,0x809f59,0x688948,0x94a65b][i%4],Math.cos(a)*r,(i%3)*.46,Math.sin(a)*r,.93,.74,.87);m.rotation.y=a;}
    return g;}
  tree(4.7,-1.8,1.05,.2);tree(-7.8,-6.4,1.4,1.4);tree(11,1,.88,2.8);
  for(let i=0;i<18;i++)tree(-28+i*3.3,-17-rand()*10,.8+rand()*.8,i);
  for(let i=0;i<8;i++){const hill=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),material(i%2?0x91a381:0x8fa68d));hill.position.set(-36+i*11,-1.5,-35-rand()*14);hill.scale.set(9+rand()*4,5+rand()*4,7+rand()*7);scene.add(hill);}

  // Pond with geometric stones, water surface animation, and depth-coloured bed.
  const pond=new THREE.Group();pond.position.set(5.5,ground(5.5,2.0)+.025,2.0);scene.add(pond);
  const waterGeo=new THREE.CircleGeometry(1.2,64);waterGeo.rotateX(-Math.PI/2);
  const waterMat=new THREE.MeshPhysicalMaterial({color:0x759d94,roughness:.22,metalness:.08,transparent:true,opacity:.9});
  const water=new THREE.Mesh(waterGeo,waterMat);water.scale.set(1,1,1.45);water.receiveShadow=true;pond.add(water);
  const rippleMat=new THREE.MeshBasicMaterial({color:0xd7e4c8,transparent:true,opacity:.35,side:THREE.DoubleSide});
  const ripples:THREE.Mesh[]=[];
  for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.RingGeometry(.21,.224,40),rippleMat.clone());r.rotation.x=-Math.PI/2;r.position.y=.012+i*.001;pond.add(r);ripples.push(r);}
  for(let i=0;i<20;i++){const a=i*Math.PI/10;const stone=blob(pond,[0x9a9e83,0xb0ac90,0x8c9785][i%3],Math.cos(a)*1.21,.075,Math.sin(a)*1.7,.19+rand()*.1,.12+rand()*.10,.21);stone.rotation.y=a;}

  // Side feeding trough; exposed grain is actual geometry.
  const trough=new THREE.Group();trough.position.set(-4.0,ground(-4.0,.2),.2);trough.rotation.y=.25;scene.add(trough);
  box(trough,0x826342,0,.39,0,1.75,.10,.68);
  for(const x of [-.92,.92])box(trough,0xa78659,x,.57,0,.13,.48,.8);
  for(const z of [-.4,.4])box(trough,0xa58a60,0,.57,z,1.84,.42,.10);
  for(const x of [-.68,.68])for(const z of [-.25,.25])box(trough,0x6f5639,x,.22,z,.12,.39,.12);
  const grain=new THREE.Group();trough.add(grain);
  for(let i=0;i<46;i++)blob(grain,i%3?0xc8ad5f:0xd5bd72,(rand()-.5)*1.6,.50+rand()*.06,(rand()-.5)*.55,.04,.025,.025);

  progress(46,'树影落下来，风吹过草地。');await yieldPaint();
  const bladeGeo=new THREE.BufferGeometry();bladeGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.03,0,0,.03,0,0,.025,.25,.0,0,.38,.055],3));bladeGeo.setIndex([0,1,2,0,2,3]);bladeGeo.computeVertexNormals();
  const grassMat=new THREE.MeshStandardMaterial({color:0x859b56,roughness:1,side:THREE.DoubleSide});
  const wind={value:0};grassMat.onBeforeCompile=shader=>{shader.uniforms.windTime=wind;shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(windTime*1.3 + instanceMatrix[3].x*.7 + instanceMatrix[3].z*.6) * position.y * .20;');};
  const count=mobile?4000:8500,grass=new THREE.InstancedMesh(bladeGeo,grassMat,count),dummy=new THREE.Object3D(),grassColor=new THREE.Color();
  const pathPoints=pathCurve.getPoints(60);let added=0;
  while(added<count){const x=(rand()-.5)*40,z=(rand()-.5)*38;
    const edge=Math.sqrt((x/20)**2+(z/19)**2);if(rand()>Math.max(0,1-Math.pow(edge,4)))continue;
    if(pathPoints.some(p=>(p.x-x)**2+(p.z-z)**2<.7) || ((x-5.5)/1.3)**2+((z-2)/1.8)**2<1 || (x<-3.3&&x>-6.7&&z<-2.5&&z>-5.5))continue;
    dummy.position.set(x,ground(x,z)+.015,z);dummy.rotation.set(0,rand()*Math.PI*2,0);dummy.scale.setScalar(.20+rand()*.42);dummy.updateMatrix();grass.setMatrixAt(added,dummy.matrix);
    grassColor.setHSL(.22+rand()*.04,.36+rand()*.12,.24+rand()*.11);grass.setColorAt(added,grassColor);added++;
  }
  grass.receiveShadow=true;scene.add(grass);
  // Small flowers are instanced real meshes, not billboard images.
  const flower=new THREE.InstancedMesh(new THREE.SphereGeometry(.026,7,5),material(0xf3e9b3),220);
  for(let i=0;i<220;i++){const x=(rand()-.5)*15,z=(rand()-.5)*12;dummy.position.set(x,ground(x,z)+.14,z);dummy.scale.set(1.1,.5,1.1);dummy.rotation.set(0,0,0);dummy.updateMatrix();flower.setMatrixAt(i,dummy.matrix);}scene.add(flower);

  progress(73,'小鸡、兔子和山羊准备出来玩。');await yieldPaint();
  interface Walker { rig:AnimalRig; position:THREE.Vector2; target:THREE.Vector2; heading:number; phase:number; until:number; state:'walk'|'idle'|'eat'; baby:boolean; speed:number }
  const walkers:Walker[]=[];
  const initial:{kind:Species,x:number,z:number,heading:number}[]=[{kind:'chicken',x:-1.7,z:2.0,heading:.4},{kind:'rabbit',x:.0,z:1.9,heading:-.1},{kind:'goat',x:1.7,z:1.45,heading:-.35}];
  for(const [i,a] of initial.entries()){const rig=makeAnimal(a.kind);scene.add(rig.root);walkers.push({rig,position:new THREE.Vector2(a.x,a.z),target:new THREE.Vector2(a.x,a.z),heading:a.heading,phase:i*1.3,until:5+i*2,state:'idle',baby:false,speed:a.kind==='rabbit'?.55:a.kind==='goat'?.38:.30});rig.root.position.set(a.x,ground(a.x,a.z),a.z);rig.root.rotation.y=a.heading;}
  let selected=walkers[0],paused=reduced,night=false,nightBlend=0,elapsed=0,feedingUntil=0;
  let transition:{startCamera:THREE.Vector3,endCamera:THREE.Vector3,startTarget:THREE.Vector3,endTarget:THREE.Vector3,at:number}|null=null;
  function fly(position:THREE.Vector3,target:THREE.Vector3){transition={startCamera:camera.position.clone(),endCamera:position,startTarget:controls.target.clone(),endTarget:target,at:performance.now()};}
  controls.addEventListener('start',()=>{transition=null;});
  function select(kind:Species){selected=walkers.find(w=>w.rig.kind===kind)!;document.querySelectorAll<HTMLButtonElement>('[data-animal]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animal===kind)));
    $('animal-name').textContent=kind==='chicken'?'小鸡':kind==='rabbit'?'垂耳兔':'山羊';$('stage-label').textContent=selected.baby?'幼年':'成年';$('baby').textContent=selected.baby?'看看成年':'看看幼年';}
  document.querySelectorAll<HTMLButtonElement>('[data-animal]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.animal as Species)));
  $('baby').addEventListener('click',()=>{selected.baby=!selected.baby;select(selected.rig.kind);toast(selected.baby?'看看它小时候的模样。':'已经长成大伙伴啦。');});
  $('focus').addEventListener('click',()=>{const p=selected.rig.root.position.clone(),direction=camera.position.clone().sub(controls.target).normalize();fly(p.clone().addScaledVector(direction,mobile?7:6),p.add(at(0,.45,0)));});
  $('overview').addEventListener('click',()=>{fly(homeCamera,homeTarget);toast('回到牧场全景。');});
  $('light').addEventListener('click',()=>{night=!night;document.body.classList.toggle('night',night);$('light-label').textContent=night?'切换白天':'切换夜晚';$('weather-label').textContent=night?'夜 · 星光':'晴 · 微风';});
  function pause(){paused=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause-label').textContent=paused?'继续':'暂停';}
  $('pause').addEventListener('click',pause);if(paused){$('pause').setAttribute('aria-pressed','true');$('pause-label').textContent='继续';}
  function feed(){if(paused){toast('先继续画面，伙伴就会来吃食。');return;}feedingUntil=elapsed+23;
    const spots=[[-4.7,1.25],[-3.8,1.25],[-2.8,.55]];
    walkers.forEach((w,i)=>{w.target.set(spots[i][0],spots[i][1]);w.state='walk';w.until=feedingUntil;});toast('开饭啦，它们会慢慢走到食槽边。');}
  $('feed').addEventListener('click',feed);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down:THREE.Vector2|null=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down=new THREE.Vector2(e.clientX,e.clientY);});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down||down.distanceTo(new THREE.Vector2(e.clientX,e.clientY))>9)return;
    pointer.set(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);raycaster.setFromCamera(pointer,camera);
    const roots=[...walkers.map(w=>w.rig.root),trough];const hits=raycaster.intersectObjects(roots,true);const hit=hits[0];if(!hit)return;
    let node:THREE.Object3D|null=hit.object;while(node&&!roots.includes(node as THREE.Group))node=node.parent;
    if(node===trough){feed();return;}const w=walkers.find(w=>w.rig.root===node);if(w){select(w.rig.kind);toast('选中了'+$('animal-name').textContent+'，可以靠近看看。');}});
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

  // Stars and warm lanterns share the night scene; no whole-canvas darkening filter.
  const starGeo=new THREE.BufferGeometry(),starPos:number[]=[];
  for(let i=0;i<150;i++){const x=(rand()-.5)*100,z=-25-rand()*45,y=20+rand()*30;starPos.push(x,y,z);}
  starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));const starMat=new THREE.PointsMaterial({color:0xffecd5,size:.11,transparent:true,opacity:0});const stars=new THREE.Points(starGeo,starMat);scene.add(stars);
  const lanternLight=new THREE.PointLight(0xffb86a,0,11,2);lanternLight.position.set(-5.8,1.7,-2.1);scene.add(lanternLight);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(1.3,24,16),new THREE.MeshBasicMaterial({color:0xf3edd4,transparent:true,opacity:0}));moon.position.set(-15,23,-38);scene.add(moon);
  const clouds:THREE.Group[]=[];
  for(let i=0;i<6;i++){const g=new THREE.Group();g.position.set(-22+i*10,14+(i%2)*3,-20-i*2);for(let j=0;j<4;j++){const cloud=blob(g,0xedeee0,j*1.3,Math.sin(j)*.5,0,1.4,1.0,1.3);cloud.castShadow=false;cloud.receiveShadow=false;}scene.add(g);clouds.push(g);}

  progress(94,'最后一束光，落在它们脚边。');await yieldPaint();
  await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
  progress(100,'牧场准备好了。');world.dataset.ready='true';world.dataset.animals='3';world.dataset.renderer='three-webgl';loading.classList.add('done');
  let last=performance.now(),lastRendered=last,frames=0,disposed=false;
  const daytime=new THREE.Color(0xc8dfdf),nighttime=new THREE.Color(0x263a46);
  function animate(now:number){if(disposed)return;requestAnimationFrame(animate);
    if(document.hidden){last=now;return;}if(now-lastRendered<(innerWidth<600?32:15))return;
    const dt=Math.min(.065,(now-last)/1000);last=now;lastRendered=now;if(!paused)elapsed+=dt;
    wind.value=elapsed;
    nightBlend=THREE.MathUtils.damp(nightBlend,night?1:0,2,dt);
    (scene.background as THREE.Color).copy(daytime).lerp(nighttime,nightBlend);(scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
    sun.intensity=2.3*(1-nightBlend)+.32*nightBlend;sun.color.set(nightBlend>.5?0xb8cfeb:0xffe3ad);
    hemi.intensity=1.65*(1-nightBlend)+1.05*nightBlend;backlight.intensity=.65*(1-nightBlend)+.18*nightBlend;
    lanternLight.intensity=nightBlend*6;starMat.opacity=nightBlend*.80;(moon.material as THREE.MeshBasicMaterial).opacity=nightBlend;
    lanterns.forEach(m=>(m.material as THREE.MeshStandardMaterial).emissiveIntensity=.25+nightBlend*2.8);
    for(const leaf of leafGroups){leaf.group.rotation.z=Math.sin(elapsed*.55+leaf.phase)*.013;leaf.group.rotation.x=Math.cos(elapsed*.38+leaf.phase)*.009;}
    clouds.forEach((g,i)=>{g.position.x=-22+i*10+Math.sin(elapsed*.025+i)*1.1;});
    ripples.forEach((m,i)=>{const phase=(elapsed*.22+i/3)%1;m.scale.setScalar(.3+phase*3.4);(m.material as THREE.MeshBasicMaterial).opacity=(1-phase)*.22;});
    for(const w of walkers){
      if(!paused){if(w.state==='walk'){
        const delta=w.target.clone().sub(w.position),d=delta.length();
        if(d<.045){w.state=elapsed<feedingUntil?'eat':'idle';w.until=elapsed<feedingUntil?feedingUntil:elapsed+4+rand()*5;if(w.state==='eat')w.heading=Math.atan2(-4-w.position.x,.2-w.position.y);}
        else{const step=Math.min(d,w.speed*dt*(elapsed<feedingUntil?1.45:1));const direction=delta.normalize();
          if(elapsed>=feedingUntil)for(const other of walkers){if(other===w)continue;const away=w.position.clone().sub(other.position),distance=away.length();const clearance=(w.rig.kind==='goat'?.65:.40)+(other.rig.kind==='goat'?.65:.40);if(distance>0&&distance<clearance)direction.addScaledVector(away.normalize(),(1-distance/clearance)*1.6);}
          direction.normalize();w.position.addScaledVector(direction,step);const angle=Math.atan2(direction.x,direction.y);w.heading+=Math.atan2(Math.sin(angle-w.heading),Math.cos(angle-w.heading))*Math.min(1,dt*4);}
      }else if(elapsed>w.until){w.state='walk';w.target.set(-2.6+rand()*5.2,.1+rand()*3.3);w.until=elapsed+12;}}
      const babyScale=w.baby?.66:1,walk=w.state==='walk'&&!paused,eat=w.state==='eat'&&!paused,phase=elapsed*(w.rig.kind==='rabbit'?8:6)+w.phase;
      w.rig.root.scale.setScalar(babyScale);w.rig.root.position.set(w.position.x,ground(w.position.x,w.position.y)+(walk&&w.rig.kind==='rabbit'?Math.max(0,Math.sin(phase))*.055:0),w.position.y);w.rig.root.rotation.y=w.heading;
      w.rig.body.rotation.z=walk?Math.sin(phase)*.017:Math.sin(elapsed*1.6+w.phase)*.004;
      w.rig.body.scale.y=1+Math.sin(elapsed*2+w.phase)*.006;
      w.rig.head.scale.setScalar(w.baby?1.18:1);
      w.rig.head.rotation.x=eat?.55+Math.sin(elapsed*4+w.phase)*.1:walk?-.025:Math.sin(elapsed*.65+w.phase)*.08;
      w.rig.head.rotation.y=eat?Math.sin(elapsed*2+w.phase)*.08:Math.sin(elapsed*.8+w.phase)*.08;
      w.rig.legs.forEach((leg,i)=>{leg.rotation.x=walk?Math.sin(phase+(i%2)*Math.PI)*.32:0;});
      w.rig.ears.forEach((ear,i)=>{ear.rotation.z=Math.sin(elapsed*1.3+i+w.phase)*.045;});w.rig.tail.rotation.y=Math.sin(elapsed*2+w.phase)*.07;
    }
    $('animal-state').textContent=paused?'静静陪着你':selected.state==='eat'?'正在吃食':selected.state==='walk'?'在草地上散步':'晒太阳，歇一会儿';
    if(transition){const p=Math.min(1,(now-transition.at)/1100),u=p*p*(3-2*p);camera.position.lerpVectors(transition.startCamera,transition.endCamera,u);controls.target.lerpVectors(transition.startTarget,transition.endTarget,u);if(p===1)transition=null;}
    controls.update();renderer.render(scene,camera);frames++;if(frames%30===0)world.dataset.frames=String(frames);
  }
  requestAnimationFrame(animate);
  addEventListener('pagehide',()=>{disposed=true;controls.dispose();renderer.dispose();},{once:true});
}
start().catch(error=>{console.error(error);fail('暂时无法打开三维画面，请使用支持 WebGL 2 的浏览器重新进入。');});
