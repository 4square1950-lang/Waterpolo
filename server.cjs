const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const rules = require('./shootout.js');

const PORT = Number(process.env.PORT || 4196);
const HOST = process.env.HOST || '127.0.0.1';
const RECORDS = process.env.AQUA_RECORDS || path.join(__dirname, 'standings.json');
const TTL = 2 * 60 * 60 * 1000;
const rooms = new Map();
const TEAM_NAMES=['Hungary','Italy'];
const SOCIAL=process.env.AQUA_SOCIAL || RECORDS.replace(/.json$/,'')+'.social.json';
const data=fs.existsSync(RECORDS)?JSON.parse(fs.readFileSync(RECORDS,'utf8')):{};
let standings=new Map((Array.isArray(data)?data:data.players||[]).map(row=>[row.id,row]));
let teams=new Map((data.teams||[]).map(row=>[row.name,row]));
const directory=fs.existsSync(SOCIAL)?JSON.parse(fs.readFileSync(SOCIAL,'utf8')):{profiles:{},messages:[]};
function save(file,value) {
  fs.writeFileSync(file+'.tmp',JSON.stringify(value));
  fs.renameSync(file+'.tmp',file);
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function fail(status, message) {
  return Object.assign(new Error(message), {status});
}
async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk.toString();
    if (Buffer.byteLength(data) > 4096) throw fail(413, 'Request is too large.');
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw fail(400, 'Invalid request.'); }
}
function player(body) {
  if (typeof body?.identity !== 'string' || !/^[a-f0-9]{32}$/.test(body.identity)) throw fail(400, 'Open Profile and reload to get a player ID.');
  const name = String(body.name || '').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64);
  if (!name) throw fail(400, 'Enter a display name.');
  return { name, id: createHash('sha256').update(body.identity).digest('hex'), key: randomBytes(24).toString('hex') };
}
function view(room, seat) {
  return { code: room.code, seat, names: room.seats.map(p => p.name), game: room.game };
}
function updateRecord(previous,name,game,seat) {
  const row={played:0,won:0,lost:0,tied:0,shots:0,goals:0,against:0,points:0,
    tracked:0,saves:0,shotsFaced:0,onTarget:0,shotTypes:{},...previous,name};
  row.shotTypes={...row.shotTypes};
  row.played++;
  row.shots+=rules.ATTEMPTS_PER_PLAYER;
  row.goals+=game.scores[seat];
  row.against+=game.scores[1-seat];
  for(const attempt of game.attempts) {
    if(attempt.seat!==seat) {
      if(attempt.result==='saved') row.saves++;
      if(attempt.result!=='miss') row.shotsFaced++;
      continue;
    }
    row.tracked++;
    if(attempt.result!=='miss') row.onTarget++;
    const type={shots:0,goals:0,...row.shotTypes[attempt.shot]};
    type.shots++;
    if(attempt.result==='goal') type.goals++;
    row.shotTypes[attempt.shot]=type;
  }
  if(game.winner===null) {row.tied++;row.points++;}
  else if(game.winner===seat) {row.won++;row.points+=3;}
  else row.lost++;
  return row;
}
function record(room,game) {
  const updated=new Map(standings), nextTeams=new Map(teams);
  room.seats.forEach(({id,name},seat)=>{
    updated.set(id,{...updateRecord(updated.get(id),name,game,seat),id});
    const team=TEAM_NAMES[seat];
    nextTeams.set(team,updateRecord(nextTeams.get(team),team,game,seat));
  });
  save(RECORDS,{players:[...updated.values()],teams:[...nextTeams.values()]});
  standings=updated;
  teams=nextTeams;
}
function rank(rows) {
  return [...rows].sort((a,b)=>(b.points||0)-(a.points||0) ||
    ((b.goals||0)-(b.against||0))-((a.goals||0)-(a.against||0)) || (b.goals||0)-(a.goals||0) || a.name.localeCompare(b.name));
}
function account(req) {
  const key=(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{32}$/.test(key)) throw fail(403,'Profile identity unavailable.');
  return createHash('sha256').update(key).digest('hex');
}
function publicProfile(id,person,viewer) {
  const record=id===viewer?standings.get(id):null;
  return {id,name:person.name,username:person.username,bio:person.bio,mascot:person.mascot,
    record:record?{played:record.played,won:record.won,lost:record.lost,tied:record.tied,goals:record.goals,shots:record.shots,saves:record.tracked?record.saves:null}:null,
    followers:Object.values(directory.profiles).filter(other=>other.following.includes(id)).length,
    followingCount:person.following.length,
    friends:person.following.filter(other=>directory.profiles[other]?.following.includes(id)).length,
    following:Boolean(directory.profiles[viewer]?.following.includes(id)),followsYou:person.following.includes(viewer)};
}
async function socialRoute(req,res,route) {
  const id=account(req), self=directory.profiles[id];
  if(route==='profile'&&req.method==='GET') return json(res,200,self?publicProfile(id,self,id):null);
  if(route==='profile'&&req.method==='PUT') {
    const body=await readBody(req);
    const name=typeof body?.name==='string'?body.name.trim().slice(0,64):'';
    const username=typeof body?.username==='string'?body.username.trim().slice(0,64):'';
    const bio=typeof body?.bio==='string'?body.bio.trim().slice(0,1000):'';
    if(!name) throw fail(400,'Enter a display name.');
    if(username&&!/^[\p{L}\p{N}_.-]+$/u.test(username)) throw fail(400,'Use letters, numbers, dots, hyphens or underscores in the username.');
    if(username&&Object.entries(directory.profiles).some(([other,p])=>other!==id&&p.username.toLowerCase()===username.toLowerCase())) throw fail(409,'Username already taken.');
    if(self?.username&&self.username!==username&&Date.now()-(self.renamed||0)<604800000) throw fail(409,'Username changes are available once a week.');
    const mascot=Number.isInteger(body.mascot)&&body.mascot>=0&&body.mascot<32?body.mascot:null;
    directory.profiles[id]={name,username,bio,mascot,following:self?.following||[],renamed:self?.username===username?self.renamed:Date.now()};
    save(SOCIAL,directory);
    return json(res,200,publicProfile(id,directory.profiles[id],id));
  }
  if(!self) throw fail(409,'Save your profile before connecting with other players.');
  if(route==='people'&&req.method==='POST') {
    const {view,query}=await readBody(req)||{};
    const search=String(query||'').toLowerCase().slice(0,64);
    const found=Object.entries(directory.profiles).filter(([key,other])=>{
      if(key===id)return false;
      if(view==='friends')return self.following.includes(key)&&other.following.includes(id);
      if(view==='followers')return other.following.includes(id);
      if(view==='following')return self.following.includes(key);
      return (other.name+' '+other.username).toLowerCase().includes(search);
    });
    return json(res,200,found.slice(0,100).map(([key,person])=>publicProfile(key,person,id)));
  }
  if(route==='follow'&&req.method==='POST'){
    const {target,follow}=await readBody(req)||{};
    if(target===id||typeof target!=='string'||!Object.hasOwn(directory.profiles,target)) throw fail(404,'Player unavailable.');
    self.following=self.following.filter(other=>other!==target);
    if(follow===true)self.following.push(target);
    save(SOCIAL,directory);
    return json(res,200,publicProfile(target,directory.profiles[target],id));
  }
  if(route==='messages'&&req.method==='GET') {
    return json(res,200,{id,messages:directory.messages.filter(msg=>msg.from===id||msg.to===id)});
  }
  if(route==='messages'&&req.method==='POST') {
    const {target,text}=await readBody(req)||{};
    const content=typeof text==='string'?text.trim().slice(0,500):'';
    if(typeof target!=='string'||!Object.hasOwn(directory.profiles,target)||!content) throw fail(400,'Choose a player and enter a message.');
    if(target!==id&&!(self.following.includes(target)&&directory.profiles[target].following.includes(id))){
      const thread=directory.messages.filter(msg=>(msg.from===id&&msg.to===target)||(msg.from===target&&msg.to===id));
      const lastReply=thread.findLastIndex(msg=>msg.from===target);
      if(thread.length-lastReply-1>=2)throw fail(429,'Wait for a reply before sending another message.');
    }
    const msg={from:id,to:target,fromName:self.name,toName:directory.profiles[target].name,text:content,at:Date.now()};
    directory.messages.push(msg);
    save(SOCIAL,directory);
    return json(res,201,msg);
  }
  throw fail(404,'Page unavailable.');
}
const files = new Map([
  ['/', ['index.html','text/html']], ['/index.html',['index.html','text/html']],
  ['/shootout.js',['shootout.js','text/javascript']],
  ['/play.js',['play.js','text/javascript']], ['/career.js',['career.js','text/javascript']],
  ['/career.css',['career.css','text/css']], ['/world-land.json',['world-land.json','application/json']],
  ...['/league','/profile','/campaign'].map(route=>[route,['index.html','text/html']]),
]);
const server = http.createServer(async (req,res) => {
  try {
    const route = new URL(req.url,'http://localhost').pathname;
    if (req.method === 'GET' && files.has(route)) {
      const [file,type] = files.get(route);
      const content = fs.readFileSync(path.join(__dirname,file));
      res.writeHead(200,{ 'Content-Type': type+'; charset=utf-8','Cache-Control':'no-cache' });
      return res.end(content);
    }
    if (req.method==='GET' && route==='/api/league') {
      return json(res,200,{players:rank(standings.values()).map(({id,...row})=>row),teams:rank(TEAM_NAMES.map(name=>teams.get(name)||{name,played:0}))});
    }
    const social=/^\/api\/(profile|people|follow|messages)$/.exec(route);
    if(social)return await socialRoute(req,res,social[1]);
    if (req.method === 'GET' && route === '/api/standings') {
      const rows = [...standings.values()].sort((a,b) =>
        b.points-a.points || ((b.goals-b.against)-(a.goals-a.against)) || b.goals-a.goals || a.name.localeCompare(b.name));
      return json(res,200, rows.map(({id,...row})=>row));
    }
    if (route === '/api/rooms' && req.method === 'POST') {
      const now = Date.now();
      for (const [code,room] of rooms) if (now-room.touched>TTL) rooms.delete(code);
      if(rooms.size>=512) throw fail(503,'The room list is full. Try again later.');
      const host = player(await readBody(req));
      let code;
      do { code = randomBytes(3).toString('hex').toUpperCase(); } while(rooms.has(code));
      const room = { code, seats:[host], touched:now, game:null };
      rooms.set(code,room);
      return json(res,201,{...view(room,0),key:host.key});
    }
    const match = /^\/api\/rooms\/([A-Fa-f0-9]{6})(\/join|\/shot)?$/.exec(route);
    if (!match) throw fail(404,'Page unavailable.');
    const room = rooms.get(match[1].toUpperCase());
    if (!room || Date.now()-room.touched>TTL) throw fail(404,'Room expired or does not exist.');
    if (match[2] === '/join' && req.method === 'POST') {
      const guest = player(await readBody(req));
      if (room.seats.some(p=>p.id===guest.id)) throw fail(409,'Open a different browser profile to join as a second player.');
      if (room.seats.length>=2) throw fail(409,'This room is full.');
      room.seats.push(guest);
      room.game = rules.start(room.seats.map(p=>p.name));
      room.touched=Date.now();
      return json(res,200,{...view(room,1),key:guest.key});
    }
    const seat = room.seats.findIndex(p=>'Bearer '+p.key===req.headers.authorization);
    if (seat<0) throw fail(403,'Join this room before playing.');
    if (!match[2] && req.method==='GET') return json(res,200,view(room,seat));
    if (match[2]==='/shot' && req.method==='POST') {
      const body = await readBody(req);
      if (!room.game || body?.turn!==room.game.turn) throw fail(409,'The turn has changed. Try again.');
      const next = rules.shoot(room.game,seat,body.shot,body.aim);
      if (!next) throw fail(409,'This shot is unavailable.');
      if (next.complete) record(room,next);
      room.game=next;
      room.touched=Date.now();
      return json(res,200,view(room,seat));
    }
    throw fail(404,'Page unavailable.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) json(res,error.status || 500,{error:error.status ? error.message : 'The game server could not complete the request.'});
  }
});
server.listen(PORT,HOST,()=>console.log('Aqua 26 running at http://'+HOST+':'+PORT));
