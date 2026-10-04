import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

test('真实服务器：账号、邀请、隐私、完整对局、重开与重启恢复',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pair-play-test-')),url='http://127.0.0.1:3221';
 let child,logs='',channels=[];
 async function start(){
  child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3221',DATA_DIR:dir}});
  child.stderr.on('data',d=>{logs+=d;});
  for(let n=0;n<50;n++){try{if((await fetch(url+'/healthz')).ok)return;}catch{}await delay(100);}
  throw new Error('服务器启动失败 '+logs);
 }
 async function stop(){channels.forEach(c=>c.abort());channels=[];const exit=once(child,'exit');child.kill();await exit;}
 function client(){return {cookie:'',id:'',async call(path,data,status=200,origin){
  const r=await fetch(url+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:this.cookie,...(data===undefined?{}:{'Content-Type':'application/json'}),...(origin?{Origin:origin}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));
  if(r.headers.get('set-cookie'))this.cookie=r.headers.get('set-cookie').split(';')[0];
  if(b.me)this.id=b.me.id;return b;
 },async stream(){
  const c=new AbortController();channels.push(c);
  const r=await fetch(url+'/api/events',{headers:{Cookie:this.cookie},signal:c.signal});assert.equal(r.status,200);
  const reader=r.body.getReader();await reader.read();
  (async()=>{try{while(!(await reader.read()).done){}}catch{}})();return c;
 }};}
 try{
  await start();const a=client(),b=client(),c=client();
  const catalog=await a.call('catalog');assert.equal(catalog.games[0].name,'猜数字');
  await a.call('state',undefined,401);
  for(const [client,account,name] of [[a,'test_a','玩家甲'],[b,'test_b','玩家乙'],[c,'test_c','玩家丙']])await client.call('register',{account,name,password:'test-pass-123'});
  await c.call('login',{account:'test_c',password:'wrong-pass'},400);
  await a.call('room/create',{seconds:30},403,'https://untrusted.invalid');
  await a.stream();await b.stream();
  let s=await a.call('room/create',{gameId:'guess-number',seconds:30});const code=s.room.code;
  const waiting=(await b.call('state')).players.find(p=>p.id===a.id);assert.equal(waiting.game.name,'猜数字');assert.equal(waiting.game.phase,'waiting');assert.equal(waiting.game.startedAt,null);assert.equal(waiting.account,undefined);
  await a.call('invite',{to:b.id});const refused=(await b.call('state')).invites[0];assert.ok(refused.expires-Date.now()<=15000);assert.ok(refused.expires-Date.now()>14000);assert.equal(refused.gameName,'猜数字');assert.equal(refused.seconds,30);
  await b.call('invite/respond',{id:refused.id,accept:false});assert.equal((await b.call('state')).invites.length,0);
  await a.call('invite',{to:b.id});const expired=(await b.call('state')).invites[0];await delay(15100);assert.equal((await b.call('state')).invites.length,0);await b.call('invite/respond',{id:expired.id,accept:true},400);
  await a.call('invite',{to:b.id});const invitation=(await b.call('state')).invites[0];assert.ok(invitation);
  await b.call('invite/respond',{id:invitation.id,accept:true});
  await c.call('room/join',{code},400);
  await b.call('room/settings',{seconds:60},400);await a.call('room/settings',{seconds:60});
  await a.call('room/secret',{value:'1234'},400);
  await a.call('room/ready',{ready:true});assert.equal((await b.call('state')).room.phase,'waiting');
  await b.call('room/ready',{ready:true});
  await a.call('room/secret',{value:'123'},400);
  await a.call('room/secret',{value:'1234'});await a.call('room/secret',{value:'9999'},400);
  await b.call('room/secret',{value:'5678'});
  const privateView=(await b.call('state')).room;assert.equal(privateView.ownSecret,'5678');assert.equal(privateView.revealed,undefined);assert.equal(privateView.secrets,undefined);
  do{await a.call('room/dice',{});s=await b.call('room/dice',{});}while(s.room.phase==='dice');
  const playing=(await c.call('state')).players.find(p=>p.id===a.id);assert.equal(playing.game.phase,'playing');assert.ok(playing.game.startedAt>0);
  const clients=new Map([[a.id,a],[b.id,b]]);
  await clients.get(s.room.turn===a.id?b.id:a.id).call('room/guess',{value:'3333'},400);
  if(s.room.turn===a.id)s=await a.call('room/guess',{value:'1111'});
  s=await b.call('room/guess',{value:'3333'});assert.equal(s.room.history.at(-1).hits,1);assert.equal(s.room.history.at(-1).value,'3333');
  s=await a.call('room/guess',{value:'5678'});assert.equal(s.room.phase,'finished');assert.equal(s.room.winner,a.id);assert.deepEqual(s.room.revealed,{[a.id]:'1234',[b.id]:'5678'});
  assert.equal(s.stats.wins,1);assert.equal((await b.call('state')).stats.played,1);
  await b.call('room/rematch',{});await a.call('room/settings',{seconds:60,disableHistory:true});await a.call('room/ready',{ready:true});await b.call('room/ready',{ready:true});
  await a.call('room/secret',{value:'0000'});await b.call('room/secret',{value:'0123'});
  do{await a.call('room/dice',{});s=await b.call('room/dice',{});}while(s.room.phase==='dice');
  const guessing=s.room.turn;const feedback=await clients.get(guessing).call('room/guess',{value:'0999'});assert.deepEqual(feedback.room.history,[]);assert.deepEqual(feedback.feedback,{value:'0999',hits:1});const opponent=await clients.get(guessing===a.id?b.id:a.id).call('state');assert.equal(opponent.room.lastOpponentGuess.value,'0999');assert.equal(opponent.room.lastOpponentGuess.hits,1);s=await a.call('state');assert.deepEqual(s.room.history,[]);assert.equal(s.feedback,undefined);
  const turn=s.room.turn;await stop();await start();
  assert.equal((await a.call('state')).room.paused,true);await a.stream();await b.stream();
  s=await a.call('state');assert.equal(s.room.code,code);assert.equal(s.room.phase,'playing');assert.equal(s.room.turn,turn);assert.equal(s.room.paused,false);assert.equal(s.room.ownSecret,'0000');
  await a.call('room/leave',{});s=await b.call('state');assert.equal(s.room.reason,'left');assert.equal(s.room.winner,b.id);
  assert.equal(s.room.disableHistory,true);assert.equal(s.room.history.length,1);assert.equal(s.room.history[0].player,guessing);assert.equal(s.room.history[0].value,'0999');assert.equal(s.room.history[0].hits,1);
  assert.deepEqual((await b.call('state')).room.history,s.room.history);
  await b.call('room/rematch',{},400);await b.call('room/leave',{});
  s=await b.call('room/create',{});await c.call('room/join',{code:s.room.code});
  await c.call('room/leave',{});await b.call('room/leave',{});
  await b.call('logout',{});await b.call('state',undefined,401);
 }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
