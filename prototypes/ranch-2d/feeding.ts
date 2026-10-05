export type MealPhase = 'turn' | 'lower' | 'eat' | 'raise';
export const mealDurations: Record<MealPhase, number> = {turn:.45,lower:.8,eat:6,raise:.85};
export function nextMealPhase(phase:MealPhase):MealPhase|null {
  return ({turn:'lower',lower:'eat',eat:'raise',raise:null} as const)[phase];
}
export function mealPose(phase:MealPhase,age:number,species:string){
  if(phase==='turn')return 0;
  if(phase==='lower')return age<.2?0:age<.6?1:2;
  if(phase==='raise')return age<.22?2:age<.48?1:3;
  const period=species==='chicken'?.85:species==='rabbit'?1.75:2.7;
  const t=(age%period)/period;
  return t<.64?2:t<.79?1:t<.90?3:1;
}
/** Slots remain booked while an animal raises its head and clears the lip. */
export class FeedSession {
  private waiting:string[]=[];
  private booked=new Map<number,string>();
  private finished=new Set<string>();
  private started=false;
  start(ids:string[],selected:string){
    if(this.active)return false;
    this.finished.clear();this.booked.clear();this.started=true;
    this.waiting=[...new Set([selected,...ids])].filter(id=>ids.includes(id));
    return true;
  }
  get active(){return this.started&&(this.waiting.length>0||this.booked.size>0);}
  get pending(){return this.waiting.length+this.booked.size;}
  get completed(){return this.finished.size;}
  peek(){return this.waiting[0]??null;}
  reserve(slot:number){
    if(this.booked.has(slot))return null;
    const id=this.waiting.shift();if(id===undefined)return null;
    this.booked.set(slot,id);return id;
  }
  owner(slot:number){return this.booked.get(slot)??null;}
  release(id:string){
    for(const [slot,owner] of this.booked)if(owner===id){this.booked.delete(slot);this.finished.add(id);return true;}
    return false;
  }
  cancel(id:string){this.waiting=this.waiting.filter(v=>v!==id);this.release(id);}
}
