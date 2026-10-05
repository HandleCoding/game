import {RanchBlending,type SpriteFrame} from './scene-blending';
import manifest from './public/actions/manifest.json';
interface PoseRect {x:number;y:number;w:number;h:number;anchor:number;ground:number;tip:[number,number]}
interface AtlasMeta {width:number;height:number;rows:PoseRect[][]}
export class ActionAtlas {
  private stages=new Map<string,{frames:SpriteFrame[];idleExtent:number;tip:[number,number]}>();
  constructor(blender:RanchBlending,images:Map<string,HTMLImageElement>){
    for(const [species,meta] of Object.entries(manifest) as [string,AtlasMeta][]){
      const sheet=images.get('/ranch-2d/actions/'+species+'-feeding-v1.webp');
      if(!sheet||sheet.naturalWidth!==meta.width||sheet.naturalHeight!==meta.height)throw new Error('动作图集版本不匹配');
      meta.rows.forEach((row,stage)=>{
        const half=Math.ceil(Math.max(...row.map(p=>Math.max(p.anchor-p.x,p.x+p.w-p.anchor))))+4;
        const up=Math.ceil(Math.max(...row.map(p=>p.ground-p.y)))+4;
        const frames=row.map((p,index)=>{
          const c=document.createElement('canvas');c.width=half*2;c.height=up+5;
          c.getContext('2d')!.drawImage(sheet,p.x,p.y,p.w,p.h,half-(p.anchor-p.x),up-(p.ground-p.y),p.w,p.h);
          return blender.frame('pose-'+species+'-'+stage+'-'+index,c,{x:0,y:0,width:c.width,height:c.height,ground:[up,up,up,up]},c.width*4,0);
        });
        const reduction=frames[0].raw.width/(half*2);
        this.stages.set(species+':'+Boolean(stage),{frames,idleExtent:Math.max(row[0].w,row[0].h)*reduction,tip:[row[2].tip[0]*reduction,row[2].tip[1]*reduction]});
      });
    }
  }
  geometry(species:string,baby:boolean,index:number,extent:number){
    const stage=this.stages.get(species+':'+baby)!;
    const f=stage.frames[index],ratio=extent/stage.idleExtent;
    return {f,w:f.raw.width*ratio,h:f.raw.height*ratio,g:f.foot*ratio,tip:{x:stage.tip[0]*ratio,y:stage.tip[1]*ratio}};
  }
}
