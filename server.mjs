import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Duel, GameError } from './game.mjs';

const scrypt = promisify(scryptCallback), root = fileURLToPath(new URL('.', import.meta.url));
const data = process.env.DATA_DIR || `${root}data`;
await mkdir(data, { recursive: true });
const db = new DatabaseSync(`${data}/pair-play.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY, code TEXT, players TEXT, winner TEXT, reason TEXT, turns INTEGER, created INTEGER);
 CREATE TABLE IF NOT EXISTS result_players(user TEXT NOT NULL, result TEXT NOT NULL REFERENCES results(id), PRIMARY KEY(user,result));
 CREATE TABLE IF NOT EXISTS active_rooms(code TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_results_winner ON results(winner);
 PRAGMA optimize;
`);
const rooms = new Map(), userRoom = new Map(), streams = new Map(), invitations = new Map(), rates = new Map();
for (const row of db.prepare('SELECT snapshot FROM active_rooms').all()) {
 const saved=JSON.parse(row.snapshot), room=new Duel(saved.code,saved.host,saved.seconds);
 Object.assign(room,saved.game);room.away={};
 if(room.phase!=='finished') {
  room.remaining=room.paused?room.remaining:room.deadline?Math.max(0,room.deadline-saved.savedAt):null;
  room.paused=true;for(const p of room.players)room.away[p]=Date.now()+60000;
 }
 rooms.set(room.code,room);for(const p of saved.members)userRoom.set(p,room.code);
}
function persistRooms() {
 db.exec('BEGIN');
 try {
  db.exec('DELETE FROM active_rooms');
  for(const room of rooms.values()) {
   const {now,roll,...game}=room;
   db.prepare('INSERT INTO active_rooms VALUES(?,?)').run(room.code,JSON.stringify({code:room.code,host:room.host,seconds:room.seconds,game,members:room.players.filter(p=>userRoom.get(p)===room.code),savedAt:Date.now()}));
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
const token = () => randomBytes(24).toString('hex');
const games = [{ id:'guess-number', name:'猜数字', category:'推理', minPlayers:2, maxPlayers:2, defaultSeconds:30 }];
const queryUser = id => db.prepare('SELECT id,account,name FROM users WHERE id=?').get(id);
const publicUser = u => ({ id: u.id, name: u.name, account: u.account });
const online = id => !!streams.get(id)?.size;
const roomFor = id => rooms.get(userRoom.get(id));
function state(id) {
 const u = queryUser(id), room = roomFor(id);
 const people = [...streams.keys()].filter(online).map(p => { const user=queryUser(p), active=roomFor(p); return { id:user.id, name:user.name, busy:!!active,
  game:active?{id:active.gameId,name:games.find(g=>g.id===active.gameId)?.name||'游戏',phase:active.phase,startedAt:active.startedAt}:null }; });
 const past = db.prepare('SELECT r.* FROM results r JOIN result_players p ON p.result=r.id WHERE p.user=? ORDER BY r.created DESC LIMIT 8').all(id);
 return { me: publicUser(u), games, players: people, room: room ? room.view(id, p => queryUser(p)?.name || '玩家', online) : null,
  invites: [...invitations.values()].filter(i => i.to === id && i.expires > Date.now()).map(i => {const target=rooms.get(i.code);return {...i,name:queryUser(i.from)?.name,gameName:games.find(g=>g.id===target?.gameId)?.name||'游戏',seconds:target?.seconds,disableHistory:!!target?.disableHistory};}),
  stats: { played: db.prepare('SELECT COUNT(*) AS n FROM result_players WHERE user=?').get(id).n,
   wins: db.prepare('SELECT COUNT(*) AS n FROM results WHERE winner=?').get(id).n },
  recent: past.map(r => ({ winner: r.winner, reason: r.reason, turns: r.turns, created: r.created })) , serverNow: Date.now() };
}
function broadcast() {
 persistRooms();
 for (const [id, clients] of streams) if (clients.size) {
  const message = `event: state\ndata: ${JSON.stringify(state(id))}\n\n`;
  for (const res of clients) res.write(message);
 }
}
function notice(id,message){for(const res of streams.get(id)||[])res.write(`event: notice\ndata: ${JSON.stringify({message})}\n\n`);}
function clearInvites(room,id){for(const [key,invitation] of invitations)if(invitation.code===room.code||invitation.to===id)invitations.delete(key);}
function completed(room) {
 if (room.phase !== 'finished' || room.completed) return;
 room.completed = true;
 if (room.history.length || room.reason === 'guessed') {
  const result=token();db.exec('BEGIN');
  try{db.prepare('INSERT INTO results VALUES(?,?,?,?,?,?,?)').run(result,room.code,JSON.stringify(room.players),room.winner,room.reason,room.history.length,Date.now());
   for(const player of room.players)db.prepare('INSERT INTO result_players VALUES(?,?)').run(player,result);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}
function leave(id) {
 const room = roomFor(id); if (!room) return;
 if (room.phase !== 'finished' && room.players.length === 2) { room.finish(room.players.find(p => p !== id), 'left'); completed(room); }
 userRoom.delete(id);
 if (room.phase === 'waiting' || room.players.length === 1) {
  for (const p of room.players) userRoom.delete(p); rooms.delete(room.code);
 } else if (room.players.every(p => userRoom.get(p) !== room.code)) rooms.delete(room.code);
 for (const [key, invite] of invitations) if (invite.code === room.code) invitations.delete(key);
}
function authenticate(req) {
 const value = /(?:^|;\s*)pair_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
 return value ? db.prepare('SELECT user,token FROM sessions WHERE token=? AND expires>?').get(value,Date.now()) : null;
}
function limited(req, group, limit, period=600000) {
 const key = `${group}:${req.socket.remoteAddress}:${req.headers['x-real-ip'] || ''}`;
 const record = rates.get(key) || { n:0, until:Date.now()+period };
 if (record.until < Date.now()) { record.n=0; record.until=Date.now()+period; }
 record.n++; rates.set(key,record); if (record.n > limit) throw new GameError('操作太频繁了，请稍后再试');
}
async function body(req) {
 if (!req.headers['content-type']?.startsWith('application/json')) throw new GameError('请求格式不正确');
 let text=''; for await (const chunk of req) { text+=chunk; if (text.length>8192) throw new GameError('请求内容过大'); }
 try { return JSON.parse(text || '{}'); } catch { throw new GameError('请求格式不正确'); }
}
const files = { '/':['index.html','text/html; charset=utf-8'], '/app.js':['app.js','text/javascript; charset=utf-8'], '/theme.js':['theme.js','text/javascript; charset=utf-8'], '/styles.css':['styles.css','text/css; charset=utf-8'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
const headers = { 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin', 'X-Frame-Options':'DENY',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" };
const send = (res,status,value,extra={}) => { res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req,res) => {
 try {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/healthz') return send(res,200,{ok:true});
  if (url.pathname === '/api/catalog' && req.method === 'GET') return send(res,200,{ games, online: [...streams.keys()].filter(online).length });
  if (req.method === 'GET' && files[url.pathname]) {
   const [name,type]=files[url.pathname];res.writeHead(200,{...headers,'Content-Type':type,'Cache-Control':'no-cache'});return res.end(await readFile(`${root}public/${name}`));
  }
  if (req.method === 'POST') {
   const allowed = process.env.PUBLIC_ORIGIN;
   const expected = allowed || `http://${req.headers.host}`;
   if (req.headers.origin && req.headers.origin !== expected) return send(res,403,{error:'请求来源不匹配'});
  }
  if (['/api/register','/api/login'].includes(url.pathname) && req.method === 'POST') {
   limited(req,'auth',30); const b=await body(req);
   if (typeof b.account!=='string' || !/^[a-zA-Z0-9_]{3,24}$/.test(b.account)) throw new GameError('账号用 3–24 位字母、数字或下划线');
   if (typeof b.password!=='string' || b.password.length<8 || b.password.length>128) throw new GameError('密码需要 8–128 个字符');
   const account=b.account.toLowerCase();let u=db.prepare('SELECT * FROM users WHERE account=?').get(account);
   if (url.pathname==='/api/register') {
    limited(req,'register',10,3600000);
    if (u) throw new GameError('这个账号已经有人使用了');
    if (typeof b.name!=='string' || b.name.trim().length<1 || b.name.trim().length>16) throw new GameError('昵称需要 1–16 个字符');
    const salt=token(),hash=(await scrypt(b.password,salt,64)).toString('hex');
    u={id:token(),account,name:b.name.trim(),salt,hash};
    try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(u.id,account,u.name,salt,hash,Date.now());}catch{throw new GameError('这个账号已经有人使用了');}
   } else {
    const derived=await scrypt(b.password,u?.salt || 'missing-user',64);
    if (!u || !timingSafeEqual(derived,Buffer.from(u.hash,'hex'))) throw new GameError('账号或密码不正确');
   }
   const key=token();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(key,u.id,Date.now()+30*86400000);
   const secure=process.env.PUBLIC_ORIGIN?.startsWith('https:') ? '; Secure' : '';
   return send(res,200,{me:publicUser(u)},{'Set-Cookie':`pair_session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}`});
  }
  const auth=authenticate(req);
  if (!auth) return send(res,401,{error:'请先登录'});
  const id=auth.user;
  if (req.method==='GET' && url.pathname==='/api/state') return send(res,200,state(id));
  if (req.method==='GET' && url.pathname==='/api/events') {
   res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
   if (!streams.has(id)) streams.set(id,new Set());
   if (streams.get(id).size>=5) {res.end();return;}
   streams.get(id).add(res); roomFor(id)?.reconnect(id);broadcast();
   req.on('close',()=>{streams.get(id)?.delete(res);if(!online(id)){streams.delete(id);roomFor(id)?.disconnect(id);}broadcast();});return;
  }
  if (req.method!=='POST') return send(res,404,{error:'没有这个页面'});
  limited(req,'action',120,60000);const b=await body(req);let room=roomFor(id),feedback;
  switch(url.pathname) {
   case '/api/logout':
    leave(id);db.prepare('DELETE FROM sessions WHERE token=?').run(auth.token);
    for(const stream of streams.get(id)||[]){stream.write('event: logout\ndata: {}\n\n');stream.end();}streams.delete(id);
    broadcast();return send(res,200,{ok:true},{'Set-Cookie':'pair_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   case '/api/room/create': {
    if(room)throw new GameError('先离开当前房间再创建');
    if(b.gameId && !games.some(g=>g.id===b.gameId))throw new GameError('这个游戏还不能创建房间');
    if(b.disableHistory!==undefined&&typeof b.disableHistory!=='boolean')throw new GameError('请选择有效的历史记录设置');
    let code;do{code=String(randomInt(100000,1000000));}while(rooms.has(code));
    room=new Duel(code,id,b.seconds??30);room.disableHistory=b.disableHistory??false;rooms.set(code,room);userRoom.set(id,code);break;
   }
   case '/api/room/join': {
    if(room)throw new GameError('你已经在房间里了');
    room=rooms.get(String(b.code));if(!room)throw new GameError('房间不存在或已结束');
    room.join(id);userRoom.set(id,room.code);clearInvites(room,id);break;
   }
   case '/api/invite': {
    if(!room || room.phase!=='waiting' || room.players.length!==1)throw new GameError('请先创建一个等待中的房间');
    if(b.to===id || !online(b.to) || roomFor(b.to))throw new GameError('对方暂时无法接受邀请');
    if([...invitations.values()].some(i=>i.from===id&&i.to===b.to&&i.expires>Date.now()))throw new GameError('邀请已经发出，等对方回应吧');
    const key=token();invitations.set(key,{id:key,from:id,to:b.to,code:room.code,expires:Date.now()+15000});break;
   }
   case '/api/invite/respond': {
    const invite=invitations.get(b.id);if(!invite||invite.to!==id||invite.expires<=Date.now())throw new GameError('邀请已过期');
    if(b.accept){if(room)throw new GameError('你已经在房间里了');room=rooms.get(invite.code);if(!room)throw new GameError('房间已结束');room.join(id);userRoom.set(id,room.code);clearInvites(room,id);notice(invite.from,`${queryUser(id).name} 接受了邀请，准备开局吧`);}
    else notice(invite.from,`${queryUser(id).name} 拒绝了邀请`);
    invitations.delete(b.id);break;
   }
   case '/api/room/leave': leave(id);break;
   case '/api/room/settings': if(!room)throw new GameError('请先进入房间');room.configure(id,b.seconds,b.disableHistory);break;
   case '/api/room/ready': if(!room)throw new GameError('请先进入房间');room.prepare(id,b.ready);break;
   case '/api/room/secret': if(!room)throw new GameError('请先进入房间');room.secret(id,b.value);break;
   case '/api/room/dice': if(!room)throw new GameError('请先进入房间');room.throwDice(id);break;
   case '/api/room/guess': if(!room)throw new GameError('请先进入房间');feedback={hits:room.guess(id,b.value),value:b.value};break;
   case '/api/room/rematch':
    if(!room || room.phase!=='finished' || room.players.some(p=>userRoom.get(p)!==room.code))throw new GameError('对方已离开，请重新邀请');
    room.reset();for(const p of room.players)if(!online(p))room.disconnect(p);break;
   default:return send(res,404,{error:'没有这个操作'});
  }
  if(room)completed(room);broadcast();return send(res,200,{...state(id),...(feedback?{feedback}:{})});
 } catch(error) {
  if(!(error instanceof GameError)) console.error(error);
  if(!res.headersSent)send(res,error instanceof GameError?400:500,{error:error instanceof GameError?error.message:'暂时出了点问题，请重试'});
  broadcast();
 }
});
setInterval(()=>{
 let changed=false;
 for(const room of rooms.values()){if(room.tick()){completed(room);changed=true;}if(!room.players.some(p=>userRoom.get(p)===room.code)){rooms.delete(room.code);}}
 for(const [key,i] of invitations)if(i.expires<=Date.now()){invitations.delete(key);notice(i.from,`${queryUser(i.to)?.name||'对方'} 15 秒内未回应，邀请已自动拒绝`);changed=true;}
 for(const [key,r] of rates)if(r.until<Date.now())rates.delete(key);
 if(changed)broadcast();
 for(const clients of streams.values())for(const res of clients)res.write(': heartbeat\n\n');
},1000).unref();
setInterval(()=>db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()),3600000).unref();
server.listen(Number(process.env.PORT || 3210),process.env.HOST || '127.0.0.1',()=>console.log(`Pair Play listening on ${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3210}`));
process.on('SIGTERM',()=>{persistRooms();for(const clients of streams.values())for(const res of clients)res.end();server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();});
