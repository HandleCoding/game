import {RanchBlending,type SpriteFrame} from './scene-blending';
import {route,blocked,type Point,type Obstacle} from './navigation';
import {ActionAtlas} from './action-atlas';
import {FeedSession,mealDurations,nextMealPhase,mealPose,type MealPhase} from './feeding';
import {spriteLocation,animalExtent,type RanchSpecies} from './sprites';
import {softAtlasMetadata} from './soft-atlas-metadata';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('scene'),ctx=canvas.getContext('2d')!;
const paths=['/ranch-2d/scenery/ground-v1.png','/ranch-2d/scenery/tree-v1.png','/ranch-2d/scenery/trough-v2.png','/ranch-2d/scenery/fence-v2.png','/ranch/scene/soft/adult-0-v1.webp','/ranch/scene/soft/baby-0-v1.webp','/ranch/scene/soft/rabbit-stages-v1.webp','/ranch/ui/ranch-tools-v1.webp','/ranch-2d/actions/goat-feeding-v1.webp','/ranch-2d/actions/rabbit-feeding-v1.webp','/ranch-2d/actions/chicken-feeding-v1.webp','/ranch-2d/scenery/grass-v1.webp'];
const images=new Map<string,HTMLImageElement>(),downloaded=new Map<string,number>();
let ready=false,paused=matchMedia('(prefers-reduced-motion:reduce)').matches,blended=true,elapsed=0,last=0,lastRender=0,feedUntil=0,gateOpen=false,gateBlend=0,shakeAt=-999,shakenTree=1,toastTimer=0;
let width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,2),zoom=1,cameraX=600,cameraY=400,scale=1,offsetX=0,offsetY=0,follow=innerWidth<641;
let blender:RanchBlending,ground:HTMLImageElement,treeSprite:SpriteFrame,feederSprite:SpriteFrame,fenceSprite:SpriteFrame,grassSprite:SpriteFrame,actions:ActionAtlas,flatScene:HTMLCanvasElement,farLayer:HTMLCanvasElement;
interface Animal extends Point {id:string;name:string;species:RanchSpecies;baby:boolean;dir:number;phase:number;until:number;state:'idle'|'walk'|'queue'|'depart'|MealPhase;path:Point[];goal:Point|null;shade:number;intent:'walk'|'feed'|'shade'|'queue'|'depart';stride:number;speed:number;stageAt:number;feedSlot:number|null;departFrom:Point|null;stuck:number}
const seeds:Pick<Animal,'id'|'name'|'species'|'baby'|'x'|'y'|'phase'>[]=[
  {id:'goat',name:'山羊',species:'goat',baby:false,x:625,y:430,phase:1},
  {id:'rabbit',name:'垂耳兔',species:'rabbit',baby:false,x:605,y:526,phase:4},
  {id:'chicken',name:'小鸡',species:'chicken',baby:false,x:505,y:445,phase:7},
  {id:'kid',name:'小山羊',species:'goat',baby:true,x:735,y:498,phase:10},
  {id:'kit',name:'小兔子',species:'rabbit',baby:true,x:535,y:552,phase:13},
  {id:'chick',name:'小鸡仔',species:'chicken',baby:true,x:700,y:359,phase:16},
];
const animals:Animal[]=seeds.map(a=>({...a,dir:1,until:3+a.phase/2,state:'idle' as const,path:[],goal:null,shade:0,intent:'walk' as const,stride:0,speed:0,stageAt:0,feedSlot:null,departFrom:null,stuck:0}));
let selected=animals[0];
const trees=[{x:940,y:385,w:310,h:300,phase:1},{x:280,y:335,w:235,h:227,phase:2}];
const feeder={x:400,y:422,w:147,h:93};
const fences=[{x:268,y:622,w:190,h:92},{x:440,y:638,w:190,h:92},{x:800,y:638,w:190,h:92},{x:969,y:622,w:190,h:92}];
const gate={x:616,y:643,w:150,h:73};
const meals=new FeedSession(),events:{animal:string,state:string,time:number}[]=[];
const mealSlots=[{food:{x:456,y:390},face:-1},{food:{x:366,y:370},face:1}];
const waitingPoints=[{x:570,y:455},{x:620,y:490},{x:655,y:530},{x:545,y:530},{x:595,y:580},{x:705,y:570}];
const grassPatches=[
  {x:913,y:393,w:55,h:23},{x:963,y:390,w:43,h:19},{x:990,y:397,w:45,h:19},
  {x:252,y:341,w:45,h:18},{x:288,y:345,w:55,h:22},{x:317,y:340,w:33,h:15},
  {x:345,y:413,w:35,h:13},{x:459,y:426,w:38,h:15},
  ...fences.flatMap((f,i)=>[{x:f.x-f.w*.44,y:f.y+3,w:27+(i%2)*5,h:12},{x:f.x+f.w*.42,y:f.y+3,w:32,h:13}]),
  {x:730,y:545,w:58,h:25},{x:850,y:470,w:50,h:22},{x:470,y:570,w:53,h:23}
];
function state(a:Animal,value:Animal['state']){a.state=value;a.stageAt=elapsed;events.push({animal:a.id,state:value,time:Number(elapsed.toFixed(2))});if(events.length>80)events.shift();}
function bodyExtent(a:Animal,y=a.y){return animalExtent[a.species]*(a.baby?.62:1)*(.78+(y-300)/1100);}
function freeLine(a:Point,b:Point,objects=obstacles()){const n=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/3);for(let i=0;i<=n;i++)if(blocked({x:a.x+(b.x-a.x)*i/Math.max(n,1),y:a.y+(b.y-a.y)*i/Math.max(n,1)},objects,5))return false;return true;}
function pathTo(a:Animal,target:Point){const points=route(a,target,obstacles());if(!points.length)return [];
  if(!blocked(target,obstacles(),5)&&freeLine(points[points.length-1],target))points.push(target);
  const out:Point[]=[];let from:Point=a;
  for(let i=0;i<points.length;){let j=points.length-1;while(j>i&&!freeLine(from,points[j]))j--;out.push(points[j]);from=points[j];i=j+1;}return out;
}
function feedingPoint(a:Animal,slot:number){const site=mealSlots[slot];let p={x:site.food.x,y:site.food.y};
  for(let i=0;i<3;i++){const tip=actions.geometry(a.species,a.baby,2,bodyExtent(a,p.y)).tip;p={x:site.food.x-site.face*tip.x,y:site.food.y-tip.y};}
  for(let i=0;i<10&&blocked(p,obstacles(),5);i++)p.x-=site.face*3;return p;
}
function serviceMeals(){for(const a of animals)if(a.feedSlot!==null&&a.intent==='depart'&&a.departFrom&&Math.hypot(a.x-a.departFrom.x,a.y-a.departFrom.y)>46){meals.release(a.id);a.feedSlot=null;}
  for(const slot of [0,1]){if(meals.owner(slot))continue;const id=meals.reserve(slot);if(!id)continue;const a=animals.find(a=>a.id===id)!;a.feedSlot=slot;setGoal(a,feedingPoint(a,slot),'feed');}
  $('feed').toggleAttribute('disabled',meals.active);canvas.dataset.mealPending=String(meals.pending);canvas.dataset.mealCompleted=String(meals.completed);
}

function obstacles():Obstacle[]{return [...trees.map(t=>({kind:'circle' as const,x:t.x,y:t.y,r:26})),{kind:'rect',x:feeder.x,y:feeder.y-16,w:112,h:35},{kind:'rect',x:365,y:636,w:400,h:22},{kind:'rect',x:868,y:636,w:356,h:22},...(gateOpen?[]:[{kind:'rect' as const,x:626,y:636,w:122,h:22}])];}
const random=(()=>{let s=710052;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};})();
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('shown');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('shown'),3400);}
function choose(id:string){selected=animals.find(a=>a.id===id)!;document.querySelectorAll<HTMLButtonElement>('[data-animal]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.animal===id)));$('animal-name').textContent=selected.name;$('stage-text').textContent=selected.baby?'看看成年':'看看幼年';follow=width<641;}
function mode(value:boolean){blended=value;$('blended').setAttribute('aria-pressed',String(value));$('original').setAttribute('aria-pressed',String(!value));canvas.dataset.mode=value?'layered-2.5d':'flat-comparison';}
function setGoal(a:Animal,target:Point,intent:Animal['intent']='walk'){
  if(!['feed','queue','depart'].includes(intent)&&a.feedSlot!==null){meals.cancel(a.id);a.feedSlot=null;}
  if(!['feed','queue','depart'].includes(intent)&&a.intent==='queue')meals.cancel(a.id);
  a.intent=intent;a.path=pathTo(a,target);a.goal=target;a.stuck=0;
  if(a.path.length){state(a,intent==='depart'?'depart':'walk');a.until=elapsed+90;return true;}
  a.goal=null;if(intent==='feed'){meals.cancel(a.id);a.feedSlot=null;}
  state(a,intent==='queue'?'queue':'idle');a.until=elapsed+5;return false;
}
function feed(){
  if(paused){toast('先继续动画，伙伴们就会来吃食。');return;}
  if(!meals.start(animals.map(a=>a.id),selected.id)){toast('伙伴们正在吃食，稍等这一轮结束。');return;}
  mode(true);feedUntil=elapsed+120;
  animals.forEach((a,i)=>{a.feedSlot=null;a.departFrom=null;setGoal(a,waitingPoints[i],'queue');});
  serviceMeals();follow=width<641;toast('开饭啦！两侧轮流吃食，伙伴们会低头、啄食，再让出位置。');canvas.dataset.lastAction='feed';
}
function shadeWalk(){mode(true);if(paused){toast('先继续动画，再一起去树荫下。');return;}setGoal(selected,{x:984,y:416},'shade');follow=width<641;toast(selected.name+'去树荫下乘凉了。');canvas.dataset.lastAction='shade';}
function gateToggle(){mode(true);gateOpen=!gateOpen;for(const a of animals)if(a.goal)setGoal(a,a.goal,a.intent);$('gate-text').textContent=gateOpen?'关栅栏门':'开栅栏门';canvas.dataset.gate=gateOpen?'open':'closed';toast(gateOpen?'栅栏门打开了，现在可以走过门口。':'栅栏门关好了，通路也会随之改变。');canvas.dataset.lastAction='gate';}
function shake(index=1){mode(true);shakeAt=elapsed;shakenTree=index;canvas.dataset.lastAction='tree';toast('树叶簌簌响，几片叶子落了下来。');}
function setupControls(){
  for(const a of animals){const b=document.createElement('button');b.textContent=a.name;b.dataset.animal=a.id;b.setAttribute('aria-pressed',String(a===selected));b.addEventListener('click',()=>choose(a.id));$('picker').append(b);}
  $('blended').addEventListener('click',()=>mode(true));$('original').addEventListener('click',()=>mode(false));$('feed').addEventListener('click',feed);$('shade').addEventListener('click',shadeWalk);$('gate').addEventListener('click',gateToggle);
  $('stage').addEventListener('click',()=>{selected.baby=!selected.baby;if(selected.feedSlot!==null&&selected.intent==='feed')setGoal(selected,feedingPoint(selected,selected.feedSlot),'feed');choose(selected.id);toast(selected.baby?'这是原来的独立幼年形象。':'这是原来的成年形象。');});
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
function measure(){const wasDesktop=width>=641;width=innerWidth;height=innerHeight;if(wasDesktop&&width<641)follow=true;dpr=Math.min(devicePixelRatio||1,width<641?1.5:2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
function camera(dt:number){const cover=Math.max(width/1200,height/800);scale=cover*zoom;
  if(follow&&width<641){const targetX=selected.x,targetY=selected.y-height/scale*.09;cameraX+=(targetX-cameraX)*Math.min(1,dt*3);cameraY+=(targetY-cameraY)*Math.min(1,dt*3);}
  const vw=width/scale,vh=height/scale;cameraX=vw>=1200?600:Math.max(vw/2,Math.min(1200-vw/2,cameraX));cameraY=vh>=800?400:Math.max(vh/2,Math.min(800-vh/2,cameraY));offsetX=width/2-cameraX*scale;offsetY=height/2-cameraY*scale;
}
function simulate(dt:number){if(paused)return;elapsed+=dt;gateBlend+=(Number(gateOpen)-gateBlend)*Math.min(1,dt*5);serviceMeals();
  for(const a of animals){
    if(['turn','lower','eat','raise'].includes(a.state)){
      a.speed=0;const phase=a.state as MealPhase;if(elapsed-a.stageAt<mealDurations[phase])continue;
      const next=nextMealPhase(phase);if(next){state(a,next);continue;}
      const face=mealSlots[a.feedSlot!].face;a.departFrom={x:a.x,y:a.y};
      setGoal(a,{x:a.x-face*90,y:a.y+72},'depart');continue;
    }
    if((a.state==='walk'||a.state==='depart')&&a.path.length){
      const next=a.path[0],dx=next.x-a.x,dy=next.y-a.y,d=Math.hypot(dx,dy);
      if(d<1.2){a.x=next.x;a.y=next.y;a.path.shift();if(!a.path.length){a.goal=null;a.speed=0;
        if(a.intent==='feed'&&a.feedSlot!==null){a.dir=mealSlots[a.feedSlot].face;state(a,'turn');}
        else if(a.intent==='queue')state(a,'queue');
        else{if(a.feedSlot!==null){meals.release(a.id);a.feedSlot=null;}state(a,'idle');a.until=elapsed+(a.intent==='shade'?20:4+random()*7);}
      }continue;}
      const remaining=a.goal?Math.hypot(a.x-a.goal.x,a.y-a.goal.y):d;
      const targetSpeed=Math.min(a.intent==='feed'||a.intent==='queue'?46:28,Math.max(7,remaining*4))*(a.baby?.92:1);
      a.speed+=(targetSpeed-a.speed)*Math.min(1,dt*5);
      const step=Math.min(d,a.speed*dt),vx=dx/d,vy=dy/d;
      const safe=(p:Point)=>!blocked(p,obstacles(),3)&&animals.every(other=>other===a||Math.hypot(p.x-other.x,p.y-other.y)>(a.baby?7:11)+(other.baby?7:11));
      let candidate={x:a.x+vx*step,y:a.y+vy*step};
      if(!safe(candidate)){const choices=[1,-1].map(side=>({x:a.x+vx*step*.55-vy*step*.95*side,y:a.y+vy*step*.55+vx*step*.95*side}));candidate=choices.find(safe)??{x:a.x,y:a.y};}
      const moved=Math.hypot(candidate.x-a.x,candidate.y-a.y);a.x=candidate.x;a.y=candidate.y;a.stride+=moved;a.stuck=moved<.05?a.stuck+dt:0;
      if(Math.abs(dx)>2&&moved>.05)a.dir=dx>0?1:-1;
      if(a.stuck>.9&&a.goal){const target=a.goal;a.path=route(a,target,[...obstacles(),...animals.filter(v=>v!==a).map(v=>({kind:'circle' as const,x:v.x,y:v.y,r:v.baby?7:10}))]);a.stuck=0;if(!a.path.length)a.path=pathTo(a,target);else if(freeLine(a.path[a.path.length-1],target))a.path.push(target);}
    }else if(a.state==='idle'&&elapsed>a.until){let p:Point;do{p={x:370+random()*510,y:350+random()*220};}while(blocked(p,obstacles()));setGoal(a,p);}
  }
}
function tree(t:typeof trees[number],rotation:number){
  ctx.save();ctx.beginPath();ctx.rect(t.x-t.w*.65,t.y-t.h*.37,t.w*1.3,t.h*.39);ctx.clip();object(ctx,treeSprite,t.x,t.y,t.w,t.h);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(t.x-t.w*.7,t.y-t.h*1.12,t.w*1.4,t.h*.80);ctx.clip();
  ctx.translate(t.x,t.y-t.h*.35);ctx.rotate(rotation);ctx.translate(-t.x,-t.y+t.h*.35);object(ctx,treeSprite,t.x,t.y,t.w,t.h);ctx.restore();
}
function plant(p:typeof grassPatches[number],index:number){
  const close=animals.find(a=>(a.state==='walk'||a.state==='depart')&&Math.hypot(a.x-p.x,a.y-p.y)<p.w*.65);
  const bend=paused?0:Math.sin(elapsed*.8+index*1.7)*.025+(close?close.dir*.17:0);
  ctx.save();ctx.translate(p.x,p.y);ctx.transform(index%2?-1:1,0,bend,1,0,0);ctx.globalAlpha=.94;ctx.drawImage(grassSprite.soft,-p.w/2,-p.h,p.w,p.h);ctx.restore();
}
let frames=0;
function draw(now:number){requestAnimationFrame(draw);if(!ready)return;if(document.hidden){last=now;return;}if(now-lastRender<(width<641?31:15))return;const dt=Math.min(.07,(now-last)/1000||0);last=now;lastRender=now;simulate(dt);camera(dt);
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#afcf7f';ctx.fillRect(0,0,width,height);ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.drawImage(ground,0,0,1200,800);
  if(blended){ctx.save();const shift=(cameraX-600)*.12;ctx.drawImage(farLayer,-shift,0,1200,270);ctx.restore();
    for(const t of trees)objectShadow(treeSprite,t.x,t.y,t.w,t.h,.17);
    objectShadow(feederSprite,feeder.x,feeder.y,feeder.w,feeder.h,.18);for(const f of fences)objectShadow(fenceSprite,f.x,f.y,f.w,f.h,.14);objectShadow(fenceSprite,gate.x,gate.y,gate.w*(1-gateBlend*.72),gate.h,.12);
  }else ctx.drawImage(flatScene,0,0);
  const nodes:{y:number;draw:()=>void}[]=[];
  if(blended){for(const t of trees)nodes.push({y:t.y,draw:()=>{const breeze=paused?0:Math.sin(elapsed*.65+t.phase)*.006;const shake=elapsed-shakeAt;const impulse=t===trees[shakenTree]&&shake>=0&&shake<2?Math.sin(shake*16)*.025*(1-shake/2):0;tree(t,breeze+impulse);}});
    nodes.push({y:feeder.y,draw:()=>object(ctx,feederSprite,feeder.x,feeder.y,feeder.w,feeder.h)});for(const f of fences)nodes.push({y:f.y,draw:()=>object(ctx,fenceSprite,f.x,f.y,f.w,f.h)});
    nodes.push({y:gate.y,draw:()=>object(ctx,fenceSprite,gate.x-gateBlend*54,gate.y+gateBlend*21,gate.w*(1-gateBlend*.72),gate.h,gateBlend*.30)});
  }
  for(const a of animals){const meal=['turn','lower','eat','raise'].includes(a.state),col=(a.state==='walk'||a.state==='depart')?Math.floor(a.stride/8+a.phase)%4:0,body=meal?actions.geometry(a.species,a.baby,mealPose(a.state as MealPhase,elapsed-a.stageAt,a.species),bodyExtent(a)):frameFor(a,col);
    const shadow=trees.reduce((v,t)=>Math.max(v,Math.max(0,1-Math.hypot((a.x-(t.x+55))/112,(a.y-(t.y+28))/38))*.8),0);a.shade+=(shadow-a.shade)*Math.min(1,dt*4);
    if(blended){ctx.save();ctx.translate(a.x,a.y);blender.drawShadow(ctx,body.f,body.w,body.h,body.g,a.dir,a.y/800);ctx.restore();}
    nodes.push({y:a.y,draw:()=>{ctx.save();ctx.translate(a.x,a.y);const bob=paused||meal?0:Math.sin(a.stride/8*Math.PI/2+a.phase)*((a.state==='walk'||a.state==='depart')?.5:0);
      if(blended)blender.drawAnimal(ctx,body.f,body.w,body.h,body.g,a.dir,a.shade,bob);else{ctx.scale(a.dir,1);ctx.drawImage(body.f.raw,-body.w/2,-body.g+bob,body.w,body.h);}ctx.restore();if(blended)blender.grassAtFeet(ctx,body.f,a.x,a.y,body.w,a.dir,a.phase);
      if(a===selected){ctx.save();ctx.strokeStyle='rgba(255,244,171,.7)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(a.x,a.y+2,body.w*.37,body.w*.065,0,0,Math.PI*2);ctx.stroke();ctx.restore();}}});
  }
  if(blended)grassPatches.forEach((p,i)=>nodes.push({y:p.y,draw:()=>plant(p,i)}));
  nodes.sort((a,b)=>a.y-b.y).forEach(n=>n.draw());
  if(blended){ctx.save();ctx.fillStyle='rgba(255,249,220,.9)';ctx.beginPath();ctx.roundRect(feeder.x-20,feeder.y+8,40,16,8);ctx.fill();ctx.fillStyle='#647442';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText('食槽',feeder.x,feeder.y+20);ctx.restore();}
  if(blended){const age=elapsed-shakeAt;if(age>=0&&age<3){for(let i=0;i<12;i++){const tree=trees[shakenTree],x=tree.x+Math.sin(i*2.7)*tree.w*.32+Math.sin(age*2+i)*16,y=tree.y-tree.h*.58+age*51+i*4;ctx.save();ctx.translate(x,y);ctx.rotate(age*2+i);ctx.fillStyle=i%2?'#b7c760':'#88a342';ctx.beginPath();ctx.ellipse(0,0,3.2,1.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
    if(elapsed<feedUntil&&feedUntil-elapsed>117){const age=120-(feedUntil-elapsed);for(let i=0;i<14;i++){const p=Math.min(1,(age+i*.04)/1.8),x=feeder.x+Math.sin(i*2.4)*(1-p)*80,y=feeder.y-40-Math.sin(p*Math.PI)*70;ctx.fillStyle='#e6c864';ctx.globalAlpha=1-p;ctx.beginPath();ctx.ellipse(x,y,2.5,1.5,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}}
  const labels:Partial<Record<Animal['state'],string>>={queue:'等伙伴吃完，就轮到我啦',turn:'站稳脚步，朝向食槽',lower:'低下头，准备吃食',eat:selected.species==='chicken'?'正在食槽边啄食':'正在食槽边慢慢吃食',raise:'吃好了，抬头嚼一嚼',depart:'吃好了，给伙伴让出位置'};
  $('animal-state').textContent=paused?'静静陪着你':labels[selected.state]??(selected.shade>.25?'走进树荫，凉快一些了':selected.state==='walk'?'沿着通路慢慢散步':'在草地上歇一会儿');
  frames++;if(frames%30===0){canvas.dataset.frames=String(frames);canvas.dataset.selectedX=Math.round(selected.x).toString();canvas.dataset.selectedY=Math.round(selected.y).toString();canvas.dataset.selectedState=selected.state;canvas.dataset.shadow=selected.shade.toFixed(2);canvas.dataset.mealEvents=JSON.stringify(events.filter(e=>!['idle','walk'].includes(e.state)));canvas.dataset.actors=JSON.stringify(animals.map(a=>({id:a.id,x:+a.x.toFixed(1),y:+a.y.toFixed(1),state:a.state,intent:a.intent,slot:a.feedSlot,path:a.path.length,goal:a.goal})));canvas.dataset.pose=mealPose(['turn','lower','eat','raise'].includes(selected.state)?selected.state as MealPhase:'turn',elapsed-selected.stageAt,selected.species).toString();}
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
async function start(){setupControls();let next=0;await Promise.all([0,1].map(async()=>{while(next<paths.length)await loadImage(paths[next++]);}));ground=images.get(paths[0])!;blender=new RanchBlending(ground,width<641?40:64);treeSprite=objectFrame('tree',images.get(paths[1])!);feederSprite=objectFrame('trough',images.get(paths[2])!);fenceSprite=objectFrame('fence',images.get(paths[3])!);grassSprite=objectFrame('grass',images.get(paths[11])!);actions=new ActionAtlas(blender,images);
  flatScene=document.createElement('canvas');flatScene.width=1200;flatScene.height=800;const flat=flatScene.getContext('2d')!;for(const t of trees)object(flat,treeSprite,t.x,t.y,t.w,t.h);object(flat,feederSprite,feeder.x,feeder.y,feeder.w,feeder.h);for(const f of fences)object(flat,fenceSprite,f.x,f.y,f.w,f.h);object(flat,fenceSprite,gate.x,gate.y,gate.w,gate.h);
  farLayer=document.createElement('canvas');farLayer.width=1200;farLayer.height=270;const far=farLayer.getContext('2d')!;far.drawImage(ground,0,0,ground.naturalWidth,ground.naturalHeight*270/800,0,0,1200,270);far.globalCompositeOperation='destination-in';const fade=far.createLinearGradient(0,220,0,270);fade.addColorStop(0,'#fff');fade.addColorStop(1,'transparent');far.fillStyle=fade;far.fillRect(0,0,1200,270);
  const tools=images.get(paths[7])!;document.querySelectorAll<HTMLCanvasElement>('[data-icon]').forEach(icon=>{const i=Number(icon.dataset.icon);icon.width=160;icon.height=160;icon.getContext('2d')!.drawImage(tools,(i%3)*tools.naturalWidth/3,Math.floor(i/3)*tools.naturalHeight/3,tools.naturalWidth/3,tools.naturalHeight/3,0,0,160,160);});
  measure();ready=true;choose(selected.id);mode(true);canvas.dataset.ready='true';canvas.dataset.gate='closed';canvas.dataset.objects='tree,trough,fence,gate,grass';canvas.dataset.version='interaction-v2';$('loading').hidden=true;last=performance.now();requestAnimationFrame(draw);
}
start().catch(error=>{console.error(error);$('loading-message').textContent='部分资源还没准备好，可以重新加载。';$('retry').hidden=false;});
