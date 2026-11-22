function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeSaved(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch { return false; }
}
const profileKey = 'aqua26-profile';
const recordKey = 'aqua26-local-record';
const profile = readSaved(profileKey, { name:'Player 1' });
if (!profile.identity) {
  profile.identity = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte=>byte.toString(16).padStart(2,'0')).join('');
  writeSaved(profileKey,profile);
}
const element = id => document.getElementById(id);
let onlineRoom = null;
let connectionPending = false;
let shootoutSession = null;
let shotAnimation = null;
let shotPending = false;

function localRecord() {
  return readSaved(recordKey,{played:0,won:0,lost:0,tied:0,goals:0,shots:0});
}
function recordLocal(game) {
  const row=localRecord();
  row.played++;
  row.goals+=game.scores[0];
  row.shots+=Shootout.ATTEMPTS_PER_PLAYER;
  if(game.winner===null) row.tied++;
  else if(game.winner===0) row.won++;
  else row.lost++;
  writeSaved(recordKey,row);
}

async function api(path, data, key, method = data===undefined ? "GET" : "POST") {
  const headers = key ? {Authorization:'Bearer '+key} : {};
  if(data!==undefined) headers['Content-Type']='application/json';
  let response;
  try {
    response=await fetch(path,{method,headers,
      body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(5000)});
  } catch { throw new Error('Game server unreachable.'); }
  if(!(response.headers.get('content-type')||'').includes('application/json')) throw new Error('Open the Water Polo server preview for online play.');
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'),{status:response.status});
  return result;
}

function leaveShootout() {
  if(onlineRoom) clearTimeout(onlineRoom.timer);
  onlineRoom=null;
  shootoutSession=null;
  shotAnimation=null;
  shotPending=false;
}
async function connectOnline(mode) {
  if(connectionPending) return;
  const status=element('online-status');
  const code=element('online-code').value.trim().toUpperCase();
  if(mode==='join'&&!/^[A-F0-9]{6}$/.test(code)) { status.textContent='Enter a six-character room code.'; return; }
  leaveShootout();
  connectionPending=true;
  status.textContent='Connecting…';
  try {
    const data=await api(mode==='host'?'/api/rooms':'/api/rooms/'+code+'/join',{name:profile.name,identity:profile.identity});
    if(activeScreen!=='view-online') return;
    const room={code:data.code,key:data.key,seat:data.seat};
    onlineRoom=room;
    syncRoom(room,data);
    pollRoom(room);
  } catch(error) {
    if(activeScreen==='view-online') status.textContent=error.message;
  } finally { connectionPending=false; }
}
function syncRoom(room,data) {
  if(room!==onlineRoom) return;
  if(!data.game) {
    element('online-status').textContent='Room '+room.code+' · Waiting for an opponent. Share this code.';
    element('online-code').value=room.code;
  } else if(!shootoutSession) beginShootout(data.game,room.seat);
  else updateShootout(data.game);
}
function pollRoom(room) {
  room.timer=setTimeout(async()=>{
    if(room!==onlineRoom) return;
    try {
      syncRoom(room,await api('/api/rooms/'+room.code,undefined,room.key));
    } catch(error) {
      if(room!==onlineRoom) return;
      element(shootoutSession?'shootout-result':'online-status').textContent=error.message;
      if(error.status===403||error.status===404) return;
    }
    if(room===onlineRoom&&!shootoutSession?.game.complete) pollRoom(room);
  },700);
}
function startLocalShootout() {
  if(!window.Shootout) return;
  const name=element('local-player-two').value.trim() || 'Player 2';
  beginShootout(Shootout.start([profile.name,name]),null);
}
function beginShootout(game,seat) {
  shootoutSession={game,seat};
  shotAnimation=null;
  shotPending=false;
  element('shootout-aim').value='0';
  navigateTo('view-match');
  renderShootout();
}
function updateShootout(game) {
  if(!shootoutSession||game.turn<=shootoutSession.game.turn) return;
  shootoutSession.game=game;
  shotAnimation={shot:game.lastShot,start:performance.now()};
  playAudio('splash');
  if(game.complete&&shootoutSession.seat===null) recordLocal(game);
  renderShootout();
}
function renderShootout() {
  if(!shootoutSession) return;
  const {game,seat}=shootoutSession;
  const acting=game.turn%2;
  const blocked=shotPending || Boolean(shotAnimation) || (seat!==null && seat!==acting);
  const remaining=Shootout.ATTEMPTS_PER_PLAYER-Math.floor(game.turn/2);
  element('shootout-score').textContent=game.players[0]+' '+game.scores[0]+' – '+game.scores[1]+' '+game.players[1];
  element('shootout-turn').textContent=game.complete?
    (game.winner===null?'Shootout tied':game.players[game.winner]+' wins'):
    game.players[acting]+' to shoot · '+remaining+' left';
  const result=game.lastShot?'Last shot: '+{goal:'Goal',saved:'Saved',miss:'Wide'}[game.lastShot.result]+'. ':'';
  element('shootout-result').textContent=result+(!game.complete&&!shotAnimation?
    'Keeper starts '+['left','center','right'][Shootout.keeperLane(game)+1]+'.':'');
  element('shootout-actions').hidden=game.complete;
  document.querySelectorAll('#shootout-actions button,#shootout-actions select').forEach(control=>{control.disabled=blocked;});
}
async function takeShootoutShot(shot) {
  const session=shootoutSession;
  if(!session||session.game.complete||shotPending||shotAnimation) return;
  const aim=Number(element('shootout-aim').value);
  const {game,seat}=session;
  if(seat===null) {
    const next=Shootout.shoot(game,game.turn%2,shot,aim);
    if(next) updateShootout(next);
    return;
  }
  const room=onlineRoom;
  if(!room||seat!==game.turn%2) return;
  shotPending=true;
  renderShootout();
  try {
    const data=await api('/api/rooms/'+room.code+'/shot',{shot,aim,turn:game.turn},room.key);
    if(room===onlineRoom) syncRoom(room,data);
  } catch(error) {
    if(session===shootoutSession) element('shootout-result').textContent=error.message;
  } finally {
    if(session===shootoutSession) {
      shotPending=false;
      document.querySelectorAll('#shootout-actions button,#shootout-actions select').forEach(control=>{
        control.disabled=Boolean(shotAnimation)||seat!==session.game.turn%2;
      });
    }
  }
}
function drawShootout(time) {
  const game=shootoutSession.game;
  const shot=shotAnimation?.shot;
  const seat=shot?.seat ?? (game.complete?game.lastShot.seat:game.turn%2);
  const shooter=seat===0?pUserMatch:pItaHoleD;
  const keeper=seat===0?pItaGK:pHunGK;
  const t=shotAnimation?Math.min(1,(performance.now()-shotAnimation.start)/780):0;
  matchPlayers.forEach(p=>{p.mesh.visible=p===shooter||p===keeper;});
  shooter.mesh.position.set(0,swimHeight-1.31*(shooter.mesh.scale.y-1)+Math.sin(time*4)*.035,-8.25);
  shooter.mesh.rotation.y=Math.PI;
  shooter.rig.rightArm.rotation.set(.13+t*1.0,0,2.26-t*1.1);
  shooter.rig.rightArm.fore.rotation.set(-.14,0,.22);
  shooter.rig.leftArm.rotation.set(.18,0,-1);
  const guard=shot?shot.dive:Shootout.keeperLane(game);
  keeper.mesh.position.set(guard*1.03*(shot?Math.min(1,t*2.3):1),swimHeight+Math.sin(time*5)*.035,-14.05);
  keeper.mesh.rotation.y=0;
  keeper.rig.rightArm.rotation.z=1.73;
  keeper.rig.leftArm.rotation.z=-1.73;
  if(shot) {
    const x=shot.result==='miss'?(shot.aim<0?-1:1)*1.82:shot.aim*1.13;
    const z=shot.result==='saved'?-14.02:-14.85;
    const arc=shot.shot==='lob'?1.08:shot.shot==='power'?.19:.03;
    const height=shot.shot==='skip'&&t<.45 ? Math.max(.14,.54-t*1.2) : .54+Math.sin(Math.PI*t)*arc;
    ballMesh.position.set(THREE.MathUtils.lerp(-.43,x,t),WATER_SURFACE_Y+height,THREE.MathUtils.lerp(-8.45,z,t));
    if(t>=1) {
      if(shot.result==='goal') playAudio('goal_horn');
      shotAnimation=null;
      renderShootout();
    }
  } else if(!game.complete) {
    shooter.mesh.updateMatrixWorld(true);
    shooter.rig.rightArm.fore.localToWorld(handBallOffset.set(.015,-.304,.053));
    ballMesh.position.copy(handBallOffset);
  }
}
