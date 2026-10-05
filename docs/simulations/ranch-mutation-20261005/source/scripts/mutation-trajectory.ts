import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initialRanch, settleRanch, ranchAction, species, level, active, feeding } from '../apps/api/src/games/animal-ranch/engine.js';
import { HOUR, FEED_UNIT_MS, FEED_CAPACITY, expansionFor } from '../packages/contracts/src/ranch-balance.js';
import { simulate as reference } from './ranch-balance-simulation.js';

const root = process.argv[2]!;
const config = JSON.parse(fs.readFileSync(root+'/candidate-config.json','utf8'));
const SEED = 20261005;
function random(seed:number) {
  return () => { let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296; };
}
function trajectory(gap:number,strategy:'income'|'xp'|'low',policyName:string,
                    rate:number|'codex',seed:number,tokenMode:'individual'|'species'='individual',days=90,craftCap=4,
                    fusionMode:'none'|'inherit'|'random'='none', progressive=false,
                    craftStrategy:'greedy'|'save-high'='greedy') {
  const rng=random(seed), policy=config.policies[policyName];
  let s=initialRanch(0),carry=0,crystals=0,grossFixed=0,bought=0,retired=0;
  const meta=new Map<string,{attrs:number[],q:number,adult:boolean,bornP:number}>();
  const completed=new Set<string>(), variants=new Set<string>();
  const stocks:Record<string,number[]>={},daily:Record<string,{keys:Set<string>,count:number}>={};
  const hallItems:Record<string,{id:string,q:number,attrs:number[]}[]>={};
  let fusionCount=0,fusionCoins=0,fusionTokens=0,randomCount=0;
  const firstCraft:Record<string,number>={},craftByGrade=[0,0,0,0,0];
  const milestones:Record<string,number>={},snapshots:Record<string,unknown>={},possible:Record<string,unknown>={};
  const rngPick=(weights:number[])=> {let r=rng()*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<weights.length;i++){r-=weights[i]!;if(r<0)return i;}return weights.length-1;};
  const bonus=(n:number,table:number[][])=>table.reduce((v,[at,b])=>n>=at!?b!:v,0);
  const pNow=()=>rate==='codex'?Math.min(.30,.10+bonus(completed.size,config.codex_species_milestones)+bonus(variants.size,config.codex_variant_milestones)):rate;
  const discover=(id:string,m:{attrs:number[]})=> {if(m.attrs.length)variants.add(id+':'+[...m.attrs].sort((a,b)=>a-b).join(','));};
  const policyKey=(id:string)=>{if(policyName!=='lifecycle')return policyName;
    const k=species.find(k=>k.id===id)!;const t=(k.growthMs+k.maxRounds*k.cycleMs)/HOUR;
    return 'lifecycle-'+config.lifecycle_quality.find((b:any)=>t<=b.max_hours).id;};
  const policyFor=(id:string)=>config.policies[policyKey(id)];
  const mutate=(id:string,m:{attrs:number[],q:number,bornP:number},p:number)=> {
    if(rng()>=p)return;
    const w=config.attr_weights.map((v:number,i:number)=>m.attrs.includes(i)?0:v);
    m.attrs.push(rngPick(w));m.q=Math.max(m.q,rngPick(policyFor(id).quality_weights));discover(id,m);
  };
  const multiplier=(id:string)=> {const m=meta.get(id);if(!m)return 1;
    const animal=s.animals.find(a=>a.id===id);const pp=policyFor(animal?.species??'chicken');
    return 1+pp.quality_bonus[m.q]+Math.min(pp.attr_cap,m.attrs.reduce((v,a)=>v+pp.attr_bonus[a],0));};
  const expected=(id:string)=> {if(pNow()===0)return 1;
    const pop=(p:number)=>config.populations[`${policyKey(id)}-${p.toFixed(2)}`].mean_multiplier_exact;
    const m1=pop(.1),m2=pop(.2),m3=pop(.3),a=(m3-2*m2+m1)/.02,b=(m2-m1)/.1-a*.3;
    return a*pNow()**2+b*pNow()+(m1-a*.01-b*.1);};
  function plan(stock:number[],target:number,price:number) {
    if(stock.some((n,q)=>q>=target&&n>0))return {tokens:0,coins:0};
    if(target>craftCap)return null;
    stock=stock.map((n,q)=>q>craftCap?0:n);
    const weights=progressive?[1,2,4,12,36]:[1,2,4,8,16];
    if(stock.reduce((n,c,q)=>n+c*weights[q]!,0)<weights[target]!)return null;
    const arr=[...stock],counts=[0,0,0,0,0];
    function take(q:number){if(arr[q]!>0){arr[q]!--;return;}
      assert(q>0);for(let i=0;i<(progressive&&q>=3?3:2);i++)take(q-1);counts[q]!++;}
    take(target);
    const fees=[0,...[.10,.25,.50,1].map(f=>Math.ceil(price*f-1e-12))];
    return {tokens:counts.reduce((n,c,q)=>n+c*config.fusion_tiers.balanced[q],0),coins:counts.reduce((n,c,q)=>n+c*fees[q]!,0)};
  }
  function visit(){
    const act=(type:string,p:Record<string,unknown>={})=>{s=ranchAction(s,type,p);};
    if(s.animals.some(a=>a.stored)) {
      const batches=s.batches.filter(b=>b.harvestedAt===null&&b.round>0);
      for(const b of batches){const a=s.animals.find(a=>a.id===b.animalId)!;
        // Award at actual production day; settled harvest must commit it. Max3/day.
        const day=String(Math.floor(b.at/(24*HOUR)));
        const row=daily[day]??=( {keys:new Set(),count:0} );
        const key=tokenMode==='species'?a.species:a.id;
        if(!row.keys.has(key)&&row.count<3){row.keys.add(key);row.count++;crystals++;}
      }
      act('harvest');
    }
    if(s.lots.some(l=>l.quantity)) {
      let quote=carry;
      for(const l of s.lots)quote+=l.quantity*Math.round(l.price*1000*multiplier(l.animalId!));
      const before=s.coins;act('sellProducts');
      const actual=Math.floor(quote/1000),base=s.coins-before;
      s.coins+=actual-base;carry=quote%1000;grossFixed+=quote-carry;
    }
    for(const a of s.animals.filter(a=>a.status==='completed')) {
      const q=meta.get(a.id)?.q??0;const hist=stocks[a.species]??=Array(5).fill(0);
      hist[q]++;completed.add(a.species);retired++;act('enterHall',{animalId:a.id});
      (hallItems[a.species]??=[]).push({id:a.id,q,attrs:[...(meta.get(a.id)?.attrs??[])]});
    }
    s.animals=s.animals.filter(active);s.batches=s.batches.filter(b=>b.harvestedAt===null);
    s.events=[];s.log=[];s.lots=s.lots.filter(l=>l.quantity>0);
    const reserve=Math.max(0,Math.ceil((gap+12)*2*s.capacity)-Math.floor(s.feedMs/FEED_UNIT_MS));
    const eligible=species.filter(k=>k.unlockLevel<=level(s.xp));
    const score=(k:typeof species[number])=>{const t=(k.growthMs+k.maxRounds*k.cycleMs)/HOUR;
      return strategy==='xp'?k.lifetimeXp/t:(k.maxRounds*k.yield*k.sellPrice*expected(k.id)-k.price-2*t)/t;};
    const options=strategy==='low'?[species[0]!]:eligible.toSorted((a,b)=>score(b)-score(a));
    const e=expansionFor(s.capacity);
    if(e&&level(s.xp)>=e.level&&s.coins>=e.cost+reserve+4*species[0]!.price)act('upgrade');
    while(s.animals.length<s.capacity){
      const k=options.find(k=>k.price<=s.coins-reserve);if(!k)break;
      act('buyAnimal',{species:k.id});bought++;
      const a=s.animals.at(-1)!;const m={attrs:[] as number[],q:0,adult:false,bornP:pNow()};
      mutate(a.species,m,m.bornP);meta.set(a.id,m);
    }
    const target=Math.min(FEED_CAPACITY,Math.ceil((gap+12)*2*s.animals.filter(feeding).length));
    for(const units of [300,100,20])while(s.feedMs/FEED_UNIT_MS+units<=target&&s.coins>=units)act('buyFeed',{units});
    if(fusionMode!=='none') {
      const order=Array.from({length:craftCap},(_,i)=>i);
      if(craftStrategy==='save-high')order.reverse();
      for(const k of species)for(const sourceQ of order) {
        const items=hallItems[k.id];if(!items)continue;
        while(true){
          const targetQ=sourceQ+1;
          const required=progressive&&targetQ>=3?3:2;
          const pair=items.filter(a=>a.q===sourceQ).slice(0,required);if(pair.length<required)break;
          const fee=Math.ceil(k.price*[0,.10,.25,.50,1][targetQ]!-1e-12);
          const tokenCost=config.fusion_tiers.balanced[targetQ]+(fusionMode==='random'?[0,1,2,4,8][targetQ]!:0);
          const extra=fusionMode==='random';
          const saved=craftStrategy==='save-high'&&tokenCost>0?(targetQ<=2?(extra?104:84):targetQ===3?(extra?56:48):0):0;
          if(s.coins<fee+reserve||crystals<tokenCost+saved)break;
          pair.sort((a,b)=>b.attrs.length-a.attrs.length);
          const main=pair[0]!;let attrs=[...main.attrs];
          const before=crystals,coinsBefore=s.coins;
          s.coins-=fee;crystals-=tokenCost;
          if(fusionMode==='random'){
            const retained=attrs.length===2?[attrs[0]!]:[];
            const weights=config.attr_weights.map((v:number,i:number)=>retained.includes(i)?0:v);
            attrs=[...retained,rngPick(weights)];randomCount++;
          }
          assert(attrs.length<=2&&new Set(attrs).size===attrs.length);
          if(attrs.length===2)assert(pair.some(a=>a.attrs.length===2));
          assert(pair.every(a=>a.q===sourceQ&&a.q<craftCap));
          stocks[k.id]![sourceQ]-=required;stocks[k.id]![targetQ]++;
          main.q=targetQ;main.attrs=attrs;
          for(const consumed of pair.slice(1))items.splice(items.indexOf(consumed),1);
          s.hallCount-=required-1;fusionCount++;fusionCoins+=fee;fusionTokens+=tokenCost;discover(k.id,main);
          craftByGrade[targetQ]++;firstCraft[targetQ]??=s.at/HOUR/24;
          assert.equal(coinsBefore-s.coins,fee);assert.equal(before-crystals,tokenCost);
        }
      }
    }
    for(const l of [2,3,5,8,10,15,18,20])if(level(s.xp)>=l&&milestones[l]===undefined)milestones[l]=s.at/HOUR/24;
    for(const targetQ of [2,3,4])if(possible[targetQ]===undefined){
      for(const k of species){if(!stocks[k.id])continue;const path=plan(stocks[k.id]!,targetQ,k.price);
        if(path&&crystals>=path.tokens&&s.coins>=path.coins+reserve){possible[targetQ]={day:s.at/HOUR/24,species:k.id,...path};break;}}
    }
    assert(Number.isSafeInteger(s.coins)&&s.coins>=0&&Number.isInteger(carry)&&carry>=0&&carry<1000);
  }
  visit();let dayRecorded=0;
  for(let h=gap;h<=days*24+1e-6;h+=gap){
    s=settleRanch(s,s.at,Math.round(h*HOUR));
    for(const a of s.animals.filter(a=>a.status!=='juvenile').toSorted((a,b)=>(a.adultAt??0)-(b.adultAt??0))){
      const m=meta.get(a.id);if(m&&!m.adult){mutate(a.species,m,pNow());m.adult=true;}
    }
    visit();const d=Math.floor(h/24+1e-8);
    if(d>dayRecorded){dayRecorded=d;if([1,7,30,90].includes(d))snapshots[d]={level:level(s.xp),xp:s.xp,
      coins:s.coins,capacity:s.capacity,crystals,completed_species:completed.size,variants:variants.size,mutation_probability:pNow()};}
  }
  assert.equal(Object.values(daily).reduce((n,r)=>n+r.count,0),crystals+fusionTokens);
  assert.equal(Object.values(stocks).reduce((n,h)=>n+h.reduce((a,b)=>a+b,0),0),s.hallCount);
  for(const [id,items] of Object.entries(hallItems))for(let q=0;q<5;q++)
    assert.equal(items.filter(a=>a.q===q).length,stocks[id]![q]);
  const consumed=craftByGrade.reduce((n,c,q)=>n+c*((progressive&&q>=3?3:2)-1),0);
  assert.equal(s.hallCount,retired-consumed);
  return {gap,strategy,policy:policyName,rate,seed,tokenMode,days,craftCap,fusionMode,progressive,craftStrategy,milestones,snapshots,possible,
    caveat:'possible = independent first-upgrade affordability; does not spend resources or reserve desired attributes',
    finalLevel:level(s.xp),coins:s.coins,xp:s.xp,crystals,probability:pNow(),completedSpecies:completed.size,
    variantCount:variants.size,bought,retired,stocks,carry,fusionCount,fusionCoins,fusionTokens,randomCount,firstCraft,craftByGrade};
}

if(process.env.SIM_APPEND_SAVING==='1'){
  const result=JSON.parse(fs.readFileSync(root+'/trajectory-results.json','utf8'));
  assert.equal(result.runs.length,58);
  for(const policy of ['lifecycle','conservative'])for(const gap of [4,8,12])for(const mode of ['inherit','random'] as const)
    result.runs.push(trajectory(gap,'income',policy,'codex',SEED,'individual',90,4,mode,true,'save-high'));
  for(const gap of [4,8,12])for(const mode of ['inherit','random'] as const)
    result.runs.push(trajectory(gap,'low','lifecycle','codex',SEED,'individual',90,4,mode,true,'save-high'));
  fs.writeFileSync(root+'/trajectory-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.runs.slice(58).map(r=>({gap:r.gap,strategy:r.strategy,policy:r.policy,
    mode:r.fusionMode,firstCraft:r.firstCraft,craftByGrade:r.craftByGrade,
    crystals:r.crystals,fusionTokens:r.fusionTokens,variants:r.variantCount,probability:r.probability})),null,2));
  process.exit(0);
}

if(process.env.SIM_APPEND_PROGRESSIVE==='1'){
  const result=JSON.parse(fs.readFileSync(root+'/trajectory-results.json','utf8'));
  assert.equal(result.runs.length,40);
  for(const policy of ['lifecycle','conservative'])for(const gap of [4,8,12]){
    result.runs.push(trajectory(gap,'income',policy,'codex',SEED,'individual',90,4,'inherit',true));
    for(let i=0;i<2;i++)result.runs.push(trajectory(gap,'income',policy,'codex',SEED+i,'individual',90,4,'random',true));
  }
  fs.writeFileSync(root+'/trajectory-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.runs.slice(40).map(r=>({gap:r.gap,policy:r.policy,seed:r.seed,fusionMode:r.fusionMode,
    lv20:r.milestones[20],d30:r.snapshots['30'],fusionCount:r.fusionCount,fusionCoins:r.fusionCoins,
    fusionTokens:r.fusionTokens,randomCount:r.randomCount,variants:r.variantCount,probability:r.probability,
    redHall:Object.values(r.stocks).reduce((n,h)=>n+h[4]!,0)})),null,2));
  process.exit(0);
}

if(process.env.SIM_APPEND_FUSION==='1'){
  const result=JSON.parse(fs.readFileSync(root+'/trajectory-results.json','utf8'));
  assert.equal(result.runs.length,31);
  for(const gap of [4,8,12]){
    result.runs.push(trajectory(gap,'income','lifecycle','codex',SEED,'individual',90,2,'inherit'));
    for(let i=0;i<2;i++)result.runs.push(trajectory(gap,'income','lifecycle','codex',SEED+i,'individual',90,2,'random'));
  }
  fs.writeFileSync(root+'/trajectory-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.runs.slice(31).map(r=>({gap:r.gap,seed:r.seed,fusionMode:r.fusionMode,
    lv20:r.milestones[20],d30:r.snapshots['30'],fusionCount:r.fusionCount,fusionCoins:r.fusionCoins,
    fusionTokens:r.fusionTokens,randomCount:r.randomCount,variants:r.variantCount,probability:r.probability})),null,2));
  process.exit(0);
}

// Validate the frozen real engine for all species, including finite XP/feed.
const validation=[];
for(const k of species){
  let s=initialRanch(0);s.animals=[];s.batches=[];s.lots=[];s.xp=1000000;s.coins=1000000;
  s.feedMs=1000*FEED_UNIT_MS;
  s=ranchAction(s,'buyAnimal',{species:k.id});
  for(let i=1;i<=k.maxRounds;i++){
    s=settleRanch(s,s.at,k.growthMs+i*k.cycleMs);s=ranchAction(s,'harvest',{});s=ranchAction(s,'sellProducts',{});
  }
  assert.equal(s.xp-1000000,k.lifetimeXp);
  assert.equal(s.coins-1000000,k.maxRounds*k.yield*k.sellPrice-k.price);
  assert.equal(1000*FEED_UNIT_MS-s.feedMs,k.growthMs+k.maxRounds*k.cycleMs);
  assert.equal(s.animals[0]!.status,'completed');
  const before=s.feedMs;s=settleRanch(s,s.at,s.at+10*24*HOUR);assert.equal(s.feedMs,before);
  validation.push(k.id);
}
const control=trajectory(4,'income','recommended',0,SEED);
const ref=reference(4,'income',90,'enterHall');
assert.deepEqual(control.milestones,ref.milestones);assert.equal(control.finalLevel,ref.finalLevel);
for(const day of ['1','7','30','90']){
  const ours=(control.snapshots as any)[day], theirs=(ref.snapshots as any)[day];
  for(const field of ['level','xp','coins','capacity'])assert.equal(ours[field],theirs[field]);
}
const runs=[control];
for(const gap of [4,8,12]){
  for(let i=0;i<3;i++)runs.push(trajectory(gap,'income','recommended','codex',SEED+i));
  runs.push(trajectory(gap,'income','previous',.30,SEED));
  runs.push(trajectory(gap,'income','recommended',.30,SEED));
}
runs.push(trajectory(1/12,'low','conservative',.30,SEED));
runs.push(trajectory(1/12,'low','recommended',.30,SEED));
runs.push(trajectory(4,'low','recommended','codex',SEED));
runs.push(trajectory(4,'income','recommended','codex',SEED,'species'));
for(const gap of [4,8,12])for(let i=0;i<3;i++)runs.push(trajectory(gap,'income','lifecycle','codex',SEED+i,'individual',90,2));
runs.push(trajectory(1/12,'low','lifecycle','codex',SEED,'individual',90,2));
runs.push(trajectory(4,'low','lifecycle','codex',SEED,'individual',90,2));
fs.writeFileSync(root+'/trajectory-results.json',JSON.stringify({seed:SEED,validation_species:validation,
  baseline_match:true,source:'immutable source snapshot, pure engine only, no database',runs},null,2));
console.log(JSON.stringify(runs.map(r=>({gap:r.gap,strategy:r.strategy,policy:r.policy,rate:r.rate,seed:r.seed,
  tokenMode:r.tokenMode,craftCap:r.craftCap,lv20:r.milestones[20],d30:(r.snapshots as any)['30'],possible:r.possible})),null,2));
