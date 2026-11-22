
const stops = [
  ['Stanford',37.431197,-122.160635,'grid'],['Budapest',47.52139,19.04278,'island'],['Recco',44.36053,9.13936,'coast'],
  ['Kotor',42.43,18.77,'bay'],['Dubrovnik',42.66,18.07,'coast'],['Belgrade',44.81,20.47,'grid'],
  ['Barcelona',41.38,2.19,'coast'],['Piraeus',37.94,23.65,'bay'],['Los Angeles',34.075008,-118.450786,'grid'],
  ['Marseille',43.28,5.35,'coast']
];
const progressKey='aqua26-career';
const career=readSaved(progressKey,{current:1,visits:[],coins:0});
const careerRoutes={'view-board':'/league','view-profile':'/profile','view-world-tour':'/campaign'};
let historyDriven=false;
function reflectGamePage(screen) {
  const path=careerRoutes[screen]||'/';
  if(!historyDriven&&location.pathname!==path) history.pushState(null,'',path);
  document.title=({'view-board':'Stats & Standings','view-profile':'Profile','view-world-tour':'World Tour'}[screen]||'Water Polo')+' · AQUA 26';
}
function navigateAddress() {
  historyDriven=true;
  const screen=Object.keys(careerRoutes).find(key=>careerRoutes[key]===location.pathname);
  if(screen==='view-world-tour') openWorldTour();
  else navigateTo(screen||'view-home',true);
  historyDriven=false;
}
window.addEventListener('popstate',navigateAddress);

let selectedStop=0, mapView='venue', mapOrigin='view-home', keepCampusPosition=false, travel=null, mapReturnPose=null;
let atlas=null, atlasPromise=null;
function openWorldTour() {
  if(activeScreen==='view-world-tour'||activeScreen==='view-travel')return;
  mapOrigin=activeScreen==='view-rpg-campaign'?'view-rpg-campaign':'view-home';
  mapReturnPose=mapOrigin==='view-rpg-campaign'?{position:athleteRoot.position.clone(),heading:athleteRoot.rotation.y}:null;
  selectedStop=Math.max(0,TOWNS_DATABASE.findIndex(town=>town.id===career.current));
  navigateTo('view-world-tour');
  setMapView('venue');
}
function closeWorldTour() {
  keepCampusPosition=mapOrigin==='view-rpg-campaign';
  navigateTo(mapOrigin);
  keepCampusPosition=false;
  if(mapReturnPose && mapOrigin==='view-rpg-campaign'){
    athleteRoot.position.copy(mapReturnPose.position);
    athleteRoot.rotation.y=mapReturnPose.heading;
    followCampusCamera(true);
    renderMinimap();
  }
  mapReturnPose=null;
}
function changeDestination(offset) {
  selectDestination((selectedStop+offset+stops.length)%stops.length);
}
function selectDestination(index) {
  selectedStop=index;
  selectedAngle=0;
  renderWorldTour();
  pointGlobe();
}
function setMapView(next) {
  mapView=next;
  renderWorldTour();
  if(next==='globe') initializeAtlas();
}
function renderWorldTour() {
  const town=TOWNS_DATABASE[selectedStop], now=town.id===career.current;
  element('map-stage').dataset.map=mapView;
  element('tour-map-city').textContent=stops[selectedStop][0];
  element('tour-location').textContent=town.nation;
  element('tour-venue').textContent=town.name;
  element('tour-status').textContent=now?'Current stop':career.visits.includes(town.id)?'Visited':'Available';
  element('tour-travel').textContent=now?(mapOrigin==='view-rpg-campaign'?'Resume campus':'Enter venue'):'Travel';
  element('tour-city').setAttribute('aria-pressed',String(mapView==='venue'));
  element('tour-globe').setAttribute('aria-pressed',String(mapView==='globe'));
  const card=element('tour-card-art');
  const chapter=document.createElement('span'), number=document.createElement('strong');
  chapter.textContent='World Tour';number.textContent='Stop '+town.id+' / '+stops.length;
  card.replaceChildren(number,chapter);
  element('tour-views').setAttribute('aria-pressed',String(mapView==='views'));
  element('map-credit').textContent=mapView==='globe'?'Land outlines · Natural Earth':'';
  element('satellite-credit').hidden=mapView!=='venue';
  element('satellite-controls').hidden=mapView!=='venue';
  element('satellite-status').hidden=mapView!=='venue';
  element('venue-angles').hidden=mapView!=='views';
  element('tour-art').replaceChildren();
  if(mapView==='venue')openSatellite();
  else if(mapView==='views')openVenueView();
  else if(atlas)element('tour-art').append(atlas.renderer.domElement);
  const nav=element('map-stops');
  if(!nav.children.length) stops.forEach(([name],index)=>{
    const stop=uiButton(String(index+1),()=>selectDestination(index));
    stop.setAttribute('aria-label',name);
    stop.title=name;
    nav.append(stop);
  });
  [...nav.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selectedStop)));
}
function globePoint(lat,lon,radius) {
  const phi=THREE.MathUtils.degToRad(lon+180), y=THREE.MathUtils.degToRad(lat);
  return new THREE.Vector3(-Math.cos(phi)*Math.cos(y),Math.sin(y),Math.sin(phi)*Math.cos(y)).multiplyScalar(radius);
}
async function initializeAtlas() {
  if(atlas) {pointGlobe();return;}
  if(atlasPromise)return atlasPromise;
  atlasPromise=(async()=>{
    const response=await fetch('/world-land.json');
    if(!response.ok)throw Error('Map unavailable');
    const outlines=await response.json();
    const textureCanvas=document.createElement('canvas');
    textureCanvas.width=1800;textureCanvas.height=900;
    const ctx=textureCanvas.getContext('2d');
    ctx.fillStyle='#213d51';ctx.fillRect(0,0,1800,900);ctx.scale(2,2);ctx.translate(0,12.5);
    ctx.fillStyle='#779581';ctx.strokeStyle='#adc3a4';ctx.lineWidth=.52;
    for(const shape of outlines){const coast=new Path2D(shape);ctx.fill(coast);ctx.stroke(coast);}
    ctx.strokeStyle='#afc8b43b';
    for(let x=0;x<900;x+=75){ctx.beginPath();ctx.moveTo(x,-12.5);ctx.lineTo(x,437.5);ctx.stroke();}
    for(let y=0;y<450;y+=75){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke();}
    const map=new THREE.CanvasTexture(textureCanvas);map.encoding=THREE.sRGBEncoding;
    const miniScene=new THREE.Scene();
    const miniCamera=new THREE.PerspectiveCamera(37,1,.1,40);
    const view=new THREE.WebGLRenderer({alpha:true,antialias:true});
    view.outputEncoding=THREE.sRGBEncoding;
    view.setPixelRatio(Math.min(1.5,window.devicePixelRatio));
    miniScene.add(new THREE.HemisphereLight(0xf5faff,0x839390,1.25));
    const light=new THREE.DirectionalLight(0xffe6c1,1.18);
    miniScene.add(light,new THREE.Mesh(new THREE.SphereGeometry(2,64,48),new THREE.MeshStandardMaterial({map,roughness:.9})));
    const markers=stops.map(([,lat,lon])=>{
      const dot=new THREE.Mesh(new THREE.SphereGeometry(.042,10,8),new THREE.MeshBasicMaterial({color:0xf2cc7e}));
      dot.position.copy(globePoint(lat,lon,2.025));miniScene.add(dot);return dot;
    });
    for(let i=1;i<stops.length;i++){
      const a=markers[i-1].position.clone().normalize(), b=markers[i].position.clone().normalize();
      const distance=a.angleTo(b);
      const route=[];
      for(let k=0;k<=25;k++){
        const t=k/25;
        route.push(a.clone().multiplyScalar(Math.sin((1-t)*distance)/Math.sin(distance))
          .addScaledVector(b,Math.sin(t*distance)/Math.sin(distance)).multiplyScalar(2.02+Math.sin(t*Math.PI)*distance*.09));
      }
      miniScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(route),new THREE.LineBasicMaterial({color:0xdcb676})));
    }
    atlas={renderer:view,scene:miniScene,camera:miniCamera,markers,light,lat:0,lon:0};
    new ResizeObserver(drawAtlas).observe(element('map-stage'));
    if(mapView==='globe'){renderWorldTour();pointGlobe();}
  })().catch(()=>{
    if(mapView==='globe'){
      setMapView('venue');
      element('map-credit').textContent='Globe unavailable';
    }
  }).finally(()=>{atlasPromise=null;});
  return atlasPromise;
}
function pointGlobe() {
  if(!atlas||mapView!=='globe')return;
  [,atlas.lat,atlas.lon]=stops[selectedStop];
  drawAtlas();
}
function drawAtlas() {
  if(!atlas||mapView!=='globe'||activeScreen!=='view-world-tour')return;
  const stage=element('map-stage'), w=stage.clientWidth,h=stage.clientHeight;
  if(!w||!h)return;
  atlas.camera.aspect=w/h;
  atlas.camera.position.copy(globePoint(atlas.lat,atlas.lon,Math.max(6.4,6.4*h/w)));
  atlas.camera.lookAt(0,0,0);
  atlas.camera.updateProjectionMatrix();
  atlas.light.position.copy(atlas.camera.position).add(new THREE.Vector3(1.4,3,1));
  atlas.markers.forEach((pin,i)=>pin.scale.setScalar(i===selectedStop?2:1));
  atlas.renderer.setSize(w,h,false);
  atlas.renderer.render(atlas.scene,atlas.camera);
}
let globeDrag=null;
element('map-stage').addEventListener('pointerdown',event=>{
  if(!atlas||mapView!=='globe'||event.button!==0)return;
  globeDrag={x:event.clientX,y:event.clientY};
  event.currentTarget.setPointerCapture(event.pointerId);
});
element('map-stage').addEventListener('pointermove',event=>{
  if(!globeDrag)return;
  atlas.lon+=(event.clientX-globeDrag.x)*.4;
  atlas.lat=Math.max(-85,Math.min(85,atlas.lat+(event.clientY-globeDrag.y)*.4));
  globeDrag={x:event.clientX,y:event.clientY};drawAtlas();
});
for(const type of ['pointerup','pointercancel']) element('map-stage').addEventListener(type,()=>{globeDrag=null;});
window.addEventListener('keydown',event=>{
  if(activeScreen!=='view-world-tour')return;
  if(event.key==='ArrowLeft'){event.preventDefault();changeDestination(-1);}
  if(event.key==='ArrowRight'){event.preventDefault();changeDestination(1);}
});

function startWorldTravel() {
  const town=TOWNS_DATABASE[selectedStop];
  if(town.id===career.current && mapOrigin==='view-rpg-campaign') {closeWorldTour();return;}
  const previous=currentTown;
  const car=createCarModel('sedan',0x315f72);
  if(isRidingBike)dismountBike();
  build3DCampusWorld(town);
  arrivalAt(town);
  travel={town,car,time:0,startZ:Math.min(town.size*.43,42)};
  car.position.set(-2.1,.024,travel.startZ);
  rpgWorldGroup.add(car);
  element('travel-from').textContent=town.id===previous.id?'Campus arrival':stops[previous.id-1][0]+' → '+stops[town.id-1][0];
  element('travel-to').textContent=town.name;
  element('travel-progress').value=0;
  navigateTo('view-travel');
  updateWorldTravel(0);
}
function updateWorldTravel(delta) {
  if(!travel)return;
  travel.time=Math.min(5.1,travel.time+delta);
  const t=travel.time/5.1;
  const z=THREE.MathUtils.lerp(travel.startZ,11.5,t*t*(3-2*t));
  const moved=travel.car.position.z-z;
  travel.car.position.z=z;
  travel.car.wheels.forEach(w=>{w.rotation.x+=moved/travel.car.wheelRadius;});
  camera.position.set(-7.4+2*t,2.8,z+6.5);
  controls.target.set(-2.1,.9,z-1.9);
  element('travel-progress').value=t;
  if(t>=1)finishWorldTravel();
}
function finishWorldTravel() {
  if(!travel)return;
  const {town,car}=travel;
  rpgWorldGroup.remove(car);
  travel=null;
  career.current=town.id;
  if(!career.visits.includes(town.id)){career.visits.push(town.id);career.coins+=25;}
  writeSaved(progressKey,career);
  navigateTo('view-rpg-campaign');
  athleteRoot.position.set(-4.85,0,11.5);
  followCampusCamera(true);
  renderMinimap();
}
if(!TOWNS_DATABASE.some(town=>town.id===career.current))career.current=1;
arrivalAt(TOWNS_DATABASE.find(town=>town.id===career.current));

function uiButton(label,action,extra='') {
  const button=document.createElement('button');
  button.className='aqua-button'+(extra?' '+extra:'');
  button.type='button';button.textContent=label;
  button.addEventListener('click',action);return button;
}
function fillMetrics(node,metrics) {
  node.replaceChildren(...metrics.map(([label,value])=>{
    const item=document.createElement('article'), n=document.createElement('strong'), caption=document.createElement('span');
    n.textContent=value;caption.textContent=label;item.append(n,caption);return item;
  }));
}

const pct=(n,d)=>d?Math.round(n/d*100)+'%':'—';

const countryNames={ARG:'Argentina',AUS:'Australia',BRA:'Brazil',CAN:'Canada',CHN:'China',CRO:'Croatia',ESP:'Spain',FRA:'France',GBR:'Great Britain',GRE:'Greece',HUN:'Hungary',ITA:'Italy',JPN:'Japan',MNE:'Montenegro',NED:'Netherlands',NZL:'New Zealand',ROU:'Romania',RSA:'South Africa',SGP:'Singapore',SRB:'Serbia',USA:'United States'};
const omegaReport='https://www.omegatiming.com/File/0001190400FFFFFFFFFFFFFFFFFFFF';
const worldResults={
  // Official finishing order. Fields are team code, matches, goals and shots.
  men:[
    ['ESP',6,78,207],['HUN',7,115,239],['GRE',7,101,239],['SRB',7,119,247],
    ['CRO',6,93,201],['MNE',7,86,239],['ITA',6,86,207],['USA',6,86,193],
    ['JPN',6,98,221],['ROU',6,83,193],['CAN',6,80,213],['BRA',6,64,187],
    ['AUS',5,67,160],['CHN',5,49,176],['SGP',5,46,131],['RSA',5,29,117]
  ],
  women:[
    ['GRE',7,122,260],['HUN',6,101,217],['ESP',6,95,218],['USA',6,100,193],
    ['NED',7,101,219],['AUS',6,107,205],['ITA',7,116,245],['JPN',7,116,242],
    ['CHN',6,82,207],['NZL',6,72,182],['GBR',6,67,188],['FRA',6,52,169],
    ['CRO',5,53,161],['ARG',5,48,140],['RSA',5,27,142],['SGP',5,27,89]
  ]
};
let leagueSource='world', worldDivision='men';
function worldLeagueRows() {
  return worldResults[worldDivision].map(([code,played,goals,shots],i)=>({code,name:countryNames[code],rank:i+1,played,goals,shots}));
}
function openWorldLeague(view) {
  leagueSource='world';leagueView=view;leagueSort=null;leagueFilter='';
  navigateTo('view-board');
}
function drawLeagueSources() {
  element('league-context').textContent=leagueSource==='world'?'World Championships · Singapore 2025':'Aqua 26 · Online shootouts';
  element('league-sources').replaceChildren(...[['world','World Championships'],['online','Aqua Online']].map(([source,label])=>{
    const button=uiButton(label,()=>{
      if(source===leagueSource)return;
      leagueSource=source;leagueView=source==='world'?'Team Standings':'Player Stats';
      leagueSort=null;leagueFilter='';loadLeague();
    },leagueSource===source?'primary':'');
    button.setAttribute('aria-pressed',String(leagueSource===source));return button;
  }));
}
function officialLeagueFilters(input) {
  const division=document.createElement('select');
  division.className='career-input';division.setAttribute('aria-label','Tournament division');
  for(const [value,label] of [['men','Men'],['women','Women']])division.add(new Option(label,value));
  division.value=worldDivision;
  division.addEventListener('change',()=>{worldDivision=division.value;leagueFilter='';drawLeague();});
  const link=document.createElement('a');
  const suffix=leagueView==='Team Standings'?(worldDivision==='men'?'01':'00'):(worldDivision==='men'?'05':'04');
  link.className='aqua-button';link.href=omegaReport+suffix+'.PDF';link.target='_blank';link.rel='noopener noreferrer';
  link.textContent='Official results ↗';
  return [division,input,link];
}

const leagueViews=['Player Stats','Goalkeeping','Shot Types','Player Standings','Team Standings','Team Stats'];
let leagueData={players:[],teams:[]}, leagueView='Team Standings', leagueSort=null, leagueFilter='';
let leagueLoad=0;
function formatRate(n,d) {return d?n/d:null;}
const statColumns={
  games:['Played',r=>r.played||0],shots:['Shots',r=>r.shots||0],goals:['Goals',r=>r.goals||0],
  percentage:['Shooting %',r=>formatRate(r.goals,r.shots),true],
  accuracy:['On target %',r=>formatRate(r.onTarget,r.tracked),true],
  wins:['Wins',r=>r.won||0],losses:['Losses',r=>r.lost||0],ties:['Ties',r=>r.tied||0],
  against:['Goals against',r=>r.against||0],difference:['Goal diff.',r=>(r.goals||0)-(r.against||0)],
  points:['Points',r=>r.points||0],saves:['Saves',r=>r.tracked?r.saves:null],
  faced:['Shots faced',r=>r.tracked?r.shotsFaced:null],saveRate:['Save %',r=>formatRate(r.saves,r.shotsFaced),true],
};
for(const shot of ['skip','lob','power']){
  const type=shot[0].toUpperCase()+shot.slice(1);
  statColumns[shot]=[type+' goals',r=>r.tracked?(r.shotTypes?.[shot]?.goals||0):null];
  statColumns[shot+'Rate']=[type+' %',r=>formatRate(r.shotTypes?.[shot]?.goals,r.shotTypes?.[shot]?.shots),true];
}
const leagueColumns={
  'Player Stats':['goals','shots','percentage','accuracy','games'],
  Goalkeeping:['saves','faced','saveRate','against','games'],
  'Shot Types':['skip','skipRate','lob','lobRate','power','powerRate'],
  'Player Standings':['points','games','wins','losses','ties','goals','against','difference'],
  'Team Standings':['points','games','wins','losses','ties','goals','against','difference'],
  'Team Stats':['goals','shots','percentage','accuracy','saves','saveRate','games'],
};
async function loadLeague() {
  const request=++leagueLoad;
  drawLeagueSources();
  if(leagueSource==='world'){drawLeague();return;}
  for(const id of ['league-tabs','league-summary','league-filters','board-table'])element(id).replaceChildren();
  element('board-status').textContent='Loading match records…';
  try {
    const result=await api('/api/league');
    if(request!==leagueLoad||activeScreen!=='view-board')return;
    leagueData=result;
    drawLeague();
  } catch(error) {
    if(request===leagueLoad)element('board-status').textContent=error.message;
  }
}
function drawLeague() {
  const official=leagueSource==='world', team=leagueView.startsWith('Team');
  const rows=official?worldLeagueRows():leagueData[team?'teams':'players'];
  const nav=element('league-tabs');
  const views=official?['Team Standings','Team Stats']:leagueViews;
  nav.replaceChildren(...views.map(name=>{
    const button=uiButton(name,()=>{leagueView=name;leagueSort=null;leagueFilter='';drawLeague();});
    button.setAttribute('aria-pressed',String(name===leagueView));return button;
  }));
  const count=Math.floor(leagueData.players.reduce((total,row)=>total+row.played,0)/2);
  const totals=official?[['National teams',rows.length],['Matches',rows.reduce((sum,row)=>sum+row.played,0)/2],['Gold medal',rows[0].name],['Goals',rows.reduce((sum,row)=>sum+row.goals,0)]]:
    [['Completed shootouts',count],['Ranked players',leagueData.players.length],['Goals',leagueData.players.reduce((sum,row)=>sum+row.goals,0)],['Teams used',leagueData.teams.length]];
  fillMetrics(element('league-summary'),totals);
  const input=document.createElement('input');
  input.className='career-input';input.type='search';input.value=leagueFilter;
  input.placeholder=team?'Find a team':'Find a player';input.setAttribute('aria-label',input.placeholder);
  input.addEventListener('input',()=>{leagueFilter=input.value;drawLeagueTable(rows,team);});
  element('league-filters').replaceChildren(...(official?officialLeagueFilters(input):[input,uiButton('Refresh',loadLeague)]));
  drawLeagueTable(rows,team);
}
function drawLeagueTable(rows,team) {
  const official=leagueSource==='world', standingsView=leagueView.includes('Standings');
  const columns=official?['games','goals','shots','percentage']:leagueColumns[leagueView];
  const ranked=rows.map((row,i)=>({row,rank:row.rank??(row.played?i+1:null)}));
  const all=ranked.filter(({row})=>(row.name+' '+(row.code||'')).toLowerCase().includes(leagueFilter.trim().toLowerCase()));
  const order=leagueSort||(!standingsView?{key:official?'goals':columns[0],direction:-1}:null);
  if(order)all.sort((a,b)=>{
    const get=statColumns[order.key][1], n=get(a.row),m=get(b.row);
    return ((n===null)-(m===null)) || (n===null?0:(n-m)*order.direction) || a.row.name.localeCompare(b.row.name);
  });
  element('board-status').textContent=all.length===0?(leagueFilter?'No matching entries.':'No completed online shootouts yet.'):
    official?(standingsView?'Official final placings, with whole-tournament totals.':'Totals from the preliminary and final rounds.'):
    team?'Hungary and Italy are the two sides in online shootouts.':'Online shootout results on this server.';
  const table=document.createElement('table');table.setAttribute('aria-label',leagueView);
  const heading=table.createTHead().insertRow();
  const addHeader=title=>{const th=document.createElement('th');th.scope='col';th.textContent=title;heading.append(th);return th;};
  if(standingsView)addHeader('Rank');
  addHeader(team?'Team':'Player');
  for(const column of columns){
    const th=addHeader('');
    th.setAttribute('aria-sort',order?.key===column?(order.direction<0?'descending':'ascending'):'none');
    th.append(uiButton(statColumns[column][0],()=>{
      leagueSort={key:column,direction:order?.key===column?-order.direction:-1};drawLeagueTable(rows,team);
    }));
  }
  const body=table.createTBody();
  for(const {row,rank} of all){
    const tr=body.insertRow();
    if(standingsView)tr.insertCell().textContent=rank??'—';
    tr.insertCell().textContent=row.name;
    for(const column of columns){
      const [,get,isRate]=statColumns[column], value=get(row);
      tr.insertCell().textContent=value==null?'—':isRate?Math.round(value*100)+'%':value;
    }
  }
  element('board-table').replaceChildren(...(all.length?[table]:[]));
}


const mascots=['🐬','🦈','🐙','🐢','🦭','🐳','🦦','🐋','🐟','🦀','🦞','🦑','🐠','🐡','🪼','🐚','🦆','🐧','🦩','🦢','🐸','🐊','🦅','🦉','🐺','🦊','🦁','🐯','🐶','🐼','🐲','🏊'];
const mascotNames=['Dolphin','Shark','Octopus','Turtle','Seal','Whale','Otter','Blue whale','Fish','Crab','Lobster','Squid','Reef fish','Pufferfish','Jellyfish','Shell','Duck','Penguin','Flamingo','Swan','Frog','Crocodile','Eagle','Owl','Wolf','Fox','Lion','Tiger','Dog','Panda','Dragon','Swimmer'];
const profileTabs=['Stats','Items','Campaign','Marketplace','Recordings'];
let profileTab='Stats', publicSelf=null, profileVisits=[], selectedMascot=null, directoryView=null;
let directoryRequest=0, mediaUrls=[];
function profileApi(route,data,method) {return api('/api/'+route,data,profile.identity,method);}
function viewedProfile() {return profileVisits.at(-1)||publicSelf||profile;}
function levelInfo(xp) {
  let level=0;
  while(xp>=(level+1)*1000){ xp-=(level+1)*1000;level++;}
  return {level,xp,required:(level+1)*1000};
}
function profileXp() {
  const local=localRecord(), online=publicSelf?.record||{};
  return levelInfo(career.visits.length*120+local.played*100+local.won*80+(online.played||0)*130+(online.won||0)*90);
}
function drawIdentity() {
  const person=viewedProfile(), own=!profileVisits.length, info=profileXp();
  element('profile-title').textContent=person.username?('@'+person.username):person.name;
  element('profile-display').textContent=person.username?person.name:'';
  element('profile-bio').textContent=person.bio||'';
  element('profile-portrait').textContent=mascots[person.mascot]||'🤽';
  element('profile-pencil').hidden=!own;
  element('profile-level-label').textContent=own?'Level '+info.level:'';
  element('personal-profile').hidden=!own;
  const actions=element('visited-actions');
  actions.replaceChildren();
  if(!own) actions.append(uiButton(person.following?'Unfollow':person.followsYou?'Follow back':'Follow',()=>updateFollow(person,!person.following)),
    uiButton('Send message',()=>showInbox(person)));
  const counts=element('profile-counts');
  counts.replaceChildren();
  for(const [key,label,property] of [['friends','Friends','friends'],['followers','Followers','followers'],['following','Following','followingCount']]){
    const cell=document.createElement('div');
    const button=uiButton(label,()=>showPeople(key));
    const total=document.createElement('strong');
    total.textContent=person[property]||0;
    button.prepend(total);
    const list=document.createElement('div');
    list.id='connections-'+key;list.className='profile-connections career-panel';list.hidden=true;
    button.setAttribute('aria-controls',list.id);button.setAttribute('aria-expanded','false');
    button.disabled=!own;
    cell.append(button,list);counts.append(cell);
  }
  element('profile-level').textContent='Level '+info.level;
  element('profile-xp').max=info.required;element('profile-xp').value=info.xp;
  element('profile-xp-label').textContent=info.xp.toLocaleString()+' / '+info.required.toLocaleString()+' XP';
}
function renderCareerProfile() {
  if(activeScreen!=='view-profile')return;
  profileVisits=[];directoryView=null;
  element('people-results').hidden=true;
  drawIdentity();setProfileTab('Stats');drawAthletePreview();
  refreshSelf();
}
async function refreshSelf() {
  try {
    publicSelf=await profileApi('profile');
    if(publicSelf){
      for(const key of ['name','username','bio','mascot'])profile[key]=publicSelf[key];
      writeSaved(profileKey,profile);
    }
    if(activeScreen==='view-profile'&&!profileVisits.length){
      drawIdentity();
      if(profileTab==='Stats')setProfileTab('Stats');
    }
  } catch { /* Keep the browser's saved profile available when disconnected. */ }
}
function backProfile() {
  if(profileVisits.length) {profileVisits.pop();drawIdentity();drawAthletePreview();}
  else navigateTo('view-home');
}
function editCareerProfile() {
  const form=element('profile-editor');
  selectedMascot=profile.mascot??null;
  element('profile-name').value=profile.name||'';
  element('profile-username').value=profile.username||'';
  element('profile-bio-edit').value=profile.bio||'';
  element('profile-youtube').value=profile.youtube||'';
  element('profile-status').textContent='';
  element('mascot-grid').replaceChildren(...mascots.map((icon,index)=>{
    const button=uiButton(icon,()=>{
      selectedMascot=index;
      [...element('mascot-grid').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    });
    button.setAttribute('aria-label',mascotNames[index]);
    button.setAttribute('aria-pressed',String(selectedMascot===index));return button;
  }));
  form.showModal();
}
async function saveCareerProfile(event) {
  event.preventDefault();
  const submit=event.submitter;
  submit.disabled=true;
  try {
    const name=element('profile-name').value.trim(), username=element('profile-username').value.trim();
    const bio=element('profile-bio-edit').value.trim();
    const youtube=element('profile-youtube').value.trim();
    if(youtube){
      let link;
      try{link=new URL(youtube);}catch{throw Error('Enter a full YouTube channel URL.');}
      if(link.protocol!=='https:'||!['www.youtube.com','youtube.com'].includes(link.hostname)||!/^\/(?:@|channel\/|c\/|user\/)[^/]+\/?$/.test(link.pathname)||link.username||link.password) throw Error('Enter a full YouTube channel URL.');
    }
    publicSelf=await profileApi('profile',{name,username,bio,mascot:selectedMascot},'PUT');
    Object.assign(profile,{name,username,bio,mascot:selectedMascot,youtube});
    writeSaved(profileKey,profile);
    element('profile-editor').close();drawIdentity();setProfileTab(profileTab);
  } catch(error) {element('profile-status').textContent=error.message;}
  finally {submit.disabled=false;}
}
function visitProfile(person) {
  profileVisits.push(person);directoryView=null;
  element('people-results').hidden=true;
  drawIdentity();
  element('view-profile').scrollTop=0;
}
async function updateFollow(person,follow) {
  try {
    const updated=await profileApi('follow',{target:person.id,follow});
    if(profileVisits.at(-1)?.id===updated.id) {profileVisits[profileVisits.length-1]=updated;drawIdentity();}
    else if(directoryView) {const current=directoryView;directoryView=null;showPeople(current);}
  } catch(error) {
    const results=element('people-results');
    results.hidden=false;results.textContent=error.message;
  }
}
async function showPeople(view) {
  const request=++directoryRequest;
  for(const node of element('profile-counts').querySelectorAll('.profile-connections')){
    node.hidden=true;
    node.previousElementSibling?.setAttribute('aria-expanded','false');
  }
  if(view!=='search'&&directoryView===view){directoryView=null;return;}
  directoryView=view;
  const target=element(view==='search'?'people-results':'connections-'+view);
  target.hidden=false;target.textContent='Loading…';
  if(view!=='search')target.previousElementSibling?.setAttribute('aria-expanded','true');
  try {
    const rows=await profileApi('people',{view,query:element('people-search').value});
    if(request!==directoryRequest||directoryView!==view)return;
    target.replaceChildren();
    if(!rows.length){target.textContent=view==='search'?'No matching players.':'No '+view+' yet.';return;}
    rows.forEach(person=>{
      const row=document.createElement('div');
      row.className='people-row';
      row.append(uiButton(person.name,()=>visitProfile(person)));
      if(view==='search')row.append(uiButton(person.following?'Unfollow':person.followsYou?'Follow back':'Follow',()=>updateFollow(person,!person.following)));
      target.append(row);
    });
  } catch(error) {if(request===directoryRequest)target.textContent=error.message;}
}
let inboxTarget=null;
async function showInbox(person=null) {
  const dialog=element('profile-inbox');
  if(!dialog.open) dialog.showModal();
  element('inbox-status').textContent='';
  try {
    const {id,messages}=await profileApi('messages');
    if(!dialog.open)return;
    inboxTarget=person;
    const partners=new Map([[id,{id,name:'Notes to self'}]]);
    for(const msg of messages)partners.set(msg.from===id?msg.to:msg.from,{id:msg.from===id?msg.to:msg.from,
      name:msg.from===msg.to?'Notes to self':msg.from===id?msg.toName:msg.fromName});
    const list=element('inbox-list'),thread=element('inbox-thread');
    list.replaceChildren(...[...partners.values()].map(partner=>uiButton(partner.name,()=>showInbox(partner))));
    thread.replaceChildren();
    element('message-form').hidden=!person;
    if(!person)return;
    const label=document.createElement('h3');label.textContent=person.name;thread.append(label);
    for(const m of messages.filter(msg=>msg.from===person.id||msg.to===person.id)) {
      const row=document.createElement('p');
      row.className='thread-item';row.textContent=(m.from===id?'You':m.fromName)+': '+m.text;
      thread.append(row);
    }
  }catch(error){element('inbox-status').textContent=error.message;}
}
async function sendCareerMessage(event) {
  event.preventDefault();
  if(!inboxTarget)return;
  try {
    const person=inboxTarget;
    await profileApi('messages',{target:person.id,text:element('message-text').value});
    element('message-text').value='';
    await showInbox(person);
  } catch(error){element('inbox-status').textContent=error.message;}
}

let athletePreview=null, portraitDrag=null;
function drawAthletePreview() {
  if(activeScreen!=='view-profile'||profileVisits.length)return;
  const mount=element('profile-athlete');
  if(!athletePreview){
    try {
      const view=new THREE.WebGLRenderer({alpha:true,antialias:true});
      view.outputEncoding=THREE.sRGBEncoding;view.toneMapping=THREE.ACESFilmicToneMapping;
      view.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
      const preview=new THREE.Scene(), lens=new THREE.PerspectiveCamera(40,1,.1,20);
      const model=createDetailedHumanoid(true,null,null,null,null,{look:athleteLook});
      model.visible=true;
      const fill=new THREE.HemisphereLight(0xe3f3ff,0x798994,1.15), key=new THREE.DirectionalLight(0xffeee0,1.42);
      key.position.set(2,4,3);preview.add(fill,key,model);
      meshPart(preview,new THREE.CylinderGeometry(.62,.66,.09,36),surface(0x274b58),0,-.046,0);
      lens.position.set(0,1.19,3.17);lens.lookAt(0,.94,0);
      athletePreview={view,preview,lens,model};
      mount.append(view.domElement);
      const target=view.domElement; target.style.touchAction='none';
      target.addEventListener('pointerdown',e=>{portraitDrag=e.clientX;target.setPointerCapture(e.pointerId);});
      target.addEventListener('pointermove',e=>{
        if(portraitDrag===null)return;
        model.rotation.y+=(e.clientX-portraitDrag)*.012;portraitDrag=e.clientX;drawAthletePreview();
      });
      for(const type of ['pointerup','pointercancel']) target.addEventListener(type,()=>{portraitDrag=null;});
      athletePreview.observer=new ResizeObserver(drawAthletePreview);
      athletePreview.observer.observe(mount);
    } catch {mount.textContent='3D preview unavailable.';return;}
  }
  const {view,preview,lens,model}=athletePreview;
  const height=mount.parentElement.clientHeight,w=Math.min(280,mount.parentElement.clientWidth);
  if(!height||!w)return;
  mount.style.width=w+'px';
  lens.aspect=w/height;lens.updateProjectionMatrix();
  view.setSize(w,height,false);view.render(preview,lens);
}
function invalidateAthletePreview() {
  if(!athletePreview)return;
  athletePreview.observer.disconnect();
  releaseSkeletons(athletePreview.model);
  athletePreview.view.dispose();
  athletePreview.view.forceContextLoss();
  athletePreview=null;
  element('profile-athlete').replaceChildren();
}

function setProfileTab(tab) {
  profileTab=tab;
  const nav=element('profile-tabs'), content=element('profile-content');
  nav.replaceChildren(...profileTabs.map(name=>{
    const button=uiButton(name,()=>setProfileTab(name));
    button.setAttribute('aria-pressed',String(tab===name));return button;
  }));
  content.replaceChildren();
  for(const url of mediaUrls)URL.revokeObjectURL(url);
  mediaUrls=[];
  const addText=(tag,contentText)=>{
    const node=document.createElement(tag);node.textContent=contentText;content.append(node);return node;
  };
  if(tab==='Stats'){
    const r=localRecord(), o=publicSelf?.record||{};
    const stats=document.createElement('div');stats.className='career-metrics';content.append(stats);
    fillMetrics(stats,[['Local shootouts',r.played],['Online shootouts',o.played||0],['Wins',r.won+(o.won||0)],
      ['Losses',r.lost+(o.lost||0)],['Ties',r.tied+(o.tied||0)],['Goals',r.goals+(o.goals||0)],
      ['Shooting %',pct(r.goals+(o.goals||0),r.shots+(o.shots||0))],['Online saves',o.saves??'—']]);
    addText('h3','Trophy case');
    addText('p',r.won+(o.won||0)>0?'First Shootout Win · Earned':'First Shootout Win · Win a shootout');
    addText('p',career.visits.length===10?'World Tour Passport · Earned':'World Tour Passport · '+career.visits.length+' / 10 venues');
    content.append(uiButton('Open league',()=>navigateTo('view-board')));
  } else if(tab==='Items'){
    addText('h3','Tour badges');
    if(career.visits.length) {
      const grid=document.createElement('div');grid.className='career-metrics';content.append(grid);
      fillMetrics(grid,career.visits.map(id=>['Venue badge',stops[id-1][0]]));
    }else addText('p','Visit a campaign venue to collect its badge.');
  } else if(tab==='Campaign'){
    addText('h3','World Tour');addText('p',career.visits.length+' of '+stops.length+' venues visited · Current stop: '+stops[career.current-1][0]);
    content.append(uiButton('Open World Tour',openWorldTour,'primary'));
  } else if(tab==='Marketplace'){
    addText('h3','Club collection');
    addText('p',career.coins+' career coins · Earn 25 for each first-time venue visit.');
    content.append(uiButton('Team Builder & packs',()=>navigateTo('view-team-builder')));
  } else {
    addText('h3','Recordings and screenshots');
    addText('p','Capture from the game menu. Saved on this device.');
    if(profile.youtube){
      const link=document.createElement('a');link.className='aqua-button';link.href=profile.youtube;
      link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open your YouTube channel';content.append(link);
    }
    renderCaptures(content);
  }
}

const captureLimit=1000, recordingLimit=100*60;
let recorder=null, recordingStart=0, recordingTimer=null, captureStore=null;
function mediaDatabase() {
  if(!captureStore)captureStore=new Promise((resolve,reject)=>{
    const open=indexedDB.open('aqua26-media',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('captures',{autoIncrement:true,keyPath:'id'});
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  return captureStore;
}
async function mediaRequest(action,write=false) {
  const db=await mediaDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('captures',write?'readwrite':'readonly');
    const request=action(tx.objectStore('captures'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
async function renderCaptures(content) {
  try {
    const items=await mediaRequest(store=>store.getAll());
    if(activeScreen!=='view-profile'||profileTab!=='Recordings'||!content.isConnected)return;
    const heading=document.createElement('p');
    const seconds=items.reduce((sum,item)=>sum+(item.seconds||0),0);
    heading.textContent=items.filter(item=>item.kind==='image').length+' / '+captureLimit+' images · '+Math.ceil(seconds/60)+' / 100 video minutes';
    content.append(heading);
    const gallery=document.createElement('div');gallery.className='profile-gallery';
    for(const item of items.reverse()){
      const card=document.createElement('article'), media=document.createElement(item.kind==='image'?'img':'video');
      const href=URL.createObjectURL(item.blob);mediaUrls.push(href);
      media.src=href;
      if(item.kind==='video'){media.controls=true;media.preload='none';}
      else media.alt='Water Polo screenshot';
      const link=document.createElement('a');link.className='aqua-button';
      link.textContent='Download';link.href=href;link.download='aqua26-'+item.at+(item.kind==='image'?'.png':'.webm');
      card.append(media,link,uiButton('Delete',async()=>{
        if(!window.confirm('Delete this capture?'))return;
        await mediaRequest(store=>store.delete(item.id),true);setProfileTab('Recordings');
      }));
      gallery.append(card);
    }
    content.append(gallery);
  } catch {if(profileTab==='Recordings'){const note=document.createElement('p');note.textContent='Media storage unavailable.';content.append(note);}}
}
async function takeScreenshot() {
  try {
    const items=await mediaRequest(store=>store.getAll());
    if(items.filter(item=>item.kind==='image').length>=captureLimit){showBanner('Screenshot limit reached');return;}
    renderer.render(scene,camera);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('capture unavailable');
    await mediaRequest(store=>store.add({kind:'image',blob,at:Date.now()}),true);
    showBanner('Screenshot saved to Profile');
  } catch {showBanner('Could not save screenshot');}
}
async function toggleGameRecording() {
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!window.MediaRecorder||!canvas.captureStream){showBanner('Recording unavailable in this browser');return;}
  try {
    const items=await mediaRequest(store=>store.getAll());
    const remaining=recordingLimit-items.reduce((sum,item)=>sum+(item.seconds||0),0);
    if(remaining<1){showBanner('Video limit reached');return;}
    const stream=canvas.captureStream(30), chunks=[];
    const format=['video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    recorder=new MediaRecorder(stream,format?{mimeType:format,videoBitsPerSecond:3000000}:{});
    const capture=recorder;
    capture.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    capture.onstop=async()=>{
      clearTimeout(recordingTimer);stream.getTracks().forEach(track=>track.stop());
      const seconds=Math.ceil((performance.now()-recordingStart)/1000);
      recorder=null;
      element('record-game-label').textContent='Record';
      try{
        await mediaRequest(store=>store.add({kind:'video',blob:new Blob(chunks,{type:capture.mimeType}),seconds,at:Date.now()}),true);
        showBanner('Recording saved to Profile');
      }catch{showBanner('Could not save recording');}
    };
    capture.onerror=()=>showBanner('Recording stopped unexpectedly');
    recordingStart=performance.now();capture.start(1000);
    recordingTimer=setTimeout(()=>{if(capture.state==='recording')capture.stop();},remaining*1000);
    element('record-game-label').textContent='Stop recording';
    showBanner('Recording started');
  } catch {showBanner('Could not start recording');}
}

let cameraView='third', priorMatchScreen='view-home', campusMatchReturn=null;
function campusPaused() {
  return element('hamburger-dropdown').classList.contains('open')||document.querySelector('.hud-modal.open')!==null;
}
function followCampusCamera(immediate=false) {
  const p=athleteRoot.position;
  const ease=immediate?1:.12;
  if(cameraView==='first') {
    const heading=athleteRoot.rotation.y;
    camera.position.set(p.x+Math.sin(heading)*.14,p.y+1.63,p.z+Math.cos(heading)*.14);
    controls.target.set(p.x+Math.sin(heading)*5,p.y+1.36,p.z+Math.cos(heading)*5);
    pUser.visible=false;
  } else{
    pUser.visible=true;
    const offset=cameraView==='overhead'?{x:0,y:13,z:4}:cameraView==='deck'?{x:5.2,y:4.1,z:5.5}:{x:0,y:3.8,z:7.2};
    camera.position.lerp(new THREE.Vector3(p.x+offset.x,p.y+offset.y,p.z+offset.z),ease);
    controls.target.set(p.x,p.y+1.16,p.z);
  }
}
function setCameraView(mode) {
  cameraView=mode;
  if(activeScreen==='view-rpg-campaign')followCampusCamera(true);
  if(activeScreen==='view-match'){
    const z=shootoutSession?-11.8:-4.2;
    if(mode==='overhead')camera.position.set(0,16,z+4);
    else if(mode==='deck')camera.position.set(-11.6,3,z+3);
    else camera.position.set(-6.6,4.4,z+8);
    controls.target.set(0,.85,z);
  }
  closeModals();
}
function setGameMenu(open) {
  element('hamburger-dropdown').classList.toggle('open',open);
  element('game-menu-button').setAttribute('aria-expanded',String(open));
  if(open){
    element('career-coin-count').textContent=career.coins+' career coins';
    element('hamburger-dropdown').querySelector('[data-menu=play]').hidden=activeScreen!=='view-rpg-campaign';
    element('hamburger-dropdown').querySelector('[data-menu=leave]').hidden=activeScreen!=='view-match';
  }
}
function launchPoolPractice() {
  if(activeScreen!=='view-match'){
    priorMatchScreen=activeScreen==='view-rpg-campaign'?'view-rpg-campaign':'view-home';
    campusMatchReturn=priorMatchScreen==='view-rpg-campaign'?athleteRoot.position.clone():null;
  }
  leaveShootout();
  navigateTo('view-match');
}
function gameMenu(action) {
  setGameMenu(false);
  if(action==='home'){navigateTo('view-home');return;}
  if(action==='play'){launchPoolPractice();return;}
  if(action==='leave'){
    if(priorMatchScreen==='view-rpg-campaign') {
      navigateTo('view-rpg-campaign');
      if(campusMatchReturn && Math.abs(campusMatchReturn.x-natatoriumPos.x)>2.5)athleteRoot.position.copy(campusMatchReturn);
      followCampusCamera(true);
    } else navigateTo('view-home');
    priorMatchScreen='view-home';campusMatchReturn=null;return;
  }
  if(action==='screenshot'){takeScreenshot();return;}
  if(action==='record'){toggleGameRecording();return;}
  if(action==='camera'){
    const choices=activeScreen==='view-rpg-campaign'?[['Third person','third'],['First person','first'],['Overhead','overhead'],['Isometric','deck']]:
      [['Broadcast','third'],['Poolside','deck'],['Overhead','overhead']];
    element('camera-options').replaceChildren(...choices.map(([label,key])=>uiButton(label,()=>setCameraView(key))));
  }
  openModal('modal-'+action);
}
document.addEventListener('pointerdown',event=>{
  if(!element('hamburger-dropdown').parentElement.contains(event.target))setGameMenu(false);
});

let musicLoop=null,musicStep=0,musicGain=null;
function toggleCampusMusic() {
  if(musicLoop!==null){
    clearInterval(musicLoop);musicLoop=null;
    musicGain.gain.setTargetAtTime(0,audioCtx.currentTime,.08);
    element('music-toggle').textContent='Play music';
    element('home-music-toggle').textContent='Play music';return;
  }
  audioCtx.resume();
  const score=[[48,55,60],[45,52,60],[41,48,57],[43,50,57]];
  const bus=audioCtx.createGain();bus.gain.value=.22;bus.connect(audioCtx.destination);
  const oldBus=musicGain;musicGain=bus;
  if(oldBus)setTimeout(()=>oldBus.disconnect(),400);
  const verse=()=>{
    const chord=score[Math.floor(musicStep/4)%score.length], now=audioCtx.currentTime;
    const tune=musicStep%4;
    const notes=tune===0?[chord[0]-12,chord[0],chord[1]+12]:[chord[tune%3]+12];
    notes.forEach((note,i)=>{
      const oscillator=audioCtx.createOscillator(), volume=audioCtx.createGain();
      oscillator.type=i===0?'sine':'triangle';
      oscillator.frequency.value=440*Math.pow(2,(note-69)/12);
      oscillator.connect(volume);volume.connect(bus);
      volume.gain.setValueAtTime(.001,now);
      volume.gain.exponentialRampToValueAtTime(i===0?.18:.11,now+.036);
      volume.gain.exponentialRampToValueAtTime(.001,now+(tune===0?.62:.34));
      oscillator.start(now);oscillator.stop(now+.66);
    });
    musicStep++;
  };
  verse();musicLoop=setInterval(verse,420);
  element('music-toggle').textContent='Pause music';
  element('home-music-toggle').textContent='Pause music';
}




const satelliteEndpoint='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
let satellite=null, satelliteDrag=null;
function tilePosition(lat,lon,zoom) {
  const pixels=256*2**zoom,radians=lat*Math.PI/180;
  return {x:(lon+180)/360*pixels,y:(1-Math.asinh(Math.tan(radians))/Math.PI)*pixels/2};
}
function openSatellite() {
  const [,lat,lon]=stops[selectedStop], zoom=16;
  const center=tilePosition(lat,lon,zoom);
  const pin=document.createElement('span');pin.className='satellite-pin';pin.setAttribute('aria-label','Venue location');
  const layer=document.createElement('div');
  element('tour-art').replaceChildren(layer,pin);
  satellite={layer,pin,zoom,...center,station:center,tiles:new Map()};
  drawSatellite();
}
function drawSatellite() {
  if(!satellite||mapView!=='venue'||activeScreen!=='view-world-tour')return;
  const {layer,pin,zoom,x,y,station,tiles}=satellite, n=2**zoom;
  const bounds=element('map-stage'), w=bounds.clientWidth,h=bounds.clientHeight;
  if(!w||!h)return;
  const left=x-w/2,top=y-h/2;
  const active=new Set();
  for(let row=Math.max(0,Math.floor(top/256));row<=Math.min(n-1,Math.floor((top+h)/256));row++){
    for(let col=Math.floor(left/256);col<=Math.floor((left+w)/256);col++){
      const key=row+':'+col;
      active.add(key);
      let image=tiles.get(key);
      if(!image) {
        image=document.createElement('img');
        image.className='satellite-tile';image.alt='';image.draggable=false;image.decoding='async';
        const view=satellite;
        const check=()=>{
          if(satellite!==view||!image.isConnected)return;
          const loaded=[...tiles.values()].some(tile=>tile.complete&&tile.naturalWidth);
          const waiting=[...tiles.values()].some(tile=>!tile.complete);
          const status=element('satellite-status');
          status.hidden=loaded;
          status.textContent=waiting?'Loading satellite imagery…':'Satellite imagery unavailable';
        };
        image.addEventListener('load',check);image.addEventListener('error',check);
        image.src=satelliteEndpoint+zoom+'/'+row+'/'+((col%n+n)%n);
        tiles.set(key,image);layer.append(image);
      }
      image.style.transform='translate('+Math.round(col*256-left)+'px,'+Math.round(row*256-top)+'px)';
    }
  }
  for(const [key,image] of tiles)if(!active.has(key)){image.remove();tiles.delete(key);}
  pin.style.left=(station.x-left)+'px';pin.style.top=(station.y-top)+'px';
  const status=element('satellite-status');
  status.hidden=[...tiles.values()].some(tile=>tile.complete&&tile.naturalWidth);
  if(!status.hidden)status.textContent=[...tiles.values()].some(tile=>!tile.complete)?'Loading satellite imagery…':'Satellite imagery unavailable';
}
function zoomSatellite(direction) {
  if(!satellite)return;
  const next=Math.max(13,Math.min(18,satellite.zoom+direction)), ratio=2**(next-satellite.zoom);
  if(next===satellite.zoom)return;
  satellite.zoom=next;satellite.x*=ratio;satellite.y*=ratio;satellite.station.x*=ratio;satellite.station.y*=ratio;
  satellite.tiles.clear();satellite.layer.replaceChildren();drawSatellite();
}
const mapStage=element('map-stage');
mapStage.addEventListener('pointerdown',event=>{
  if(mapView!=='venue'||!satellite||event.button!==0||event.target.closest('button,a'))return;
  satelliteDrag={x:event.clientX,y:event.clientY};mapStage.setPointerCapture(event.pointerId);
});
mapStage.addEventListener('pointermove',event=>{
  if(!satelliteDrag||!satellite)return;
  satellite.x-=event.clientX-satelliteDrag.x;
  satellite.y=Math.max(128,Math.min(256*2**satellite.zoom-128,satellite.y-(event.clientY-satelliteDrag.y)));
  satelliteDrag={x:event.clientX,y:event.clientY};drawSatellite();
});
for(const type of ['pointerup','pointercancel'])mapStage.addEventListener(type,()=>{satelliteDrag=null;});
new ResizeObserver(()=>{drawSatellite();drawVenueView();}).observe(mapStage);

const venueAngles=['Campus overview','Front entrance','Rear entrance','Athletic center','Pool deck'];
let selectedAngle=0, venueRenderer=null, venueDrag=null;
const venueScenes=new Map();
function addPreviewLights(target) {
  const light=new THREE.DirectionalLight(0xfff1da,1.11);
  light.position.set(-10,18,12);
  target.add(new THREE.HemisphereLight(0xd3ebff,0xa7b7a6,1.17),light);
}
function venueScene(town,interior) {
  const key=interior?'pool-'+town.id:town.id;
  if(venueScenes.has(key))return venueScenes.get(key);
  const vista=new THREE.Scene();vista.background=new THREE.Color(interior?0x213444:0xa0b7bb);
  addPreviewLights(vista);
  if(interior){
    const deck=poolDeck.clone(true);deck.visible=true;vista.add(deck);
    const water=waterMesh.clone();water.visible=true;vista.add(water);
    const paint=surface([0x3c6c83,0x576f83,0x418880,0x395371,0x536f6a,0x446381,0x789a84,0x356c82,0x576f8d,0x658c82][town.id-1]);
    meshPart(vista,unitBox,paint,0,.72,-17.9,22,.055,1.54);
    for(const source of [cage,southCage]){const net=source.clone(true);net.visible=true;vista.add(net);}
    for(let row=0;row<5;row++)meshPart(vista,unitBox,paint,13.6+row*.9,.8+row*.4,0,1,.4,30);
    const wall=surface(0x476775), glazing=surface(0x78a4b5,.31), girder=surface(0x294456);
    for(const side of [-1,1]){
      meshPart(vista,unitBox,wall,side*18,3.4,0,.4,6.8,40);
      for(let bay=-5;bay<=5;bay++){
        meshPart(vista,unitBox,glazing,side*17.76,4.98,bay*3.25,.06,2.1,2.50);
        meshPart(vista,unitBox,girder,side*17.70,5.03,bay*3.25,.08,.09,2.5);
      }
    }
    for(let bay=-4;bay<=4;bay++){
      meshPart(vista,unitBox,girder,0,6.56,bay*4.15,36,.20,.15);
      for(let lamp=-2;lamp<=2;lamp++)meshPart(vista,unitBox,surface(0xe8eee4),lamp*5.8,6.34,bay*4.15,.86,.12,.35);
    }
    meshPart(vista,unitBox,wall,0,3.60,-20,36,7.3,.3);
    meshPart(vista,plaquePlane,venuePlaque('AQUA 26  /  WATER POLO'),0,3.69,-19.83,13,1.12,1);
  } else{
    vista.fog=new THREE.FogExp2(0xb6c7c1,.008);
    const world=new THREE.Group();build3DCampusWorld(town,world);vista.add(world);
    meshPart(vista,unitBox,surface(0x708477),0,-.15,0,450,.20,450);
    const leaves=[surface(0x547255),surface(0x4c6653),surface(0x688065)], trunk=surface(0x695c47);
    const d=town.size*.23;
    for(let i=0;i<12;i++){
      const x=(i%2?1:-1)*(d+10+(i%3)*1.6), z=((i%6)-2.5)*d*.35;
      const height=2.4+(i%3)*.42;
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.1,.16,height,8),trunk);
      stem.position.set(x,height/2,z);vista.add(stem);
      oval(vista,leaves[i%3],x,height+.64,z,1.4,height*.53,1.36);
    }
  }
  venueScenes.set(key,vista);return vista;
}
function openVenueView() {
  if(!venueRenderer) {
    try {
      const renderer=new THREE.WebGLRenderer({antialias:true});
      renderer.outputEncoding=THREE.sRGBEncoding;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio));
      venueRenderer={renderer,lens:new THREE.PerspectiveCamera(43,1,.12,600),azimuth:0,elevation:0};
    }catch{element('tour-art').textContent='The 3D preview requires WebGL.';return;}
  }
  venueRenderer.azimuth=venueRenderer.elevation=0;
  element('tour-art').replaceChildren(venueRenderer.renderer.domElement);
  element('venue-angles').replaceChildren(...venueAngles.map((label,index)=>{
    const button=uiButton(label,()=>{selectedAngle=index;openVenueView();});
    button.setAttribute('aria-pressed',String(selectedAngle===index));return button;
  }));
  drawVenueView();
}
function drawVenueView() {
  if(!venueRenderer||mapView!=='views'||activeScreen!=='view-world-tour')return;
  const {renderer,lens,azimuth,elevation}=venueRenderer;
  const town=TOWNS_DATABASE[selectedStop], w=mapStage.clientWidth,h=mapStage.clientHeight;
  if(!w||!h)return;
  const d=town.size*.22, overview=Math.min(town.size*.63,75);
  const shots=[
    [[d*.08,1.35,-d*.12],[-overview*.74,overview*.62,overview]],
    [[-d,2.25,-d+7.8],[7,2.5,17]],
    [[-d,2.5,-d-6.0],[-9,3.8,-17]],
    [[d,2.9,d-6.8],[-12,4,-15]],
    [[0,.88,-1],[-9,6.8,13]]
  ];
  const [target,offset]=shots[selectedAngle];
  const focus=new THREE.Vector3(...target), eye=new THREE.Vector3(...offset);
  const orbit=new THREE.Spherical().setFromVector3(eye);
  orbit.theta+=azimuth;orbit.phi=THREE.MathUtils.clamp(orbit.phi+elevation,.2,Math.PI*.48);
  lens.position.copy(focus).add(eye.setFromSpherical(orbit));
  lens.lookAt(focus);lens.aspect=w/h;lens.updateProjectionMatrix();
  renderer.setSize(w,h,false);renderer.render(venueScene(town,selectedAngle===4),lens);
}
mapStage.addEventListener('pointerdown',event=>{
  if(mapView!=='views'||!venueRenderer||event.button!==0)return;
  venueDrag={x:event.clientX,y:event.clientY};mapStage.setPointerCapture(event.pointerId);
});
mapStage.addEventListener('pointermove',event=>{
  if(!venueDrag||!venueRenderer)return;
  venueRenderer.azimuth-=(event.clientX-venueDrag.x)*.009;
  venueRenderer.elevation+= (event.clientY-venueDrag.y)*.005;
  venueDrag={x:event.clientX,y:event.clientY};drawVenueView();
});
for(const type of ['pointerup','pointercancel'])mapStage.addEventListener(type,()=>{venueDrag=null;});


const athleteKey='aqua26-athlete-v2';
const athleteDefaults={
  skin:'#ba8567',eyes:'#675045',hair:'#342721',hairStyle:'Side part',
  faceWidth:1,faceHeight:1,jaw:1,nose:1,mouth:1,brows:1,eyeSize:1,eyeSpacing:1,
  heightCm:178,weightKg:76,shoulders:1,armBuild:1,handSize:1,
  headwear:'Cap',number:9,cap:'#284987',capPattern:'Classic',trim:'#d9ebde',goggles:false,tape:false,
  suitStyle:'Brief',suit:'#1b3854',warmup:'#255873',warmupBottom:'#27323d'
};
const levelSlider=(key,label,min=.78,max=1.24)=>({key,label,type:'range',min,max,step:.01});
const colorField=(key,label)=>({key,label,type:'color'});
const selectField=(key,label,options)=>({key,label,type:'select',options});
const toggleField=(key,label)=>({key,label,type:'checkbox'});
const athleteFields={
  Face:[
    colorField('skin','Skin tone'),colorField('eyes','Eye color'),colorField('hair','Hair color'),
    selectField('hairStyle','Hair style',['Side part','Sweep left','Buzz cut','Curls','Tied back','Shaved']),
    levelSlider('faceWidth','Face width',.86,1.13),levelSlider('faceHeight','Face length',.87,1.15),
    levelSlider('jaw','Jaw width'),levelSlider('nose','Nose width'),levelSlider('mouth','Mouth width'),
    levelSlider('eyeSize','Eye size',.82,1.2),levelSlider('eyeSpacing','Eye spacing',.86,1.14),levelSlider('brows','Brow thickness',.65,1.65)
  ],
  Build:[
    {key:'heightCm',label:'Height (cm)',type:'number',min:140,max:220,step:1},
    {key:'weightKg',label:'Weight (kg)',type:'number',min:40,max:150,step:1},
    levelSlider('shoulders','Shoulder width',.86,1.16),
    levelSlider('armBuild','Arm build',.88,1.15),levelSlider('handSize','Hand size',.85,1.13),
    colorField('warmup','Campus shirt'),colorField('warmupBottom','Campus trousers')
  ],
  Gear:[
    selectField('headwear','Headwear',['Cap','Bare head']),{key:'number',label:'Cap number',type:'number',min:1,max:99,step:1},
    colorField('cap','Cap color'),selectField('capPattern','Cap pattern',['Classic','Dual stripe','Crown panel']),
    colorField('trim','Trim color'),toggleField('goggles','Goggles'),toggleField('tape','Nose tape'),
    selectField('suitStyle','Swimwear',['Brief','Jammer','Training suit']),colorField('suit','Swimwear color')
  ]
};
function sanitizeAthlete(appearance) {
  const parsed={...athleteDefaults};
  if(!Number.isFinite(appearance?.heightCm)&&Number.isFinite(appearance?.height)){
    appearance={...appearance,heightCm:Math.round(appearance.height*athleteDefaults.heightCm)};
  }
  for(const field of Object.values(athleteFields).flat()){
    const {key,type}=field,value=appearance?.[key];
    if(type==='color'&&typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value))parsed[key]=value;
    if(type==='select'&&field.options.includes(value))parsed[key]=value;
    if(type==='checkbox'&&typeof value==='boolean')parsed[key]=value;
    if((type==='range'||type==='number')&&typeof value==='number'&&Number.isFinite(value)) {
      const v=type==='number'?Math.round(value):value;
      parsed[key]=THREE.MathUtils.clamp(v,field.min,field.max);
    }
  }
  return parsed;
}
let athleteLook=sanitizeAthlete(readSaved(athleteKey,athleteDefaults)), athleteDraft={...athleteLook};
let studioReturn='view-home', studioCategory='Gear', studioAction='Hold ball', studioState=null;
let studioTime=0, studioRefresh=0;
const studioMoves=['Tread','Swim','Hold ball','Throw','Cycle'];
function releaseSkeletons(model) {
  model?.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.dispose?.();});
}
function setCampaignAthlete() {
  const old=pUser;
  pUser=createDetailedHumanoid(true,null,null,null,null,{look:athleteLook});
  athleteRoot.remove(old);releaseSkeletons(old);
  athleteRoot.add(pUser);
  const previous=pUserMatch.mesh;
  const swimmer=createDetailedHumanoid(false,null,null,null,null,{look:athleteLook});
  swimmer.position.copy(previous.position);
  swimmer.rotation.copy(previous.rotation);
  swimmer.visible=previous.visible;
  scene.remove(previous);releaseSkeletons(previous);scene.add(swimmer);
  pUserMatch.mesh=swimmer;pUserMatch.rig=swimmer.rig;
  invalidateAthletePreview();
}
function configureStudioFields() {
  const nav=element('studio-tabs');
  nav.replaceChildren(...Object.keys(athleteFields).map(name=>{
    const button=uiButton(name,()=>{studioCategory=name;configureStudioFields();queueStudioAthlete();});
    button.setAttribute('aria-pressed',String(name===studioCategory));return button;
  }));
  const body=element('studio-fields');
  body.replaceChildren(...athleteFields[studioCategory].map(field=>{
    const label=document.createElement('label'), caption=document.createElement('span');
    label.className='studio-field';caption.textContent=field.label;
    const input=document.createElement(field.type==='select'?'select':'input');
    if(field.type==='select') {
      for(const choice of field.options){const option=document.createElement('option');option.value=option.textContent=choice;input.append(option);}
    }else{
      input.type=field.type;
      if(field.min!==undefined){input.min=field.min;input.max=field.max;input.step=field.step;}
    }
    if(field.type==='checkbox')input.checked=athleteDraft[field.key];
    else input.value=athleteDraft[field.key];
    input.addEventListener('input',()=>{
      if((field.type==='number'||field.type==='range')&&!Number.isFinite(input.valueAsNumber))return;
      const value=field.type==='checkbox'?input.checked:(field.type==='number'||field.type==='range')?input.valueAsNumber:input.value;
      athleteDraft=sanitizeAthlete({...athleteDraft,[field.key]:value});
      element('studio-status').textContent='';
      queueStudioAthlete();
    });
    if(field.type==='number')input.addEventListener('change',()=>{input.value=athleteDraft[field.key];});
    label.append(caption,input);return label;
  }));
}
function configureStudioMoves() {
  element('studio-motion').replaceChildren(...studioMoves.map(move=>{
    const button=uiButton(move,()=>{
      studioAction=move;studioTime=clock.elapsedTime;configureStudioMoves();
    });
    button.setAttribute('aria-pressed',String(move===studioAction));return button;
  }));
}
function resetAthleteDraft() {
  athleteDraft={...athleteDefaults};configureStudioFields();queueStudioAthlete();
  element('studio-status').textContent='Defaults loaded. Save to keep them.';
}
function commitAthleteDraft() {
  athleteLook=sanitizeAthlete(athleteDraft);setCampaignAthlete();
  const saved=writeSaved(athleteKey,athleteLook);
  element('studio-status').textContent=saved?'Athlete saved.':'Athlete applied for this session.';
}
function closeAthleteStudio() {
  navigateTo(studioReturn);
}
function frameAthleteStudio() {
  const narrow=window.innerWidth<=720;
  controls.target.set(narrow?.12:.49,narrow?.63:1.01,.03);
  camera.position.set(narrow?.67:.94,narrow?1.78:1.96,narrow?3.95:4.30);
  controls.update();
}
function setupStudioPool() {
  const group=new THREE.Group(), y=1, floorY=-.96;
  const waterGeometry=new THREE.PlaneGeometry(15,11,55,44);
  waterGeometry.rotateX(-Math.PI/2);
  const waterSurface=meshPart(group,waterGeometry,
    new THREE.MeshStandardMaterial({color:0x167891,roughness:.23,metalness:.08,transparent:true,opacity:.61,depthWrite:false}),
    0,y,0);
  waterSurface.renderOrder=3;
  const lining=surface(0x2d879c,.43), tile=surface(0x619296,.58);
  meshPart(group,unitBox,lining,0,floorY-.05,0,15,.10,11);
  const wallHeight=y-floorY+.04, wallCenter=floorY+wallHeight/2;
  for(const x of [-7.6,7.6])meshPart(group,unitBox,tile,x,wallCenter,0,.30,wallHeight,11.2);
  meshPart(group,unitBox,tile,0,wallCenter,-5.6,15.3,wallHeight,.31);
  meshPart(group,unitBox,surface(0xb0bec2),0,1.025,-6.35,16,.16,1.7);
  meshPart(group,unitBox,surface(0x284355),0,3.65,-7.08,19,5.25,.3);
  for(let bay=-6;bay<=6;bay++){
    meshPart(group,unitBox,surface(0x49798d,.32),bay*1.52,3.29,-6.86,1.22,2.65,.10);
    meshPart(group,unitBox,surface(0xa6bdbe),bay*1.52,3.95,-6.79,1.20,.065,.05);
  }
  for(let lane=-3;lane<=3;lane++){
    meshPart(group,unitBox,surface(0x1b5371),lane*1.85,floorY+.011,0,.11,.015,10.6);
    for(let z=-5;z<=5;z+=.52)meshPart(group,unitBox,tile,lane*1.85+.02,floorY+.017,z,1.81,.008,.012);
  }
  const ropeMaterial=[surface(0xcb714c,.42),surface(0xe2d3a4,.45)];
  for(const x of [-1.73,1.70])for(let step=0;step<27;step++){
    const z=-5.18+step*.39;
    oval(group,ropeMaterial[step%2],x,y+.018,z,.058,.05,.163);
  }
  const light=new THREE.PointLight(0xa8dfff,.45,11);
  light.position.set(1.5,3.9,2.1);group.add(light);
  const ball=oval(group,surface(0xf2bd55,.50),0,0,0,.118,.118,.118);
  const ballBand=new THREE.TorusGeometry(.113,.006,7,32);
  meshPart(ball,ballBand,surface(0xc57943),0,0,0,1/.118,1/.118,1/.118).rotation.y=Math.PI/2;
  meshPart(ball,ballBand,surface(0xe7e2bc),0,0,0,1/.118,1/.118,1/.118).rotation.x=Math.PI/2;
  const foam=new THREE.TorusGeometry(1,.026,6,36);
  const ripple=Array.from({length:3},()=>{
    const material=new THREE.MeshBasicMaterial({color:0xb2eef0,transparent:true,opacity:.24,depthWrite:false});
    const ring=meshPart(group,foam,material,0,y+.02,0);
    ring.rotation.x=-Math.PI/2;ring.renderOrder=4;return ring;
  });
  const drops=Array.from({length:13},()=>oval(group,surface(0x95d5e1,.29),0,y,0,.018,.029,.018));
  scene.add(group);
  studioState={group,y,floorY,footBounds:new THREE.Box3(),waterGeometry,ball,ripple,drops,model:null,holdPoint:new THREE.Vector3(),lastMotion:null};
}
function rebuildStudioAthlete() {
  if(!studioState)return;
  const previous=studioState.model;
  if(previous){studioState.group.remove(previous);releaseSkeletons(previous);}
  const look=studioCategory==='Face'?{...athleteDraft,headwear:'Bare head',goggles:false,tape:false}:athleteDraft;
  studioState.model=createDetailedHumanoid(false,null,null,null,null,{look});
  studioState.group.add(studioState.model);
}
function queueStudioAthlete() {
  if(studioRefresh)return;
  studioRefresh=requestAnimationFrame(()=>{
    studioRefresh=0;
    if(activeScreen==='view-customizer')rebuildStudioAthlete();
  });
}
function openAthleteStudio(previous) {
  studioReturn=previous==='view-profile'?'view-profile':'view-home';
  athleteDraft={...athleteLook};studioAction='Hold ball';studioTime=clock.elapsedTime;
  element('studio-status').textContent='';
  if(!studioState)setupStudioPool();
  studioState.group.visible=true;
  rebuildStudioAthlete();configureStudioFields();configureStudioMoves();frameAthleteStudio();
}
function hideAthleteStudio() {
  if(!studioState)return;
  studioState.group.visible=false;
  if(studioState.model){
    studioState.group.remove(studioState.model);releaseSkeletons(studioState.model);studioState.model=null;
  }
}
function updateAthleteStudio(time) {
  if(!studioState?.model)return;
  const {y,waterGeometry,ball,ripple,drops,model,holdPoint}=studioState;
  const running=Math.max(0,time-studioTime);
  const act=studioAction==='Cycle'?studioMoves[Math.floor(running/5)%4]:studioAction;
  const elapsed=studioAction==='Cycle'?running%5:running;
  const phase=elapsed*(act==='Swim'?4.6:3.2), {leftArm,rightArm,leftLeg,rightLeg,headGroup}=model.rig;
  const bob=Math.sin(phase)*.033;
  const scale=model.scale.y;
  model.position.set(0,y-1.29*scale+bob,0);
  model.rotation.set(0,-.15,Math.sin(phase)*.045);
  rightArm.rotation.set(.27+Math.sin(phase)*.18,0,1.14);
  leftArm.rotation.set(.24+Math.cos(phase)*.18,0,-1.14);
  rightArm.fore.rotation.set(-.62,0,.17);
  leftArm.fore.rotation.set(-.62,0,-.17);
  rightArm.hand.rotation.x=leftArm.hand.rotation.x=-.18;
  leftLeg.rotation.set(Math.cos(phase)*.28-.25,0,-.17);
  rightLeg.rotation.set(Math.sin(phase)*.28-.25,0,.17);
  leftLeg.shin.rotation.x=Math.max(0,Math.sin(phase))*1.13;
  rightLeg.shin.rotation.x=Math.max(0,Math.cos(phase))*1.13;
  headGroup.rotation.set(-.08,Math.sin(phase*.5)*.16,0);
  const throwing=act==='Throw', sequence=elapsed%3.8;
  const released=throwing&&sequence>=1.12;
  const holding=act==='Hold ball'||throwing;
  if(act==='Swim'){
    model.position.set(Math.sin(elapsed*.67)*.32,y-.42*scale+bob*.35,Math.sin(elapsed*.94)*.34);
    model.rotation.set(1.27,Math.sin(elapsed*.73)*.68,Math.sin(phase)*.09);
    headGroup.rotation.set(-.68,Math.sin(phase)*.19,0);
    rightArm.rotation.set(phase,0,.23);leftArm.rotation.set(phase+Math.PI,0,-.23);
    rightArm.fore.rotation.x=-.37-Math.max(0,Math.sin(phase))*.65;
    leftArm.fore.rotation.x=-.37-Math.max(0,Math.sin(phase+Math.PI))*.64;
    leftLeg.rotation.x=Math.sin(phase*2.1)*.34;rightLeg.rotation.x=-leftLeg.rotation.x;
    leftLeg.shin.rotation.x=.18;rightLeg.shin.rotation.x=.18;
  }else if(holding){
    const wind=throwing?Math.min(1,sequence/1.12):0;
    const launch=throwing?THREE.MathUtils.clamp((sequence-1.12)*4,0,1):0;
    model.position.y+=.07+.11*wind*(1-launch);
    rightArm.rotation.set(-.55+.59*wind-2.04*launch,0,1.05+.89*wind+.16*launch);
    rightArm.fore.rotation.set(-1.45+.35*wind+.85*launch,0,.38-.32*launch);
    rightArm.hand.rotation.x=-.18-.55*launch;
    headGroup.rotation.y=.21;
  }
  model.updateMatrixWorld(true);
  const {footBounds,floorY}=studioState;
  footBounds.makeEmpty().expandByObject(leftLeg.foot).expandByObject(rightLeg.foot);
  if(footBounds.min.y<floorY+.014){
    model.position.y+=floorY+.014-footBounds.min.y;
    model.updateMatrixWorld(true);
  }
  ball.visible=holding&&(!released||sequence<2.32);
  if(ball.visible){
    if(!released||studioState.lastMotion!==act) {
      rightArm.hand.localToWorld(holdPoint.set(.015,-.112,.071));ball.position.copy(holdPoint);
    } else {
      const fly=Math.min(1,(sequence-1.12)/1.2);
      ball.position.set(holdPoint.x-fly*4.8,holdPoint.y+.58*Math.sin(Math.PI*fly)-fly*.16,holdPoint.z-fly*3.65);
    }
    ball.rotation.y=time*.87;
  }
  studioState.lastMotion=act;
  const xyz=waterGeometry.getAttribute('position');
  for(let i=0;i<xyz.count;i++){
    const x=xyz.getX(i),z=xyz.getZ(i),distance=Math.hypot(x-model.position.x,z-model.position.z);
    const near=Math.exp(-distance*1.92)*.025;
    xyz.setY(i,Math.sin(x*3+time*2.5)*.012+Math.cos(z*4+x+time*3)*.012+near*Math.sin(distance*17-time*8));
  }
  xyz.needsUpdate=true;waterGeometry.computeVertexNormals();
  ripple.forEach((ring,index)=>{
    const wave=(time*(act==='Swim'?.83:.57)+index/3)%1;
    ring.position.set(model.position.x,y+.015,model.position.z);
    ring.scale.setScalar(.16+wave*.9);ring.material.opacity=(1-wave)*.19;
  });
  drops.forEach((drop,index)=>{
    const splash=(time*1.8+index*.093)%1, angle=index*2.39;
    drop.visible=(act==='Swim'||throwing)&&splash<.63;
    drop.position.set(model.position.x+Math.cos(angle)*(.23+splash*.41),y+Math.sin(splash*Math.PI)*(.09+index*.009),
      model.position.z+Math.sin(angle)*(.21+splash*.28));
  });
}

function closeHomeSections(except=null) {
  document.querySelectorAll('.aqua-home-section[open]').forEach(section=>{if(section!==except)section.open=false;});
}
document.querySelectorAll('.aqua-home-section').forEach(section=>{
  section.addEventListener('toggle',()=>{if(section.open)closeHomeSections(section);});
});
element('view-home').addEventListener('keydown',event=>{if(event.key==='Escape')closeHomeSections();});
element('view-home').addEventListener('pointerdown',event=>{if(!event.target.closest('.aqua-home-section'))closeHomeSections();});

setCampaignAthlete();
navigateAddress();
animate();


let creditsScene=null, creditsReturn='view-home';
function leaveCredits() {navigateTo(creditsReturn);}
function openCreditsScene(previous) {
  creditsReturn=previous==='view-profile'?'view-profile':'view-home';
  if(creditsScene)return;
  const mount=element('credits-swimmer');
  try{
    const view=new THREE.WebGLRenderer({alpha:true,antialias:true});
    view.outputEncoding=THREE.sRGBEncoding;view.toneMapping=THREE.ACESFilmicToneMapping;
    view.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    const frame=new THREE.Scene(), camera=new THREE.PerspectiveCamera(38,1,.1,20);
    addPreviewLights(frame);
    const athlete=createDetailedHumanoid(false,null,null,null,null,{look:athleteLook});
    athlete.rig.rightArm.rotation.set(-.44,0,1.23);
    athlete.rig.rightArm.fore.rotation.set(-.97,0,.50);
    const ball=oval(athlete.rig.rightArm.hand,surface(0xedbc58,.47),.024,-.109,.079,.119,.119,.119);
    ball.name='Celebration ball';
    frame.add(athlete);
    camera.position.set(.52,1.31,2.98);camera.lookAt(0,.96,0);
    const fit=()=>{
      const w=mount.clientWidth,h=mount.clientHeight;
      if(!w||!h)return;
      camera.aspect=w/h;camera.updateProjectionMatrix();view.setSize(w,h,false);
    };
    const resize=new ResizeObserver(fit);
    mount.append(view.domElement);resize.observe(mount);fit();
    creditsScene={view,frame,camera,athlete,resize};
  }catch{mount.textContent='Aqua 26 · Water Polo';}
}
function drawCreditsScene(time) {
  if(!creditsScene)return;
  const {view,frame,camera,athlete}=creditsScene;
  const slow=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:time;
  athlete.rotation.y=Math.sin(slow*.64)*.37;
  athlete.rig.headGroup.rotation.y=Math.sin(slow*.79)*.19;
  athlete.rig.leftArm.rotation.x=Math.cos(slow*1.52)*.10;
  view.render(frame,camera);
}
function closeCreditsScene() {
  if(!creditsScene)return;
  creditsScene.resize.disconnect();
  releaseSkeletons(creditsScene.athlete);
  creditsScene.view.dispose();
  creditsScene.view.forceContextLoss();
  element('credits-swimmer').replaceChildren();
  creditsScene=null;
}
