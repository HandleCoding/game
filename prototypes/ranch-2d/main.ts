import {RanchBlending,type SpriteFrame} from './scene-blending';
import {route,blocked,type Point,type Obstacle} from './navigation';
import {spriteLocation,animalExtent,type RanchSpecies} from './sprites';
import {softAtlasMetadata} from './soft-atlas-metadata';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('scene'),ctx=canvas.getContext('2d')!;
const paths=['/ranch-2d/scenery/ground-v1.png','/ranch-2d/scenery/tree-v1.png','/ranch-2d/scenery/trough-v2.png','/ranch-2d/scenery/fence-v2.png','/ranch/scene/soft/adult-0-v1.webp','/ranch/scene/soft/baby-0-v1.webp','/ranch/scene/soft/rabbit-stages-v1.webp','/ranch/ui/ranch-tools-v1.webp'];
const images=new Map<string,HTMLImageElement>(),downloaded=new Map<string,number>();
let ready=false,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,blended=true,elapsed=0,last=0,lastRender=0,feedUntil=0,feedLevel=60,gateOpen=false,gateBlend=0,shakeAt=-999,shakenTree=1,toastTimer=0;
let width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,2),zoom=1,cameraX=600,cameraY=450,scale=1,offsetX=0,offsetY=0,follow=innerWidth<641;
let blender:RanchBlending,ground:HTMLImageElement,treeSprite:SpriteFrame,feederSprite:SpriteFrame,fenceSprite:SpriteFrame,flatScene:HTMLCanvasElement,farLayer:HTMLCanvasElement;
interface Animal extends Point {id:string;name:string;species:RanchSpecies;baby:boolean;dir:number;phase:number;until:number;state:'idle'|'walk'|'eat';path:Point[];goal:Point|null;shade:number;intent:'walk'|'feed'|'shade'}
const seeds:Pick<Animal,'id'|'name'|'species'|'baby'|'x'|'y'|'phase'>[]=[
  {id:'goat',name:'山羊',species:'goat',baby:false,x:625,y:430,phase:1},
  {id:'rabbit',name:'垂耳兔',species:'rabbit',baby:false,x:605,y:526,phase:4},
  {id:'chicken',name:'小鸡',species:'chicken',baby:false,x:505,y:445,phase:7},
  {id:'kid',name:'小山羊',species:'goat',baby:true,x:735,y:498,phase:10},
  {id:'kit',name:'小兔子',species:'rabbit',baby:true,x:535,y:552,phase:13},
  {id:'chick',name:'小鸡仔',species:'chicken',baby:true,x:700,y:359,phase:16},
];
const animals:Animal[]=seeds.map(a=>({...a,dir:1,until:3+a.phase/2,state:'idle' as const,path:[],goal:null,shade:0,intent:'walk' as const}));
let selected=animals[0];
const trees=[{x:940,y:385,w:310,h:300,phase:1},{x:280,y:335,w:235,h:227,phase:2}];
const feeder={x:400,y:422,w:147,h:93};
const fences=[{x:268,y:622,w:190,h:92},{x:440,y:638,w:190,h:92},{x:800,y:638,w:190,h:92},{x:969,y:622,w:190,h:92}];
const gate={x:616,y:643,w:150,h:73};
function obstacles():Obstacle[]{return [...trees.map(t=>({kind:'circle' as const,x:t.x,y:t.y,r:26})),{kind:'rect',x:feeder.x,y:feeder.y-16,w:112,h:35},{kind:'rect',x:365,y:636,w:400,h:22},{kind:'rect',x:868,y:636,w:356,h:22},...(gateOpen?[]:[{kind:'rect' as const,x:626,y:636,w:122,h:22}])];}
const random=(()=>{let s=710052;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};})();
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('shown');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('shown'),3400);}
function choose(id:string){selected=animals.find(a=>a.id===id)!;document.querySelectorAll<HTMLButtonElement>('[data-animal]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animal===id)));$('animal-name').textContent=selected.name;$('stage-text').textContent=selected.baby?'看看成年':'看看幼年';follow=width<641;}
function mode(value:boolean){blended=value;$('blended').setAttribute('aria-pressed',String(value));$('original').setAttribute('aria-pressed',String(!value));canvas.dataset.mode=value?'layered-2.5d':'flat-comparison';}
function setGoal(a:Animal,target:Point,intent:Animal['intent']='walk'){a.intent=intent;a.path=route(a,target,obstacles());a.goal=target;if(a.path.length){a.state='walk';a.until=elapsed+45;return true;}a.goal=null;a.state='idle';a.until=elapsed+5;return false;}
function feed(){if(paused){toast('先继续动画，伙伴们就会来吃食。');return;}mode(true);feedUntil=elapsed+32;feedLevel=Math.min(100,feedLevel+20);animals.forEach((a,i)=>setGoal(a,{x:345+(i%3)*53,y:468+Math.floor(i/3)*46},'feed'));follow=width<641;toast('开饭啦，它们会绕过设施，来到食槽边。');canvas.dataset.lastAction='feed';}
function shadeWalk(){mode(true);if(paused){toast('先继续动画，再一起去树荫下。');return;}setGoal(selected,{x:984,y:416},'shade');follow=width<641;toast(selected.name+'去树荫下乘凉了。');canvas.dataset.lastAction='shade';}
function gateToggle(){mode(true);gateOpen=!gateOpen;for(const a of animals)if(a.goal)setGoal(a,a.goal,a.intent);$('gate-text').textContent=gateOpen?'关栅栏门':'开栅栏门';canvas.dataset.gate=gateOpen?'open':'closed';toast(gateOpen?'栅栏门打开了，现在可以走过门口。':'栅栏门关好了，通路也会随之改变。');canvas.dataset.lastAction='gate';}
function shake(index=1){mode(true);shakeAt=elapsed;shakenTree=index;canvas.dataset.lastAction='tree';toast('树叶簌簌响，几片叶子落了下来。');}
function setupControls(){
  for(const a of animals){const b=document.createElement('button');b.textContent=a.name;b.dataset.animal=a.id;b.setAttribute('aria-pressed',String(a===selected));b.addEventListener('click',()=>choose(a.id));$('picker').append(b);}
  $('blended').addEventListener('click',()=>mode(true));$('original').addEventListener('click',()=>mode(false));$('feed').addEventListener('click',feed);$('shade').addEventListener('click',shadeWalk);$('gate').addEventListener('click',gateToggle);
  $('stage').addEventListener('click',()=>{selected.baby=!selected.baby;choose(selected.id);toast(selected.baby?'这是原来的独立幼年形象。':'这是原来的成年形象。');});
  $('pause').addEventListener('click',()=>{paused=!paused;updatePause();});updatePause();
  $('fit').addEventListener('click',()=>{zoom=Math.min(width/1200,height/800)/Math.max(width/1200,height/800);cameraX=600;cameraY=400;follow=false;});
  $('zoom-in').addEventListener('click',()=>{zoom=Math.min(2.3,zoom+.20);});$('zoom-out').addEventListener('click',()=>{zoom=Math.max(Math.min(width/1200,height/800)/Math.max(width/1200,height/800),zoom-.20);});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.30,Math.min(2.3,zoom+(e.deltaY>0?-.08:.08)));},{passive:false});
  $('retry').addEventListener('click',()=>location.reload());
}
function updatePause(){$('pause-text').textContent=paused?'继续动画':'暂停动画';$('pause').setAttribute('aria-pressed',String(paused));}
function imageProgress(){const value=paths.reduce((sum,url)=>sum+(downloaded.get(url)||0),0)/paths.length;$('progress').style.width=(value*100).toFixed(1)+'%';$('percent').textContent=Math.floor(value*100)+'%';}
async function loadImage(url:string){const controller=new AbortController();let timer=0;const arm=()=>{clearTimeout(timer);timer=window.setTimeout(()=>controller.abort(),45000);};arm();
  try{const response=await fetch(url,{signal:controller.signal,credentials:'omit'});if(!response.ok)throw new Error('资源未就绪');const length=Number(response.headers.get('Content-Length')),parts:ArrayBuffer[]=[];let bytes=0;
    if(response.body){const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;arm();bytes+=value.byteLength;parts.push(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength) as ArrayBuffer);if(length){downloaded.set(url,Math.min(.96,bytes/length*.96));imageProgress();}}}else parts.push(await response.arrayBuffer());
    arm();const data=await new Promise<string>((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result as string);f.onerror=reject;f.readAsDataURL(new Blob(parts,{type:response.headers.get('Content-Type')||'image/png'}));});
    const img=new Image();img.src=data;await img.decode();if(controller.signal.aborted||!img.naturalWidth)throw new Error('资源未就绪');images.set(url,img);downloaded.set(url,1);imageProgress();return img;
  }finally{clearTimeout(timer);}}
function objectFrame(id:string,img:HTMLImageElement):SpriteFrame{
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const p=c.getContext('2d',{willReadFrequently:true})!;p.drawImage(img,0,0);const alpha=p.getImageData(0,0,c.width,c.height).data;
  let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(alpha[(y*c.width+x)*4+3]>200){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const crop={x:Math.max(0,x0-4),y:Math.max(0,y0-4),width:Math.min(c.width-x0+4,x1-x0+9),height:Math.min(c.height-y0+4,y1-y0+9),ground:[y1,y1,y1,y1]};
  return blender.frame('object-'+id,img,crop,img.naturalWidth*4,0);
}
function object(ctx:CanvasRenderingContext2D,f:SpriteFrame,x:number,y:number,w:number,h:number,rotation=0){ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.drawImage(f.raw,-w/2,-h,w,h);ctx.restore();}
function objectShadow(f:SpriteFrame,x:number,y:number,w:number,h:number,alpha=.15){ctx.save();ctx.translate(x+7,y+2);ctx.transform(1,.035,-.40,-.21,0,0);ctx.globalAlpha=alpha;ctx.filter='blur(3px)';ctx.drawImage(f.shadow,-w/2,-h,w,h);ctx.restore();}
function frameFor(a:Animal,col:number){const loc=spriteLocation(a.species,a.baby),meta=softAtlasMetadata[loc.group],row=meta.rows[loc.row],sheet=images.get(loc.url)!;
  const f=blender.frame(a.species+':'+a.baby+':'+col,sheet,row,meta.width,col),extent=animalExtent[a.species]*(a.baby?.62:1)*(.78+(a.y-300)/1100),ratio=extent/Math.max(f.raw.width,f.raw.height);
  return{f,w:f.raw.width*ratio,h:f.raw.height*ratio,g:f.foot*ratio};}
function measure(){width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,width<641?1.5:2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
function camera(dt:number){const cover=Math.max(width/1200,height/800);scale=cover*zoom;
  if(follow&&width<641){const targetX=selected.x,targetY=selected.y-height/scale*.09;cameraX+=(targetX-cameraX)*Math.min(1,dt*3);cameraY+=(targetY-cameraY)*Math.min(1,dt*3);}
  const vw=width/scale,vh=height/scale;cameraX=vw>=1200?600:Math.max(vw/2,Math.min(1200-vw/2,cameraX));cameraY=vh>=800?400:Math.max(vh/2,Math.min(800-vh/2,cameraY));offsetX=width/2-cameraX*scale;offsetY=height/2-cameraY*scale;
}
function simulate(dt:number){if(paused)return;elapsed+=dt;gateBlend+=(Number(gateOpen)-gateBlend)*Math.min(1,dt*5);
  for(const a of animals){if(a.state==='walk'&&a.path.length){const next=a.path[0],dx=next.x-a.x,dy=next.y-a.y,d=Math.hypot(dx,dy);const speed=(elapsed<feedUntil?42:23)*(a.baby?.9:1);
      if(d<2){a.x=next.x;a.y=next.y;a.path.shift();if(!a.path.length){a.goal=null;a.state=a.intent==='feed'&&elapsed<feedUntil?'eat':'idle';a.until=a.state==='eat'?feedUntil:a.intent==='shade'?elapsed+20:elapsed+4+random()*7;}}
      else{let vx=dx/d,vy=dy/d;const step=Math.min(d,speed*dt);const p={x:a.x+vx*step,y:a.y+vy*step};if(!blocked(p,obstacles(),3)){a.x=p.x;a.y=p.y;}else if(a.goal){setGoal(a,a.goal,a.intent);}if(Math.abs(dx)>2)a.dir=dx>=0?1:-1;}
    }else if(elapsed>a.until){let p:Point;do{p={x:390+random()*490,y:330+random()*254};}while(blocked(p,obstacles()));setGoal(a,p);}}
}
let frames=0;
function draw(now:number){requestAnimationFrame(draw);if(!ready)return;if(document.hidden){last=now;return;}if(now-lastRender<(width<641?31:15))return;const dt=Math.min(.07,(now-last)/1000||0);last=now;lastRender=now;simulate(dt);camera(dt);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#afcf7f';ctx.fillRect(0,0,width,height);ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.drawImage(ground,0,0,1200,800);
  if(blended){ctx.save();const shift=(cameraX-600)*.12;ctx.drawImage(farLayer,-shift,0,1200,270);ctx.restore();
    for(const t of trees)objectShadow(treeSprite,t.x,t.y,t.w,t.h,.17);
    objectShadow(feederSprite,feeder.x,feeder.y,feeder.w,feeder.h,.18);for(const f of fences)objectShadow(fenceSprite,f.x,f.y,f.w,f.h,.14);objectShadow(fenceSprite,gate.x,gate.y,gate.w*(1-gateBlend*.72),gate.h,.12);
  }else ctx.drawImage(flatScene,0,0);
  const nodes:{y:number;draw:()=>void}[]=[];
  if(blended){for(const t of trees)nodes.push({y:t.y,draw:()=>{const breeze=paused?0:Math.sin(elapsed*.65+t.phase)*.006;const shake=elapsed-shakeAt;const impulse=t===trees[shakenTree]&&shake>=0&&shake<2?Math.sin(shake*16)*.025*(1-shake/2):0;object(ctx,treeSprite,t.x,t.y,t.w,t.h,breeze+impulse);}});
    nodes.push({y:feeder.y,draw:()=>object(ctx,feederSprite,feeder.x,feeder.y,feeder.w,feeder.h)});for(const f of fences)nodes.push({y:f.y,draw:()=>object(ctx,fenceSprite,f.x,f.y,f.w,f.h)});
    nodes.push({y:gate.y,draw:()=>object(ctx,fenceSprite,gate.x-gateBlend*54,gate.y+gateBlend*21,gate.w*(1-gateBlend*.72),gate.h,gateBlend*.30)});
  }
  for(const a of animals){const col=!paused&&a.state==='walk'?Math.floor(elapsed*6+a.phase)%4:0,body=frameFor(a,col);
    const shadow=trees.reduce((v,t)=>Math.max(v,Math.max(0,1-Math.hypot((a.x-(t.x+55))/112,(a.y-(t.y+28))/38))*.8),0);a.shade+=(shadow-a.shade)*Math.min(1,dt*4);
    if(blended){ctx.save();ctx.translate(a.x,a.y);blender.drawShadow(ctx,body.f,body.w,body.h,body.g,a.dir,a.y/800);ctx.restore();}
    nodes.push({y:a.y,draw:()=>{ctx.save();ctx.translate(a.x,a.y);const bob=paused?0:Math.sin(elapsed*(a.state==='walk'?12:2.1)+a.phase)*(a.state==='walk'?.35:.10);if(a.state==='eat'&&!paused)ctx.rotate(Math.sin(elapsed*3+a.phase)*.012);
      if(blended)blender.drawAnimal(ctx,body.f,body.w,body.h,body.g,a.dir,a.shade,bob);else{ctx.scale(a.dir,1);ctx.drawImage(body.f.raw,-body.w/2,-body.g+bob,body.w,body.h);}ctx.restore();if(blended)blender.grassAtFeet(ctx,body.f,a.x,a.y,body.w,a.dir,a.phase);
      if(a===selected){ctx.save();ctx.strokeStyle='rgba(255,244,171,.7)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(a.x,a.y+2,body.w*.37,body.w*.065,0,0,Math.PI*2);ctx.stroke();ctx.restore();}}});
  }
  nodes.sort((a,b)=>a.y-b.y).forEach(n=>n.draw());
  if(blended){const age=elapsed-shakeAt;if(age>=0&&age<3){for(let i=0;i<12;i++){const tree=trees[shakenTree],x=tree.x+Math.sin(i*2.7)*tree.w*.32+Math.sin(age*2+i)*16,y=tree.y-tree.h*.58+age*51+i*4;ctx.save();ctx.translate(x,y);ctx.rotate(age*2+i);ctx.fillStyle=i%2?'#b7c760':'#88a342';ctx.beginPath();ctx.ellipse(0,0,3.2,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
    if(elapsed<feedUntil&&feedUntil-elapsed>29){const age=32-(feedUntil-elapsed);for(let i=0;i<14;i++){const p=Math.min(1,(age+i*.04)/1.8),x=feeder.x+Math.sin(i*2.4)*(1-p)*80,y=feeder.y-40-Math.sin(p*Math.PI)*70;ctx.fillStyle='#e6c864';ctx.globalAlpha=1-p;ctx.beginPath();ctx.ellipse(x,y,2.5,1.5,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}}
  $('animal-state').textContent=paused?'静静陪着你':selected.state==='eat'?'正在食槽边吃食':selected.shade>.25?'走进树荫，凉快一些了':selected.state==='walk'?'沿着通路慢慢散步':'在草地上歇一会儿';
  frames++;if(frames%30===0){canvas.dataset.frames=String(frames);canvas.dataset.selectedX=Math.round(selected.x).toString();canvas.dataset.selectedY=Math.round(selected.y).toString();canvas.dataset.selectedState=selected.state;canvas.dataset.shadow=selected.shade.toFixed(2);}
}
const pointers=new Map<number,Point>();let downPoint:Point|null=null,lastPointer:Point|null=null,moved=false,pinchStart=0,pinchZoom=1;
canvas.addEventListener('pointerdown',e=>{if(!ready)return;const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);downPoint=lastPointer=p;moved=false;follow=false;if(pointers.size===2){const [a,b]=[...pointers.values()];pinchStart=Math.hypot(a.x-b.x,a.y-b.y);pinchZoom=zoom;moved=true;}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const p={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,p);if(pointers.size===2){const [a,b]=[...pointers.values()];zoom=Math.max(.3,Math.min(2.3,pinchZoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinchStart)));return;}if(downPoint&&Math.hypot(p.x-downPoint.x,p.y-downPoint.y)>7)moved=true;if(moved&&lastPointer){cameraX-=(p.x-lastPointer.x)/scale;cameraY-=(p.y-lastPointer.y)/scale;}lastPointer=p;});
canvas.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);if(moved||!downPoint||pointers.size)return;const p={x:(e.clientX-offsetX)/scale,y:(e.clientY-offsetY)/scale};
  const hit=animals.slice().sort((a,b)=>b.y-a.y).find(a=>{const b=frameFor(a,0);return Math.abs(p.x-a.x)<Math.max(b.w/2,22/scale)&&p.y>a.y-b.g&&p.y<a.y+10;});if(hit){choose(hit.id);return;}
  if(Math.abs(p.x-feeder.x)<feeder.w/2&&p.y<feeder.y&&p.y>feeder.y-feeder.h){feed();return;}
  const treeHit=trees.findIndex(t=>Math.abs(p.x-t.x)<t.w*.38&&p.y<t.y&&p.y>t.y-t.h);if(treeHit>=0){shake(treeHit);return;}
  if(Math.abs(p.x-gate.x)<110&&p.y>gate.y-gate.h&&p.y<gate.y+22){gateToggle();return;}
  if(!paused){if(setGoal(selected,p)){follow=width<641;canvas.dataset.lastAction='walk';toast(selected.name+'向这里走来了。');}else toast('通路被挡住了，试试先打开栅栏门。');}
});
canvas.addEventListener('pointercancel',()=>{pointers.clear();downPoint=null;moved=true;});
addEventListener('resize',measure);
async function start(){setupControls();let next=0;await Promise.all([0,1].map(async()=>{while(next<paths.length)await loadImage(paths[next++]);}));ground=images.get(paths[0])!;blender=new RanchBlending(ground,width<641?40:64);treeSprite=objectFrame('tree',images.get(paths[1])!);feederSprite=objectFrame('trough',images.get(paths[2])!);fenceSprite=objectFrame('fence',images.get(paths[3])!);
  flatScene=document.createElement('canvas');flatScene.width=1200;flatScene.height=800;const flat=flatScene.getContext('2d')!;for(const t of trees)object(flat,treeSprite,t.x,t.y,t.w,t.h);object(flat,feederSprite,feeder.x,feeder.y,feeder.w,feeder.h);for(const f of fences)object(flat,fenceSprite,f.x,f.y,f.w,f.h);object(flat,fenceSprite,gate.x,gate.y,gate.w,gate.h);
  farLayer=document.createElement('canvas');farLayer.width=1200;farLayer.height=270;const far=farLayer.getContext('2d')!;far.drawImage(ground,0,0,ground.naturalWidth,ground.naturalHeight*270/800,0,0,1200,270);far.globalCompositeOperation='destination-in';const fade=far.createLinearGradient(0,220,0,270);fade.addColorStop(0,'#fff');fade.addColorStop(1,'transparent');far.fillStyle=fade;far.fillRect(0,0,1200,270);
  const tools=images.get(paths[7])!;document.querySelectorAll<HTMLCanvasElement>('[data-icon]').forEach(icon=>{const i=Number(icon.dataset.icon);icon.width=160;icon.height=160;icon.getContext('2d')!.drawImage(tools,(i%3)*tools.naturalWidth/3,Math.floor(i/3)*tools.naturalHeight/3,tools.naturalWidth/3,tools.naturalHeight/3,0,0,160,160);});
  measure();ready=true;choose(selected.id);mode(true);canvas.dataset.ready='true';canvas.dataset.gate='closed';canvas.dataset.objects='tree,trough,fence,gate';$('loading').hidden=true;last=performance.now();requestAnimationFrame(draw);
}
start().catch(error=>{console.error(error);$('loading-message').textContent='部分资源还没准备好，可以重新加载。';$('retry').hidden=false;});
