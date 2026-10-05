/** Runtime Canvas compositing only. Original PNG/WebP pixels on disk remain unchanged. */
export interface SpriteFrame {
  raw:HTMLCanvasElement; soft:HTMLCanvasElement; shade:HTMLCanvasElement; shadow:HTMLCanvasElement;
  foot:number; contacts:{x:number,width:number}[];
}
export interface FrameCrop {x:number;y:number;width:number;height:number;ground:readonly number[]}
const makeCanvas=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

export class RanchBlending {
  private cache=new Map<string,SpriteFrame>();
  private land:Uint8ClampedArray;
  private mixed=document.createElement('canvas');
  constructor(private background:HTMLImageElement,private limit=64){
    const sample=makeCanvas(120,80),ctx=sample.getContext('2d',{willReadFrequently:true})!;
    ctx.drawImage(background,0,0,120,80);this.land=ctx.getImageData(0,0,120,80).data;
  }
  frame(key:string,sheet:CanvasImageSource,crop:FrameCrop,sheetWidth:number,col:number):SpriteFrame{
    const hit=this.cache.get(key);if(hit){this.cache.delete(key);this.cache.set(key,hit);return hit;}
    const ratio=Math.min(1,(key.startsWith('object-')?768:256)/Math.max(crop.width,crop.height)),w=Math.ceil(crop.width*ratio),h=Math.ceil(crop.height*ratio);
    const raw=makeCanvas(w,h),ctx=raw.getContext('2d',{willReadFrequently:true})!;
    ctx.drawImage(sheet,col*sheetWidth/4+crop.x,crop.y,crop.width,crop.height,0,0,w,h);
    const foot=(crop.ground[col]-crop.y)*h/crop.height;
    const soft=makeCanvas(w,h),s=soft.getContext('2d')!;
    s.filter='saturate(.94) contrast(.98)';s.drawImage(raw,0,0);s.filter='none';
    s.globalCompositeOperation='source-atop';s.fillStyle='rgba(255,224,164,.025)';s.fillRect(0,0,w,h);
    const bounce=s.createLinearGradient(0,foot-h*.36,0,foot);
    bounce.addColorStop(0,'rgba(124,147,62,0)');bounce.addColorStop(.65,'rgba(124,147,62,.025)');bounce.addColorStop(1,'rgba(124,147,62,.12)');
    s.fillStyle=bounce;s.fillRect(0,0,w,h);s.globalCompositeOperation='source-over';
    const shade=makeCanvas(w,h),sh=shade.getContext('2d')!;
    sh.drawImage(soft,0,0);sh.globalCompositeOperation='source-atop';sh.fillStyle='rgba(55,79,40,.19)';sh.fillRect(0,0,w,h);
    const shadow=makeCanvas(w,h),sd=shadow.getContext('2d')!;
    sd.drawImage(raw,0,0);sd.globalCompositeOperation='source-in';sd.fillStyle='#3d491f';sd.fillRect(0,0,w,h);
    // Small foot contact areas are measured from this frame's alpha, not the whole body.
    const alpha=ctx.getImageData(0,0,w,h).data,columns:number[]=[];
    for(let x=0;x<w;x++){let sum=0;for(let y=Math.max(0,Math.floor(foot)-7);y<Math.min(h,Math.ceil(foot)+1);y++)sum+=alpha[(y*w+x)*4+3];columns.push(sum);}
    const contacts:{x:number;width:number}[]=[];let start=-1;
    for(let x=0;x<=w;x++){if(x<w&&columns[x]>160){if(start<0)start=x;}else if(start>=0){if(x-start>=2)contacts.push({x:(start+x)/2/w-.5,width:(x-start)/w});start=-1;}}
    if(!contacts.length)contacts.push({x:0,width:.30});
    const frame={raw,soft,shade,shadow,foot,contacts};this.cache.set(key,frame);
    while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value!);
    return frame;
  }
  lighting(x:number,y:number){
    const px=clamp(Math.round(x/10),1,118),py=clamp(Math.round(y/10),1,78);let green=0;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)green+=this.land[((py+dy)*120+px+dx)*4+1];
    // Shade varies continuously with the baked illumination already in the ground.
    return clamp((174-green/9)/84,0,.9);
  }
  drawShadow(ctx:CanvasRenderingContext2D,f:SpriteFrame,width:number,height:number,ground:number,dir:number,depth:number){
    ctx.save();ctx.globalAlpha=.16+.04*depth;ctx.filter='blur(2.4px)';
    ctx.transform(dir,.07,-.31,-.22,9,4);ctx.drawImage(f.shadow,-width/2,-ground,width,height);ctx.restore();
    ctx.save();ctx.fillStyle='rgba(47,61,26,.24)';
    for(const foot of f.contacts){ctx.beginPath();ctx.ellipse(foot.x*width*dir,1,Math.max(2,foot.width*width*.67),Math.max(1.1,width*.016),0,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  drawAnimal(ctx:CanvasRenderingContext2D,f:SpriteFrame,width:number,height:number,ground:number,dir:number,shade:number,bob=0){
    let source:HTMLCanvasElement=f.soft;
    if(shade>.01){if(this.mixed.width!==f.raw.width||this.mixed.height!==f.raw.height){this.mixed.width=f.raw.width;this.mixed.height=f.raw.height;}
      const m=this.mixed.getContext('2d')!;m.clearRect(0,0,this.mixed.width,this.mixed.height);m.globalCompositeOperation='source-over';m.globalAlpha=1-shade;m.drawImage(f.soft,0,0);m.globalCompositeOperation='lighter';m.globalAlpha=shade;m.drawImage(f.shade,0,0);m.globalAlpha=1;m.globalCompositeOperation='source-over';source=this.mixed;}
    ctx.save();ctx.scale(dir,1);ctx.drawImage(source,-width/2,-ground+bob,width,height);ctx.restore();
  }
  grassAtFeet(ctx:CanvasRenderingContext2D,f:SpriteFrame,x:number,y:number,width:number,dir:number,seed:number){
    const mask=new Path2D();
    for(const foot of f.contacts){const center=x+foot.x*width*dir,radius=Math.max(4,foot.width*width*.80);
      // Restore only a few narrow grass tips from the actual background, never a flat green strip.
      for(let i=0;i<4;i++){const v=Math.sin(seed*1.3+i*2.7),tip=center+(i/3-.5)*radius*1.7;
        mask.moveTo(tip-1.0,y+2);mask.quadraticCurveTo(tip-1.5,y-1,tip+v*.8,y-3-(i%2)*1.5);mask.lineTo(tip+1.3,y+2);mask.closePath();}}
    ctx.save();ctx.clip(mask);ctx.globalAlpha=.85;ctx.drawImage(this.background,0,0,1200,800);ctx.restore();
  }
}
