
// ── Constants ──────────────────────────────────────────────────────────
const API_URL    = '/api/vehicles';
const REFRESH_MS = 15000;

const ALERT_EFFECTS = {
  1:'No Service',2:'Reduced Service',3:'Significant Delays',
  4:'Detour',5:'Additional Service',6:'Modified Service',7:'Other Effect',8:'Unknown Effect'
};

// ── Route data ─────────────────────────────────────────────────────────
const ROUTES=[
  ['train','Belgrave',    '#094c8d','Belgrave Line',    [[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8116,145.2276],[-37.8603,145.3556]]],
  ['train','Glen Waverley','#094c8d','Glen Waverley Line',[[-37.8183,144.9671],[-37.8274,145.0118],[-37.8432,145.0693],[-37.8701,145.1146],[-37.8786,145.1644]]],
  ['train','Lilydale',    '#094c8d','Lilydale Line',    [[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8116,145.2276],[-37.7578,145.3568]]],
  ['train','Alamein',     '#094c8d','Alamein Line',     [[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8381,145.0769],[-37.8518,145.0981]]],
  ['train','Frankston',   '#159943','Frankston Line',   [[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9210,145.0740],[-37.9710,145.0942],[-38.1391,145.1232]]],
  ['train','Cranbourne',  '#8b1a4a','Cranbourne Line',  [[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9841,145.1282],[-38.0652,145.2847],[-38.1133,145.3485]]],
  ['train','Pakenham',    '#8b1a4a','Pakenham Line',    [[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9841,145.1282],[-38.0480,145.3956],[-38.0724,145.4897]]],
  ['train','Sandringham', '#f178af','Sandringham Line', [[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9090,144.9980],[-37.9504,145.0091]]],
  ['train','Werribee',    '#159943','Werribee Line',    [[-37.8183,144.9671],[-37.8047,144.9426],[-37.8440,144.8788],[-37.8671,144.7769],[-37.9014,144.6604]]],
  ['train','Williamstown','#159943','Williamstown Line',[[-37.8183,144.9671],[-37.8047,144.9426],[-37.8440,144.8788],[-37.8640,144.8950]]],
  ['train','Sunbury',     '#fc7f1e','Sunbury Line',     [[-37.8183,144.9671],[-37.8183,144.9526],[-37.7994,144.9293],[-37.7871,144.8310],[-37.5774,144.7275]]],
  ['train','Craigieburn', '#fc7f1e','Craigieburn Line', [[-37.8183,144.9671],[-37.8047,144.9426],[-37.7994,144.9293],[-37.6815,144.9176],[-37.6025,144.9463]]],
  ['train','Upfield',     '#fc7f1e','Upfield Line',     [[-37.8183,144.9671],[-37.8047,144.9426],[-37.7994,144.9293],[-37.7407,144.9641],[-37.6422,144.9536]]],
  ['train','Mernda',      '#e1261c','Mernda Line',      [[-37.8183,144.9671],[-37.7921,144.9987],[-37.7596,145.0285],[-37.7096,145.0535],[-37.6012,145.0886]]],
  ['train','Hurstbridge', '#e1261c','Hurstbridge Line', [[-37.8183,144.9671],[-37.7921,144.9987],[-37.7596,145.0285],[-37.7096,145.0535],[-37.6795,145.1545],[-37.6283,145.1805]]],
  ['tram','Route 96',  '#f5a800','Route 96',  [[-37.8649,144.9785],[-37.8388,144.9800],[-37.8183,144.9671],[-37.8094,144.9671],[-37.7751,144.9789]]],
  ['tram','Route 19',  '#00b5e2','Route 19',  [[-37.7320,144.9601],[-37.7720,144.9630],[-37.8094,144.9671],[-37.8183,144.9671]]],
  ['tram','Route 86',  '#f5a800','Route 86',  [[-37.7087,145.0148],[-37.7610,144.9850],[-37.8070,144.9810],[-37.8183,144.9671]]],
  ['tram','Route 57',  '#00b5e2','Route 57',  [[-37.7628,144.8845],[-37.8000,144.9220],[-37.8140,144.9526],[-37.8183,144.9671]]],
  ['tram','Route 48',  '#00b5e2','Route 48',  [[-37.8085,145.0570],[-37.8094,145.0290],[-37.8094,144.9730],[-37.8094,144.9430]]],
  ['tram','Route 70',  '#e1261c','Route 70',  [[-37.8214,144.9443],[-37.8183,144.9671],[-37.8230,144.9921],[-37.8390,145.0760]]],
  ['tram','Route 109', '#e1261c','Route 109', [[-37.8183,144.9526],[-37.8183,144.9671],[-37.8280,145.0280],[-37.8280,145.1000]]],
  ['tram','Route 112', '#f5a800','Route 112', [[-37.7455,144.9777],[-37.7950,144.9700],[-37.8094,144.9671],[-37.8390,144.9671]]],
  ['tram','Route 1',   '#78be20','Route 1',   [[-37.8700,144.9580],[-37.8300,144.9666],[-37.8183,144.9671],[-37.7894,144.9698]]],
  ['tram','Route 75',  '#e1261c','Route 75',  [[-37.8630,145.1210],[-37.8290,145.0240],[-37.8183,144.9730],[-37.8183,144.9526]]],
  ['tram','Route 59',  '#00b5e2','Route 59',  [[-37.7220,144.8830],[-37.7720,144.9170],[-37.8094,144.9526]]],
  ['bus','Route 246',  '#7b5ea7','Route 246', [[-37.8000,144.9580],[-37.8140,144.9350],[-37.8280,144.9100]]],
  ['bus','Route 605',  '#009b77','Route 605', [[-37.8094,144.9629],[-37.7750,145.0450],[-37.7930,145.1218]]],
  ['bus','Route 750',  '#009b77','Route 750', [[-37.8769,145.0238],[-37.9050,145.1100],[-37.9250,145.1650]]],
  ['bus','Route 901',  '#d4a017','Route 901', [[-37.8769,145.0238],[-37.9841,145.1282],[-38.1145,145.1212]]],
  ['bus','Route 902',  '#d4a017','Route 902', [[-37.7839,144.8781],[-37.8794,144.8608],[-37.9301,144.8952]]],
  ['bus','Route 903',  '#d4a017','Route 903', [[-37.7839,144.8781],[-37.8769,145.0238],[-37.9841,145.1282]]],
  ['bus','Route 302',  '#7b5ea7','Route 302', [[-37.8183,144.9671],[-37.8183,145.0500],[-37.8182,145.1428]]],
  ['bus','Route 401',  '#7b5ea7','Route 401', [[-37.8183,144.9671],[-37.8600,144.9840],[-37.8769,145.0238]]],
];

const STATIONS=[
  {name:'Flinders Street', lat:-37.8182,lng:144.9671,type:'train',color:'#094c8d'},
  {name:'Southern Cross',  lat:-37.8183,lng:144.9526,type:'train',color:'#094c8d'},
  {name:'Melbourne Central',lat:-37.8098,lng:144.9631,type:'train',color:'#094c8d'},
  {name:'Flagstaff',       lat:-37.8116,lng:144.9572,type:'train',color:'#094c8d'},
  {name:'Parliament',      lat:-37.8114,lng:144.9730,type:'train',color:'#094c8d'},
  {name:'Richmond',        lat:-37.8244,lng:144.9987,type:'train',color:'#094c8d'},
  {name:'North Melbourne', lat:-37.8047,lng:144.9426,type:'train',color:'#094c8d'},
  {name:'Footscray',       lat:-37.8019,lng:144.8993,type:'train',color:'#094c8d'},
  {name:'Caulfield',       lat:-37.8769,lng:145.0238,type:'train',color:'#8b1a4a'},
  {name:'Clayton',         lat:-37.9210,lng:145.1202,type:'train',color:'#8b1a4a'},
  {name:'Box Hill',        lat:-37.8196,lng:145.1228,type:'train',color:'#094c8d'},
  {name:'Camberwell',      lat:-37.8274,lng:145.0588,type:'train',color:'#094c8d'},
  {name:'Dandenong',       lat:-37.9841,lng:145.2161,type:'train',color:'#8b1a4a'},
  {name:'Frankston',       lat:-38.1391,lng:145.1232,type:'train',color:'#159943'},
  {name:'Werribee',        lat:-37.9014,lng:144.6604,type:'train',color:'#159943'},
  {name:'Sunshine',        lat:-37.7871,lng:144.8310,type:'train',color:'#fc7f1e'},
  {name:'Broadmeadows',    lat:-37.6815,lng:144.9176,type:'train',color:'#fc7f1e'},
  {name:'Ringwood',        lat:-37.8116,lng:145.2276,type:'train',color:'#094c8d'},
  {name:'St Kilda',        lat:-37.8649,lng:144.9785,type:'tram', color:'#f5a800'},
  {name:'Melbourne Zoo',   lat:-37.7839,lng:144.9507,type:'tram', color:'#f5a800'},
  {name:'Docklands',       lat:-37.8181,lng:144.9433,type:'tram', color:'#f5a800'},
  {name:'South Melbourne Market',lat:-37.8380,lng:144.9522,type:'tram',color:'#f5a800'},
];

// ── Avatar / Session ───────────────────────────────────────────────────
const AVATAR_EMOJIS = ['🌸','⭐','🌙','🌊','🍄','🌿','🦋','✨','🎀','🍀','🎵','🌈','🍭','🦊','🐨'];
const TRAIN_ABBREVS = {
  'Belgrave':'BV','Glen Waverley':'GW','Lilydale':'LY','Alamein':'AM',
  'Frankston':'FK','Cranbourne':'CR','Pakenham':'PK','Sandringham':'SN',
  'Werribee':'WB','Williamstown':'WT','Sunbury':'SB','Craigieburn':'CG',
  'Upfield':'UF','Mernda':'MR','Hurstbridge':'HB'
};
function getRouteLabel(v){
  if(!v) return '';
  if(v.mode==='bus') return String(v.label||'').replace(/^Bus\s*/i,'').slice(0,5);
  if(v.mode==='tram') return String(v.label||'').replace(/^Tram\s*/i,'').slice(0,4);
  if(v.mode==='train'||v.mode==='vline'){
    const abbr=TRAIN_ABBREVS[v.line];
    if(abbr) return abbr;
    return String(v.line||'').slice(0,2).toUpperCase();
  }
  return '';
}
const AVATAR_COLORS = ['#ff6b6b','#ffd166','#06d6a0','#118ab2','#9b5de5','#f15bb5','#00bbf9','#ffb347','#4ecdc4','#ff8fab'];
let sessionAvatar = null;
let ghostMode = false;

function loadAvatar(){
  let stored = null;
  try{ stored = JSON.parse(localStorage.getItem('tl-avatar')); }catch(e){}
  if(!stored){
    stored = {
      emoji: AVATAR_EMOJIS[Math.floor(Math.random()*AVATAR_EMOJIS.length)],
      bg:    AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)],
      id:    Math.random().toString(36).slice(2,10)
    };
    localStorage.setItem('tl-avatar', JSON.stringify(stored));
  }
  sessionAvatar = stored;
  const el = document.getElementById('hdr-avatar');
  el.textContent = stored.emoji;
  el.style.background = stored.bg;
  el.style.color = '#fff';
}

function getUserId(){
  if(ghostMode) return 'ghost_' + (sessionAvatar?.id||'anon');
  return sessionAvatar?.id || 'anon';
}

function loadGhostMode(){
  ghostMode = localStorage.getItem('tl-ghost') === '1';
  document.getElementById('ghost-btn').classList.toggle('active', ghostMode);
}

function toggleGhost(){
  ghostMode = !ghostMode;
  localStorage.setItem('tl-ghost', ghostMode ? '1' : '0');
  document.getElementById('ghost-btn').classList.toggle('active', ghostMode);
  showToast(ghostMode ? '👻 Ghost mode on — your location is hidden' : '👤 Ghost mode off');
}

// ── Onboarding ─────────────────────────────────────────────────────────
const OB_STEPS = [
  {illo:'🚆', title:"Welcome to Transit-Live!", desc:"Melbourne's cutest real-time transit tracker. See every vehicle, live."},
  {illo:'🗺️', title:"See every vehicle live",   desc:"Trains, trams, buses and V/Line — all moving in real-time on your map."},
  {illo:'📣', title:"Report & share vibes",     desc:"Spot a ticket inspector? Share good vibes? Tap the red button to report."},
];
let obStep = 0;

function showOnboarding(){
  obStep = 0;
  renderObStep();
  document.getElementById('onboarding').classList.add('show');
}

function renderObStep(){
  const s = OB_STEPS[obStep];
  document.getElementById('ob-illo').textContent = s.illo;
  document.getElementById('ob-title').textContent = s.title;
  document.getElementById('ob-desc').textContent = s.desc;
  document.getElementById('ob-next').textContent = obStep < 2 ? 'Next →' : "Let's go! 🚆";
  [0,1,2].forEach(i=>{
    document.getElementById('ob-d'+i).classList.toggle('active', i===obStep);
  });
}

document.getElementById('ob-next').addEventListener('click',()=>{
  if(obStep < 2){ obStep++; renderObStep(); }
  else dismissOnboarding();
});
document.getElementById('ob-skip').addEventListener('click', dismissOnboarding);

function dismissOnboarding(){
  localStorage.setItem('tl-onboarded','1');
  const el = document.getElementById('onboarding');
  el.classList.remove('show');
}

// ── Geolocation ────────────────────────────────────────────────────────
function locateUser(){
  return new Promise(resolve=>{
    if(!navigator.geolocation){ resolve(null); return; }
    const timer = setTimeout(()=>resolve(null), 5000);
    navigator.geolocation.getCurrentPosition(
      pos=>{
        clearTimeout(timer);
        resolve({lat:pos.coords.latitude, lng:pos.coords.longitude});
      },
      ()=>{ clearTimeout(timer); resolve(null); }
    );
  });
}

// ── Map ────────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: '/styles/maplibre-style.json',
  center: [144.9631, -37.8136],  // [lng, lat]
  zoom: 13,
  pitch: 45,
  bearing: -15,
  antialias: true
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.on('error', e => console.error('[MapLibre error]', e.error?.message || e));
map.on('load', () => {
  map.setFog({
    range: [2, 12],
    color: '#d4eef5',
    'horizon-blend': 0.08,
    'high-color': '#a8d8e8',
    'space-color': '#7ec8e3'
  });
});

// Track which marker IDs are currently added to the map
const markersOnMap = new Set();

// Returns a promise that resolves when the map is fully loaded (5s timeout)
function mapReady(){
  return new Promise(resolve=>{
    if(map.loaded()){ resolve(); return; }
    const done = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(done, 5000);
    map.once('load', done);
  });
}


// ── Route polylines → Mapbox GeoJSON sources ───────────────────────────
const routePolylines={}; // stores source-id strings for compat
function buildRouteSources(){
  ROUTES.forEach(([mode,line,color,label,pts])=>{
    const id = 'route-'+line.replace(/\s+/g,'-');
    const weight  = mode==='train'?3.5:mode==='tram'?2.5:1.5;
    const opacity = mode==='bus'?0.3:0.45;
    map.addSource(id,{
      type:'geojson',
      data:{type:'Feature',geometry:{type:'LineString',
        coordinates:pts.map(p=>[p[1],p[0]])}}
    });
    map.addLayer({
      id, type:'line', source:id,
      layout:{'line-cap':'round','line-join':'round','visibility':'visible'},
      paint:{'line-color':color,'line-width':weight,'line-opacity':opacity}
    });
    routePolylines[line]=id;
  });
}
function syncRouteLines(){
  ROUTES.forEach(([mode,line])=>{
    const id=routePolylines[line]; if(!id||!map.getLayer(id)) return;
    const show=fModes.has(mode)&&fLines.has(line);
    map.setLayoutProperty(id,'visibility',show?'visible':'none');
  });
}

// ── Stations ───────────────────────────────────────────────────────────
function buildStations(){
  STATIONS.forEach(s=>{
    const el=document.createElement('div');
    el.className='station-dot';
    el.style.cssText=`background:${s.color};cursor:pointer`;
    el.title=s.name;
    new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([s.lng,s.lat]).addTo(map);
  });
}

// ── User location + proximity ──────────────────────────────────────────
let userLoc = null;
let userLocMarker = null;
let userAccCircle = null;

function haversine(lat1,lng1,lat2,lng2){
  const R=6371000,d2r=Math.PI/180;
  const dLat=(lat2-lat1)*d2r,dLng=(lng2-lng1)*d2r;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function getVisibleRadius(){
  const z=map.getZoom();
  if(z>=16) return 800;
  if(z>=14) return 2000;
  if(z>=12) return 5000;
  return Infinity;
}

function passesProximity(v){
  if(!userLoc) return true;
  const r=getVisibleRadius();
  if(r===Infinity) return true;
  return haversine(userLoc.lat,userLoc.lng,v.lat,v.lng)<=r;
}

function makePinHTML(){
  // Use currentUser.avatar if available, else pulsing coral circle
  if(currentUser && currentUser.avatar){
    return `<div class="av-user-pin">${renderAvatarSVG(currentUser.avatar,56)}</div>`;
  }
  const savedAvatar = (() => {
    try{ return JSON.parse(localStorage.getItem('tl-avatar-cfg') || 'null'); }catch(e){ return null; }
  })();
  if(savedAvatar){
    return `<div class="av-user-pin">${renderAvatarSVG(savedAvatar,56)}</div>`;
  }
  return '<div class="user-loc-pin" style="width:20px;height:20px"></div>';
}
const PIN_SZ = 56; // avatar always 56px; fallback 20px handled via CSS
function placeUserPin(lat,lng){
  if(userLocMarker){
    userLocMarker.setLngLat([lng,lat]);
    userLocMarker.getElement().innerHTML=makePinHTML();
    return;
  }
  const el=document.createElement('div');
  el.innerHTML=makePinHTML();
  el.title='You are here 📍';
  userLocMarker=new maplibregl.Marker({element:el,anchor:'center'})
    .setLngLat([lng,lat]).addTo(map);
}
function refreshUserPin(){
  if(userLocMarker) userLocMarker.getElement().innerHTML=makePinHTML();
}

function startLocationWatch(){
  if(!navigator.geolocation) return;
  navigator.geolocation.watchPosition(pos=>{
    const lat=pos.coords.latitude, lng=pos.coords.longitude;
    userLoc={lat,lng};
    placeUserPin(lat,lng);
    updateNearestVehicle();
    if(destLoc && !journeyPolyline) updateJourneyLine();
  }, err=>console.warn('Watch error:', err.message),
  {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}

function flyToUser(){
  if(!userLoc){ showToast('📍 Location not found yet'); return; }
  map.flyTo({center:[userLoc.lng,userLoc.lat],zoom:16,duration:1000,essential:true});
  showToast('Found you! 📍');
}

function updateNearestVehicle(){
  const nearEl=document.getElementById('sb-nearest');
  if(!nearEl) return;
  if(!userLoc){
    nearEl.textContent='📍 Enable location for nearby info';
    return;
  }
  const mIco={train:'🚆',tram:'🚋',bus:'🚌',vline:'🚂'};
  let nearest=null,nearestDist=Infinity;
  vehicles.forEach(v=>{
    if(!passesFilter(v)) return;
    const d=haversine(userLoc.lat,userLoc.lng,v.lat,v.lng);
    if(d<nearestDist){nearestDist=d;nearest=v;}
  });
  // Clear old nearest
  document.querySelectorAll('.vm-wrap.nearest').forEach(el=>el.classList.remove('nearest'));
  if(!nearest){nearEl.textContent='No vehicles nearby';return;}
  const ico=mIco[nearest.mode]||'🚌';
  const dist=nearestDist>=1000?`${(nearestDist/1000).toFixed(1)}km`:`${Math.round(nearestDist)}m`;
  nearEl.innerHTML=`${ico} <strong>${escHtml(nearest.label)}</strong> · ${dist} away`;
  if(markers[nearest.id]){
    markers[nearest.id].getElement()?.querySelector('.vm-wrap')?.classList.add('nearest');
  }
}

// ── Filter state ───────────────────────────────────────────────────────
const fModes=new Set(['train','tram','bus','vline']);
const fLines=new Set(ROUTES.map(r=>r[1]));
let fSearch='';
let showAll=true;

function buildFilterPanel(){
  const body=document.getElementById('filter-body');
  body.innerHTML='';

  // Mode section
  const ml=document.createElement('div');
  ml.className='fp-section-label';
  ml.innerHTML='Mode <div class="fp-acts"><button class="fp-act" onclick="filterShowAll()">All</button><button class="fp-act" onclick="filterClearAll()">None</button></div>';
  body.appendChild(ml);

  [['train','🚆','Trains'],['tram','🚋','Trams'],['bus','🚌','Buses'],['vline','🚂','V/Line']].forEach(([mode,ico,name])=>{
    const row=document.createElement('div'); row.className='fp-mode-row';
    row.innerHTML=`<span class="fp-mode-ico">${ico}</span><div class="fp-mode-info"><div class="fp-mode-name">${name}</div><div class="fp-mode-cnt" id="fcnt-${mode}">0 vehicles</div></div><div class="fp-tog ${fModes.has(mode)?'on':''}" id="tog-${mode}"></div>`;
    row.addEventListener('click',()=>toggleMode(mode));
    body.appendChild(row);
  });

  const ll=document.createElement('div');
  ll.className='fp-section-label'; ll.textContent='Lines';
  body.appendChild(ll);

  ROUTES.forEach(([mode,line,color,label])=>{
    const row=document.createElement('div');
    row.className=`fp-line-row ${fLines.has(line)?'':'off'}`;
    row.id=`lr-${CSS.escape(line)}`;
    row.innerHTML=`<div class="fp-ldot" style="background:${color}"></div><span class="fp-lname">${label}</span><div class="fp-lchk ${fLines.has(line)?'on':''}" id="lc-${CSS.escape(line)}">✓</div>`;
    row.addEventListener('click',()=>toggleLine(line));
    body.appendChild(row);
  });
}

function toggleMode(mode){
  if(fModes.has(mode)) fModes.delete(mode); else fModes.add(mode);
  const tog=document.getElementById(`tog-${mode}`);
  if(tog) tog.className=`fp-tog ${fModes.has(mode)?'on':''}`;
  applyFilters();
}
function toggleLine(line){
  if(fLines.has(line)) fLines.delete(line); else fLines.add(line);
  const chk=document.getElementById(`lc-${CSS.escape(line)}`);
  const row=document.getElementById(`lr-${CSS.escape(line)}`);
  if(chk) chk.className=`fp-lchk ${fLines.has(line)?'on':''}`;
  if(row) row.className=`fp-line-row ${fLines.has(line)?'':'off'}`;
  applyFilters();
}
function filterShowAll(){
  ROUTES.forEach(([m,l])=>{fModes.add(m);fLines.add(l);});
  ['train','tram','bus','vline'].forEach(m=>fModes.add(m));
  buildFilterPanel(); applyFilters();
}
function filterClearAll(){
  fModes.clear(); fLines.clear();
  buildFilterPanel(); applyFilters();
}
// Base filter: mode/proximity/line checks, always used for journey candidate finding
function passesBaseFilter(v){
  if(!fModes.has(v.mode)) return false;
  if(!passesProximity(v)) return false;
  if(v._live) return true;
  return fLines.has(v.line);
}
// Display filter: always respects mode toggles; also gates on showAll or journey highlight
function passesFilter(v){
  if(!fModes.has(v.mode)) return false;      // mode toggles always honoured
  if(!passesProximity(v)) return false;
  if(!showAll && !journeyHighlightedIds.has(v.id)) return false; // search-first gate
  if(v._live) return true;
  return fLines.has(v.line);
}
function toggleShowAll(){
  showAll=!showAll;
  const btn=document.getElementById('show-all-btn');
  btn.textContent=showAll?'Hide All':'Show All';
  btn.classList.toggle('active',showAll);
  applyFilters();
}
function applyFilters(){
  vehicles.forEach(v=>{
    const m=markers[v.id]; if(!m) return;
    if(passesFilter(v)){
      if(!markersOnMap.has(v.id)){ m.addTo(map); markersOnMap.add(v.id); }
    } else {
      if(markersOnMap.has(v.id)){ m.remove(); markersOnMap.delete(v.id); }
    }
  });
  updateCounts(vehicles);
}
function updateFilterCounts(){
  const c={train:0,tram:0,bus:0,vline:0};
  vehicles.forEach(v=>{if(passesFilter(v))c[v.mode]++;});
  ['train','tram','bus','vline'].forEach(m=>{
    const el=document.getElementById(`fcnt-${m}`);
    if(el) el.textContent=`${c[m]} vehicle${c[m]!==1?'s':''}`;
  });
}

// ── Sheet management ───────────────────────────────────────────────────
const backdrop=document.getElementById('sheet-backdrop');
let activeSheet=null;

function openSheet(id){
  if(activeSheet&&activeSheet!==id) closeSheet(activeSheet);
  document.getElementById(id).classList.add('open');
  backdrop.classList.add('show');
  activeSheet=id;
  if(id==='alerts-sheet') renderAlerts();
}
function closeSheet(id){
  document.getElementById(id).classList.remove('open');
  backdrop.classList.remove('show');
  if(activeSheet===id) activeSheet=null;
}
function closeAllSheets(){
  document.querySelectorAll('.sheet.open').forEach(s=>s.classList.remove('open'));
  backdrop.classList.remove('show');
  activeSheet=null;
}

// Touch drag-to-dismiss on all sheets
document.querySelectorAll('.sheet').forEach(sheet=>{
  let startY=0, dragging=false;
  sheet.addEventListener('touchstart',e=>{
    startY=e.touches[0].clientY; dragging=true;
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    if(!dragging) return;
    const dy=e.touches[0].clientY-startY;
    if(dy>0) sheet.style.transform=
      window.innerWidth>=600
        ? `translateX(-50%) translateY(${dy}px)`
        : `translateY(${dy}px)`;
  },{passive:true});
  sheet.addEventListener('touchend',e=>{
    dragging=false;
    const dy=e.changedTouches[0].clientY-startY;
    sheet.style.transform='';
    if(dy>90) closeSheet(sheet.id);
  });
});

// ── SVG Vehicle characters ─────────────────────────────────────────────
// VB: native viewBox dimensions per mode (side-view, facing right)
const VB = {train:{w:80,h:36},vline:{w:80,h:36},tram:{w:72,h:40},bus:{w:68,h:44}};

// Official PTV tram green and bus amber — trains use v.color from ROUTES
const MODE_COLOR = {tram:'#2CA05A',bus:'#F5A623'};

// makeFaceSVG — anime/Tamagotchi style, 64×64 viewBox, sz = rendered px size
function makeFaceSVG(mode, delayed, color, sz, label){
  const c = color||'#5b8dee';
  const safeLabel = label ? String(label).replace(/[<>&"]/g,'').slice(0,6) : '';

  function makeEyes(ey){
    return `<circle cx="21" cy="${ey}" r="10" fill="white"/>
    <circle cx="43" cy="${ey}" r="10" fill="white"/>
    <circle cx="21" cy="${ey}" r="6" fill="#1a1a2e"/>
    <circle cx="43" cy="${ey}" r="6" fill="#1a1a2e"/>
    <circle cx="18.5" cy="${ey-3}" r="2.5" fill="white"/>
    <circle cx="40.5" cy="${ey-3}" r="2.5" fill="white"/>`;
  }
  function makeMouth(my){
    return delayed
      ? `<path d="M22 ${my+5} Q32 ${my-1} 42 ${my+5}" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
      : `<path d="M22 ${my} Q32 ${my+7} 42 ${my}" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  }
  function makeBrows(ey){
    if(!delayed) return '';
    return `<line x1="13" y1="${ey-13}" x2="22" y2="${ey-10}" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
    <line x1="51" y1="${ey-13}" x2="42" y2="${ey-10}" stroke="white" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`;
  }

  const base = `<rect x="0" y="0" width="64" height="64" rx="16" fill="white"/>
    <rect x="3" y="3" width="58" height="58" rx="13" fill="${c}"/>`;

  // ── TRAM – green, cream stripe lower body, pantograph bumps top ──
  if(mode==='tram'){
    const ey=32;
    const lbl = safeLabel
      ? `<text x="32" y="57" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="10" fill="rgba(0,0,0,0.65)">${safeLabel}</text>`
      : '';
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <rect x="18" y="3" width="10" height="6" rx="3" fill="rgba(255,255,255,0.7)"/>
      <rect x="36" y="3" width="10" height="6" rx="3" fill="rgba(255,255,255,0.7)"/>
      <rect x="3" y="45" width="58" height="16" rx="0" fill="rgba(255,248,200,0.42)"/>
      ${makeBrows(ey)}${makeEyes(ey)}${makeMouth(50)}${lbl}
    </svg>`;
  }

  // ── TRAIN – line color, window strip top, vent circles ──
  if(mode==='train'||mode==='vline'){
    const ey=34;
    const lbl = safeLabel
      ? `<rect x="0" y="50" width="64" height="14" fill="rgba(0,0,0,0.22)"/>
         <text x="32" y="60" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="9" fill="white">${safeLabel}</text>`
      : '';
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${base}
      <rect x="3" y="3" width="58" height="14" rx="13" fill="rgba(0,0,0,0.12)"/>
      <circle cx="18" cy="10" r="4.5" fill="rgba(0,0,0,0.18)"/>
      <circle cx="46" cy="10" r="4.5" fill="rgba(0,0,0,0.18)"/>
      ${makeBrows(ey)}${makeEyes(ey)}${makeMouth(52)}${lbl}
    </svg>`;
  }

  // ── BUS – amber, white windscreen lower half with route number ──
  const ey=27;
  const lbl = safeLabel
    ? `<text x="32" y="57" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="9" fill="${c}">${safeLabel}</text>`
    : '';
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    ${base}
    <rect x="8" y="42" width="48" height="19" rx="7" fill="rgba(255,255,255,0.88)"/>
    ${lbl}
    ${makeBrows(ey)}${makeEyes(ey)}${makeMouth(38)}
  </svg>`;
}

function makeInspectorSVG(){
  return `<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="24" height="8" rx="4" fill="#2d3561"/>
    <rect x="3" y="11" width="28" height="3" rx="1.5" fill="#2d3561"/>
    <rect x="13" y="7" width="8" height="2" rx="1" fill="#c0a030"/>
    <circle cx="17" cy="22" r="9" fill="#f5d0a0"/>
    <circle cx="13.5" cy="21" r="2" fill="#4a3020"/>
    <circle cx="20.5" cy="21" r="2" fill="#4a3020"/>
    <path d="M10 18.5 Q13.5 17 15.5 18.5" stroke="#4a3020" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M18.5 18.5 Q20.5 17 24 18.5" stroke="#4a3020" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M13 25.5 Q17 24.5 21 25.5" stroke="#7a5040" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <rect x="22" y="25" width="9" height="9" rx="2" fill="#fffbe6" stroke="#c0a030" stroke-width="1"/>
    <line x1="24" y1="28" x2="29" y2="28" stroke="#bbb" stroke-width="1"/>
    <line x1="24" y1="30" x2="29" y2="30" stroke="#bbb" stroke-width="1"/>
  </svg>`;
}

// ── makeMarkerEl — returns a DOM element for maplibregl.Marker ───────────
function getIconSz(){
  const z = map.getZoom ? map.getZoom() : 14;
  if(z >= 17) return 52;
  if(z === 16) return 44;
  if(z === 15) return 38;
  if(z === 14) return 32;
  if(z === 13) return 26;
  if(z === 12) return 20;
  return 16;
}

function makeMarkerEl(v){
  const delayed = v.delay>2;
  const sz = getIconSz();
  const color = MODE_COLOR[v.mode]||v.color||'#5b8dee';
  const glowCol = (delayed?'#ff6b6b':color)+'66';
  const seed = typeof v.id==='string'
    ? [...v.id].reduce((a,c)=>a+c.charCodeAt(0),0) : Number(v.id);
  const bobDelay = (seed*173)%2200;
  const isDot = sz <= 20;
  const el = document.createElement('div');
  if(isDot){
    el.innerHTML=`<div class="vm-wrap" style="width:${sz}px;height:${sz+6}px">
      <div class="vm-inner" style="animation-delay:${bobDelay}ms">
        <div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:2px solid white"></div>
      </div>
      <div class="vm-shadow" style="animation-delay:${bobDelay}ms"></div>
    </div>`;
  } else {
    const pad=4; const sq=sz+pad;
    const routeLabel = sz >= 32 ? getRouteLabel(v) : '';
    const svg=makeFaceSVG(v.mode,delayed,color,sz,routeLabel);
    el.innerHTML=`<div class="vm-wrap" style="width:${sq}px;height:${sq+8}px">
      <div class="vm-inner" style="animation-delay:${bobDelay}ms;filter:drop-shadow(0 2px 6px ${glowCol}) drop-shadow(0 3px 3px rgba(0,0,0,0.22))">
        ${svg}
      </div>
      <div class="vm-shadow" style="width:${Math.round(sq*0.65)}px;animation-delay:${bobDelay}ms"></div>
    </div>`;
  }
  return el;
}

function makeTooltip(v){
  return `${v.label}${v.delay>2?` +${v.delay}m late`:''}`;
}

// ── Markers / interpolation ────────────────────────────────────────────
const markers={};
const interp={};

function _buildWaypoints(fromLat,fromLng,toLat,toLng,pts){
  if(!pts||pts.length<2) return [[fromLat,fromLng],[toLat,toLng]];
  let fi=0,fd=Infinity,ti=0,td=Infinity;
  pts.forEach((p,i)=>{
    const df=(p[0]-fromLat)**2+(p[1]-fromLng)**2;
    const dt=(p[0]-toLat)**2+(p[1]-toLng)**2;
    if(df<fd){fd=df;fi=i;} if(dt<td){td=dt;ti=i;}
  });
  if(fi===ti) return [[fromLat,fromLng],[toLat,toLng]];
  const seg=fi<ti?pts.slice(fi,ti+1):[...pts.slice(ti,fi+1)].reverse();
  return [[fromLat,fromLng],...seg.slice(1,-1).map(p=>[p[0],p[1]]),[toLat,toLng]];
}

function startInterp(id,fromLat,fromLng,toLat,toLng,duration){
  const v=vehicles.find(vv=>vv.id===id);
  let pts=null;
  // 1. Prefer PTV route path from /api/journey (matched by run_ref or line)
  if(v){
    if(v.run_ref && journeyRoutePaths.has(String(v.run_ref))){
      pts=journeyRoutePaths.get(String(v.run_ref));
    } else if(v.line){
      for(const [key,path] of journeyRoutePaths){
        if(key===v.line){pts=path;break;}
      }
    }
  }
  // 2. Fall back to hardcoded ROUTES geometry
  if(!pts && v){
    const routeData=ROUTES.find(([,l])=>l===v.line);
    if(routeData) pts=routeData[4];
  }
  const waypoints=_buildWaypoints(fromLat,fromLng,toLat,toLng,pts);
  let total=0;
  const dists=[0];
  for(let i=1;i<waypoints.length;i++){
    const [la,lo]=waypoints[i-1],[lb,lb2]=waypoints[i];
    total+=Math.sqrt((la-lb)**2+(lo-lb2)**2);
    dists.push(total);
  }
  interp[id]={waypoints,dists,total,startTime:performance.now(),duration};
}
function _interpPos(ip,e){
  const target=e*ip.total;
  if(ip.waypoints.length<2) return ip.waypoints[0];
  let seg=ip.waypoints.length-2;
  for(let i=0;i<ip.dists.length-1;i++){if(ip.dists[i+1]>=target){seg=i;break;}}
  const segLen=ip.dists[seg+1]-ip.dists[seg];
  const segT=segLen>0?(target-ip.dists[seg])/segLen:1;
  const [la,lo]=ip.waypoints[seg],[lb,lb2]=ip.waypoints[seg+1];
  return [la+(lb-la)*segT, lo+(lb2-lo)*segT];
}
function easeInOut(t){return t<0.5?2*t*t:-1+(4-2*t)*t}

let followingId=null;
function startFollow(id){
  followingId=id;
  const v=vehicles.find(v=>v.id===id);
  if(v){
    document.getElementById('follow-label').textContent=v.label;
    document.getElementById('follow-bar').classList.add('show');
    const btn=document.getElementById('dp-follow-btn');
    if(btn){btn.textContent='📍 Stop Following';btn.classList.add('following');}
  }
}
function stopFollow(){
  followingId=null;
  document.getElementById('follow-bar').classList.remove('show');
  const btn=document.getElementById('dp-follow-btn');
  if(btn){btn.textContent='📍 Follow Vehicle';btn.classList.remove('following');}
}
function toggleFollow(){
  if(followingId&&followingId===selectedId) stopFollow();
  else if(selectedId) startFollow(selectedId);
}

// Animation loop
(function animLoop(){
  const now=performance.now();
  for(const id in interp){
    const ip=interp[id]; const m=markers[id];
    if(!m){delete interp[id];continue;}
    const t=Math.min(1,(now-ip.startTime)/ip.duration);
    const e=easeInOut(t);
    const [lat,lng]=_interpPos(ip,e);
    m.setLngLat([lng,lat]);
    if(t>=1) delete interp[id];
    if(followingId===id) map.panTo([lng,lat],{duration:0});
  }
  if(followingId&&!interp[followingId]){
    const m=markers[followingId];
    if(m){ const ll=m.getLngLat(); map.panTo([ll.lng,ll.lat],{duration:0}); }
  }
  requestAnimationFrame(animLoop);
})();

map.on('zoom',()=>{
  for(const id in markers){
    const m=markers[id]; const ip=interp[id];
    if(ip){
      const t=Math.min(1,(performance.now()-ip.startTime)/ip.duration);
      const e=easeInOut(t);
      const [lat,lng]=_interpPos(ip,e);
      m.setLngLat([lng,lat]);
    } else if(m._v) m.setLngLat([m._v.lng,m._v.lat]);
  }
  // Refresh icon sizes on zoom change
  vehicles.forEach(v=>{
    const m=markers[v.id]; if(m){
      const newEl=makeMarkerEl(v);
      m.getElement().innerHTML=newEl.innerHTML;
    }
  });
  applyFilters();
  updateNearestVehicle();
});
map.on('moveend',()=>{
  applyFilters();
  updateNearestVehicle();
});

let selectedId=null;
function selectMarker(id){
  if(selectedId&&markers[selectedId]){
    markers[selectedId].getElement()?.querySelector('.vm-wrap')?.classList.remove('sel');
  }
  selectedId=id;
  if(markers[id]){
    markers[id].getElement()?.querySelector('.vm-wrap')?.classList.add('sel');
  }
}
function deselectVehicle(){
  if(selectedId&&markers[selectedId]){
    markers[selectedId].getElement()?.querySelector('.vm-wrap')?.classList.remove('sel');
  }
  selectedId=null;
}

// ── Occupancy ──────────────────────────────────────────────────────────
const OCC_LABELS=['Empty','Many seats','Few seats','Standing room','Crushed standing','Full','Not accepting'];
const OCC_COLORS=['#6bcb77','#6bcb77','#78be20','#f5a800','#ff7c20','#ff6b6b','#ff6b6b'];
function occPct(status){return [5,20,45,65,80,95,100][status]??50}

// ── Detail sheet ───────────────────────────────────────────────────────
function openDetail(v){
  const delayed=v.delay>2;
  document.getElementById('dp-bar').style.background=v.color;
  // Big face SVG in detail hero
  const faceEl=document.getElementById('dp-face');
  const dpColor=MODE_COLOR[v.mode]||v.color||'#5b8dee';
  faceEl.innerHTML=makeFaceSVG(v.mode,delayed,dpColor,80,v.label);
  faceEl.style.background='transparent';
  faceEl.style.boxShadow=`0 6px 24px ${dpColor}44`;
  document.getElementById('dp-route').textContent=v.label;
  document.getElementById('dp-ldot').style.background=v.color;
  document.getElementById('dp-line').textContent=v.line;
  const src=document.getElementById('dp-src');
  src.textContent=v._live?'LIVE':'DEMO';
  src.className=`dp-src ${v._live?'live':'demo'}`;

  // Stats grid
  const stats=[
    ['Status', delayed?`<span class="dp-badge late">+${v.delay} min late</span>`:`<span class="dp-badge ok">On time ✓</span>`],
    v.dest?['Destination',v.dest]:null,
    v.speed>0?['Speed',`${Math.round((v.speed*3.6)||v.speed)} km/h`]:null,
    ['GPS',`${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}`],
  ].filter(Boolean);
  document.getElementById('dp-stats-grid').innerHTML=stats.map(([k,val])=>`
    <div class="dp-stat">
      <div class="dp-stat-k">${k}</div>
      <div class="dp-stat-v">${val.startsWith('<')?val:escHtml(val)}</div>
    </div>`).join('');

  // Occupancy
  const occWrap=document.getElementById('dp-occ-wrap');
  if(v.occupancy!=null&&v._live){
    const pct=occPct(v.occupancy);
    const lbl=OCC_LABELS[v.occupancy]??'Unknown';
    const clr=OCC_COLORS[v.occupancy]??'#f5a800';
    occWrap.innerHTML=`<div class="dp-occ">
      <div class="dp-occ-label">Occupancy<span>${lbl}</span></div>
      <div class="dp-occ-bg"><div class="dp-occ-fill" style="width:${pct}%;background:${clr}"></div></div>
    </div>`;
  } else occWrap.innerHTML='';

  const isFollowing=followingId===v.id;
  const fbtn=document.getElementById('dp-follow-btn');
  fbtn.textContent=isFollowing?'📍 Stop Following':'📍 Follow Vehicle';
  fbtn.className=`dp-follow${isFollowing?' following':''}`;

  openSheet('detail-sheet');
}

// ── upsert marker ──────────────────────────────────────────────────────
function upsert(v){
  if(markers[v.id]){
    const m=markers[v.id];
    if(v._live){
      const cur=m.getLngLat();
      const dist=Math.abs(cur.lat-v.lat)+Math.abs(cur.lng-v.lng);
      if(dist>0.00001){
        let toLat=v.lat, toLng=v.lng;
        if(journeyHighlightedIds.has(v.id)){
          let pts=null;
          if(v.run_ref && journeyRoutePaths.has(String(v.run_ref))) pts=journeyRoutePaths.get(String(v.run_ref));
          else if(v.line){ for(const[k,p] of journeyRoutePaths){ if(k===v.line){pts=p;break;} } }
          if(!pts){const rd=ROUTES.find(([,l])=>l===v.line);if(rd) pts=rd[4];}
          if(pts && pts.length>=2){
            let bestD=Infinity,bi=0;
            pts.forEach((p,i)=>{const d=(p[0]-v.lat)**2+(p[1]-v.lng)**2;if(d<bestD){bestD=d;bi=i;}});
            if(Math.sqrt(bestD)*111320 > 50){ toLat=pts[bi][0]; toLng=pts[bi][1]; }
          }
        }
        startInterp(v.id,cur.lat,cur.lng,toLat,toLng,REFRESH_MS-500);
      }
    } else {
      m.setLngLat([v.lng,v.lat]);
    }
    if(m._lastDelay!==v.delay||m._lastBearing!==v.bearing){
      const newEl=makeMarkerEl(v);
      m.getElement().innerHTML=newEl.innerHTML;
      m._lastDelay=v.delay; m._lastBearing=v.bearing;
    }
    m.getElement().title=makeTooltip(v);
    m._v=v;
    if(selectedId===v.id) openDetail(v);
  } else {
    const el=makeMarkerEl(v);
    el.title=makeTooltip(v);
    el.addEventListener('click',()=>{ selectMarker(v.id); openDetail(v); });
    const m=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([v.lng,v.lat]);
    m._v=v; m._lastDelay=v.delay; m._lastBearing=v.bearing;
    if(passesFilter(v)){ m.addTo(map); markersOnMap.add(v.id); }
    markers[v.id]=m;
  }
}

function removeOldMarkers(currentIds){
  const cur=new Set(currentIds);
  Object.keys(markers).forEach(id=>{
    if(!cur.has(id)){
      markers[id].remove();
      markersOnMap.delete(id);
      delete markers[id];
    }
  });
}

// ── Inspector markers ──────────────────────────────────────────────────
const inspMarkers={};
async function fetchInspectors(){
  try{
    const data=await fetch('/api/inspectors',{signal:AbortSignal.timeout(8000)}).then(r=>r.json());
    const reports=Array.isArray(data)?data:(data.reports||[]);
    const currentIds=new Set();
    reports.forEach(r=>{
      const id=String(r.id);
      currentIds.add(id);
      if(!inspMarkers[id]&&r.lat&&r.lng){
        const typeIcos={inspector:'👮',vibes:'⭐',avoid:'⚠️',funny:'😂'};
        const ico=typeIcos[r.route]||typeIcos['inspector'];
        const age=Math.round((Date.now()-r.timestamp)/60000);
        const stillVotes=r.votes?.still?.length||0;
        const goneVotes=r.votes?.gone?.length||0;
        // DOM element for marker
        const el=document.createElement('div');
        el.style.cssText='width:38px;height:38px;display:flex;align-items:center;justify-content:center;cursor:pointer';
        el.innerHTML=`<div class="vm-inner">${r.route==='inspector'||!r.route?makeInspectorSVG():`<div style="font-size:1.8rem">${ico}</div>`}</div>`;
        // Mapbox popup
        const popup=new maplibregl.Popup({closeButton:true,maxWidth:'260px',className:'insp-popup-wrap'})
          .setHTML(`<div class="insp-popup">
            <div class="insp-popup-type">${escHtml((r.transport||'unknown').toUpperCase())} · ${escHtml(r.route||'inspector')}</div>
            <div class="insp-popup-title">${ico} ${r.route==='inspector'?'Ticket Inspector spotted!':r.route==='vibes'?'Good vibes here!':r.route==='avoid'?'Avoid this vehicle':'Something funny!'}</div>
            <div class="insp-popup-loc">📍 ${escHtml(r.location||'Unknown location')}</div>
            <div class="insp-popup-age">⏱ ${age}min ago</div>
            <div class="insp-votes">
              <button class="insp-vote-btn" onclick="voteInspector('${id}','still')">🚨 Still here (${stillVotes})</button>
              <button class="insp-vote-btn" onclick="voteInspector('${id}','gone')">✅ Gone (${goneVotes})</button>
            </div>
          </div>`);
        const m=new maplibregl.Marker({element:el,anchor:'center'})
          .setLngLat([r.lng,r.lat]).setPopup(popup).addTo(map);
        inspMarkers[id]=m;
      }
    });
    // Remove expired
    Object.keys(inspMarkers).forEach(id=>{
      if(!currentIds.has(id)){ inspMarkers[id].remove(); delete inspMarkers[id]; }
    });
  }catch(e){/* ignore */}
}

async function voteInspector(id,vote){
  try{
    const uid=getUserId();
    await fetch(`/api/inspectors/${id}/vote`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({userId:uid,vote})
    });
    showToast(vote==='still'?'Thanks! Reported as still there 🚨':'Thanks! Reported as gone ✅');
    if(inspMarkers[id]) inspMarkers[id].getPopup()?.remove();
    setTimeout(fetchInspectors,500);
  }catch(e){}
}

// ── Report system ──────────────────────────────────────────────────────
let reportType=null;
let reportVehicleId=null;

function selectReportType(type){
  reportType=type;
  document.querySelectorAll('.report-card').forEach(c=>c.classList.remove('selected'));
  document.querySelector(`.report-card[onclick*="${type}"]`)?.classList.add('selected');
  const labels={inspector:'Report Inspector',vibes:'Share Good Vibes',avoid:'Report Avoid',funny:'Report Funny Moment'};
  document.getElementById('report-type-label').textContent=labels[type]||'Send Report';
  // Populate nearby vehicles
  const nearbyList=document.getElementById('report-vehicles');
  const center=map.getCenter();
  const nearby=vehicles
    .filter(v=>v._live)
    .map(v=>({...v,dist:Math.abs(v.lat-center.lat)+Math.abs(v.lng-center.lng)}))
    .sort((a,b)=>a.dist-b.dist)
    .slice(0,6);
  const modeIco={train:'🚆',tram:'🚋',bus:'🚌',vline:'🚂'};
  nearbyList.innerHTML=nearby.map(v=>`
    <div class="report-vehicle-item ${reportVehicleId===v.id?'picked':''}" onclick="pickReportVehicle('${v.id}',this)">
      <span style="font-size:1.2rem">${modeIco[v.mode]||'🚌'}</span>
      <div><div style="font-size:.82rem;font-weight:700;color:var(--text)">${escHtml(v.label)}</div>
      <div style="font-size:.68rem;color:var(--text2);font-weight:600">${escHtml(v.line)}</div></div>
    </div>`).join('')||'<div style="font-size:.8rem;color:var(--text3);padding:8px 0;font-weight:600">No nearby live vehicles — report will use map center</div>';
  document.getElementById('report-step1').style.display='none';
  document.getElementById('report-step2').classList.add('show');
}

function pickReportVehicle(id,el){
  reportVehicleId=id;
  document.querySelectorAll('.report-vehicle-item').forEach(e=>e.classList.remove('picked'));
  el.classList.add('picked');
}

async function submitReport(){
  const v=reportVehicleId?vehicles.find(v=>v.id===reportVehicleId):null;
  const center=map.getCenter();
  const body={
    transport: v?.mode||'unknown',
    route: reportType||'inspector',
    location: v?v.label:(reportType==='inspector'?'Reported from map':'Community report'),
    lat: v?.lat||center.lat,
    lng: v?.lng||center.lng,
    userId: getUserId()
  };
  try{
    await fetch('/api/inspectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    closeSheet('report-sheet');
    resetReport();
    showToast('Report sent! Thanks for keeping Melbourne informed 🙌');
    setTimeout(fetchInspectors,500);
  }catch(e){showToast('Failed to send — check your connection');}
}

function resetReport(){
  reportType=null; reportVehicleId=null;
  document.getElementById('report-step1').style.display='';
  document.getElementById('report-step2').classList.remove('show');
  document.querySelectorAll('.report-card').forEach(c=>c.classList.remove('selected'));
}

// ── Alerts ─────────────────────────────────────────────────────────────
let alerts=[];
async function fetchAlerts(){
  try{
    const data=await fetch('/api/alerts',{signal:AbortSignal.timeout(8000)}).then(r=>r.json());
    alerts=Array.isArray(data)?data:[];
    const badge=document.getElementById('alert-badge');
    badge.textContent=alerts.length;
    badge.classList.toggle('show',alerts.length>0);
    if(activeSheet==='alerts-sheet') renderAlerts();
  }catch(e){}
}

function renderAlerts(){
  const el=document.getElementById('alerts-body');
  if(!alerts.length){
    el.innerHTML='<div class="ap-empty">No active alerts right now 🎉<br><small>Melbourne transit is running smoothly!</small></div>';
    return;
  }
  el.innerHTML=alerts.map(a=>{
    const eff=ALERT_EFFECTS[a.effect]||'';
    return `<div class="alert-item">
      ${eff?`<div class="alert-effect">⚠ ${eff}</div>`:''}
      <div class="alert-title">${escHtml(a.header)}</div>
      ${a.desc?`<div class="alert-desc">${escHtml(a.desc).replace(/\n/g,'<br>')}</div>`:''}
      ${a.routes?.length?`<div class="alert-routes">${a.routes.map(r=>`<span class="alert-tag">${escHtml(r)}</span>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}

// ── Counts / status ────────────────────────────────────────────────────
let lastUpdate=null, nextRefreshSec=REFRESH_MS/1000;
function updateCounts(vs){
  const c={train:0,tram:0,bus:0,vline:0};
  vs.forEach(v=>{if(passesFilter(v))c[v.mode]++;});
  document.getElementById('sb-total').textContent=c.train+c.tram+c.bus+c.vline;
  updateFilterCounts();
  updateNearestVehicle();
}
setInterval(()=>{
  if(nextRefreshSec>0) nextRefreshSec--;
  document.getElementById('sb-cd').textContent=nextRefreshSec;
},1000);

// ── Toast ──────────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),3500);
}

function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(activeSheet){closeAllSheets();return;}
    if(followingId){stopFollow();return;}
  }
});

// ── Live / Demo ────────────────────────────────────────────────────────
let isLive=false, vehicles=[], demoTimer=null;

async function fetchLive(){
  try{
    const res=await fetch(API_URL,{signal:AbortSignal.timeout(9000)});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error) throw new Error(data.error);
    if(!Array.isArray(data)||data.length===0) throw new Error('No vehicles');
    if(!isLive){
      vehicles.forEach(v=>{
        if(!v._live){
          if(markers[v.id]){ markers[v.id].remove(); markersOnMap.delete(v.id); }
          delete markers[v.id];
        }
      });
      clearInterval(demoTimer);
      isLive=true;
      const mb=document.getElementById('mode-badge');
      mb.className='mode-badge live';
      document.getElementById('mode-text').textContent='LIVE';
    }
    const currentIds=data.map(v=>v.id+'');
    removeOldMarkers(currentIds);
    vehicles=data.map(v=>({...v,_live:true}));
    vehicles.forEach(upsert);
    updateCounts(vehicles);
    if(destLoc) updateJourneyVehicles();
    lastUpdate=Date.now();
    nextRefreshSec=REFRESH_MS/1000;
    return true;
  }catch(e){console.warn('Live fetch failed:',e.message);return false;}
}

function manualRefresh(){
  const btn=document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  setTimeout(()=>btn.classList.remove('spinning'),650);
  nextRefreshSec=REFRESH_MS/1000;
  if(isLive){fetchLive();fetchAlerts();}
}

function spawnDemo(){
  const all=[]; let id=0;
  ROUTES.forEach(([mode,line,color,label,pts])=>{
    const n=mode==='train'?4:mode==='tram'?5:3;
    for(let i=0;i<n;i++){
      const frac=i/n,total=pts.length-1,raw=frac*total;
      const seg=Math.min(Math.floor(raw),total-1),t=raw-seg;
      const a=pts[seg],b=pts[seg+1];
      all.push({
        id:`demo_${id++}`,mode,line,color,label,dest:'',
        lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t,
        pts,seg,t,fwd:i%2===0,
        delay:Math.floor(Math.random()*7),
        speed:mode==='train'?0.07:mode==='tram'?0.038:0.028,
        bearing:Math.random()*360,_live:false,occupancy:null
      });
    }
  });
  return all;
}

function tickDemo(){
  vehicles=vehicles.map(v=>{
    if(v._live) return v;
    const pts=v.pts,n=pts.length;
    let{seg,t,fwd}=v;
    t+=fwd?v.speed/100:-v.speed/100;
    if(t>=1){t=0;seg=Math.min(seg+1,n-2);}
    if(t<0){t=1;seg=Math.max(seg-1,0);}
    if(seg>=n-2&&t>=0.99) fwd=false;
    if(seg<=0&&t<=0.01) fwd=true;
    const a=pts[seg],b=pts[seg+1];
    const dLng=b[1]-a[1],dLat=b[0]-a[0];
    const bearing=(Math.atan2(dLng,dLat)*180/Math.PI+360)%360;
    const nv={...v,lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t,seg,t,fwd,bearing};
    if(Math.random()<0.003) nv.delay=Math.max(0,nv.delay+(Math.random()<0.4?1:-1));
    upsert(nv);
    return nv;
  });
  updateCounts(vehicles);
}

// ── Boot ───────────────────────────────────────────────────────────────
function hideLoader(){ document.getElementById('loader')?.classList.add('out'); }

async function init(){
  // DOM-only setup — no map dependency
  loadAvatar();
  loadGhostMode();
  buildFilterPanel();
  initSearch();

  // Spawn demo vehicles immediately — maplibregl.Marker works before map load
  vehicles = spawnDemo();
  vehicles.forEach(upsert);
  updateCounts(vehicles);
  lastUpdate = Date.now();
  demoTimer = setInterval(tickDemo, 1400);

  fetchAlerts();
  fetchInspectors();
  setInterval(fetchInspectors, 60000);

  // Kick off live fetch without blocking
  const livePromise = fetchLive();

  // Map-specific setup — waits for load but has a 5s timeout so it never hangs
  try {
    await mapReady();
    buildStations();

    const loc = await locateUser();
    if(loc){
      userLoc = loc;
      document.getElementById('ld-title').textContent = 'Found you! 🎉';
      document.getElementById('ld-sub').textContent = 'Loading transit data...';
      await new Promise(r=>setTimeout(r,600));
      map.jumpTo({center:[loc.lng,loc.lat], zoom:14});
      try { placeUserPin(loc.lat,loc.lng); } catch(e){ console.warn('Pin error:',e); }
    } else {
      document.getElementById('sb-nearest').textContent = '📍 Enable location for nearby info';
    }
    try { startLocationWatch(); } catch(e){ console.warn('Watch error:',e); }
  } catch(e){ console.error('Init map error:',e); }

  setTimeout(hideLoader, 1500);

  const live = await livePromise;
  if(live){
    setInterval(fetchLive, REFRESH_MS);
    setInterval(fetchAlerts, 120000);
  } else {
    document.getElementById('mode-badge').className = 'mode-badge demo';
    document.getElementById('mode-text').textContent = 'DEMO';
    setInterval(async()=>{
      if(!isLive){
        const ok = await fetchLive();
        if(ok){ setInterval(fetchLive,REFRESH_MS); setInterval(fetchAlerts,120000); }
      }
    }, 30000);
  }

  if(!localStorage.getItem('tl-onboarded')) setTimeout(showOnboarding, 800);
}

// ═══════════════════════════════════════════════════════════════════════
// ── ADDRESS SEARCH ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

// _searchTimer removed — search now handled by <mapbox-search-box> web component
let destLoc = null;           // {lat, lng, name}
let destMarker = null;
let journeyLine = null;       // Placeholder dashed straight line
let journeyPolyline = null;   // Real route polyline from API
let activeJourney = null;     // Best journey object from /api/journey
const journeyHighlightedIds = new Set();
// Maps run_ref/line → [[lat,lng],...] from /api/journey response
const journeyRoutePaths = new Map();

function initSearch(){
  const input = document.getElementById('addr-search-input');
  const results = document.getElementById('addr-suggestions');
  if(!input || !results) return;

  let debounceTimer = null;

  const typeIco = {train:'🚆',tram:'🚋',bus:'🚌',suburb:'🏘',station:'🚉',university:'🎓',hospital:'🏥'};

  function renderSuggestions(data){
    results.innerHTML = data.map((l,i)=>`
      <div class="addr-suggestion" data-i="${i}" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${escHtml(l.name)}" data-type="${escHtml(l.type||'')}">
        <span class="addr-sug-ico">${typeIco[l.type]||'📍'}</span>
        <div>
          <div class="addr-result-main">${escHtml(l.name)}</div>
          <div class="addr-result-sub">${escHtml(l.type||'Location')}</div>
        </div>
      </div>`).join('');
    results.classList.add('show');
    results.querySelectorAll('.addr-suggestion').forEach(el=>{
      el.addEventListener('click', e=>{
        e.stopPropagation();
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        const name = el.dataset.name;
        clearAddrSearch();
        selectAddrResult(lat, lng, name, name);
      });
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if(!q){ results.innerHTML=''; results.classList.remove('show'); return; }
    debounceTimer = setTimeout(async () => {
      try{
        const r = await fetch(`/api/journey/autocomplete?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if(!Array.isArray(data)||!data.length){ results.innerHTML=''; results.classList.remove('show'); return; }
        renderSuggestions(data);
      }catch(e){ console.error('[Search]', e); }
    }, 220);
  });

  input.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ clearAddrSearch(); results.classList.remove('show'); }
    if(e.key==='Enter'){
      const first = results.querySelector('.addr-suggestion');
      if(first) first.click();
    }
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', e=>{
    if(!input.contains(e.target) && !results.contains(e.target))
      results.classList.remove('show');
  });
}

function clearAddrSearch(){
  const input = document.getElementById('addr-search-input');
  const results = document.getElementById('addr-suggestions');
  if(input) input.value = '';
  if(results){ results.innerHTML=''; results.classList.remove('show'); }
}

function selectAddrResult(lat, lng, name, fullAddr){
  clearAddrSearch();
  document.getElementById('addr-search-input')?.blur();
  placeDestPin(+lat, +lng, name, fullAddr);
  destLoc = {lat:+lat, lng:+lng, name};
  // Draw placeholder dashed straight line immediately
  updateJourneyLine();
  // Show bottom sheet in loading state right away
  showJourneyBottomSheetLoading(name);
  // Fetch real route from server
  if(userLoc){
    fetchAndActivateJourney(userLoc.lat, userLoc.lng, +lat, +lng, name);
  } else {
    updateJourneyVehicles();
  }
}

async function fetchAndActivateJourney(fromLat, fromLng, toLat, toLng, toName){
  journeyRoutePaths.clear();
  activeJourney = null;
  try{
    const res = await fetch('/api/journey', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fromLat, fromLng, toLat, toLng,
        fromName: userLoc?.name || 'Your location',
        toName: toName || destLoc?.name || ''})
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const journeys = data.journeys || [];
    if(!journeys.length) throw new Error('No journeys');

    // Treat fallback mode as no real route — just show nearest vehicles
    if(data.mode === 'fallback'){
      updateJourneyVehicles();
      showJourneyBottomSheet(null);
      return;
    }

    activeJourney = journeys[0];

    // Index all routePaths for vehicle animation matching
    journeys.forEach(j=>{
      (j.legs||[]).forEach(leg=>{
        if(leg.routePath && leg.routePath.length >= 2){
          const key = leg.run_ref || leg.line || leg.route;
          if(key) journeyRoutePaths.set(String(key), leg.routePath);
        }
      });
    });

    // Draw real route polyline and fit bounds
    updateJourneyPolyline();
    // Update bottom sheet with real data
    showJourneyBottomSheet(activeJourney);
    // Fuzzy-match and highlight vehicles
    updateJourneyVehicles();

  }catch(e){
    // No data — fall back to bearing-based approach
    updateJourneyVehicles();
    showJourneyBottomSheet(null);
  }
}

function updateJourneyPolyline(){
  // Hide any existing real-route layer
  if(map.getLayer('journey-route')) map.setLayoutProperty('journey-route','visibility','none');
  journeyPolyline = null;
  if(!activeJourney) return;

  const transitLeg = (activeJourney.legs||[]).find(l=>l.type!=='walk'&&l.routePath&&l.routePath.length>=2);
  if(!transitLeg) return;

  const pts = transitLeg.routePath; // [[lat,lng],...]
  const coords = pts.map(p=>[p[1],p[0]]); // → [lng,lat] for GeoJSON
  const color = transitLeg.color || '#5b8dee';
  const geojson = {type:'Feature',geometry:{type:'LineString',coordinates:coords}};

  if(map.getSource('journey-route')){
    map.getSource('journey-route').setData(geojson);
    map.setPaintProperty('journey-route','line-color',color);
    map.setLayoutProperty('journey-route','visibility','visible');
  } else {
    map.addSource('journey-route',{type:'geojson',data:geojson});
    map.addLayer({id:'journey-route',type:'line',source:'journey-route',
      layout:{'line-cap':'round','line-join':'round','visibility':'visible'},
      paint:{'line-color':color,'line-width':5,'line-opacity':0.85}});
  }
  journeyPolyline = true; // flag: real route layer active

  // Hide placeholder dashed line
  if(map.getLayer('journey-placeholder'))
    map.setLayoutProperty('journey-placeholder','visibility','none');
  journeyLine = false;

  // Fit bounds to show the whole route
  const allCoords = [
    ...(userLoc ? [[userLoc.lng,userLoc.lat]] : []),
    ...coords,
    [destLoc.lng,destLoc.lat]
  ];
  const bounds = allCoords.reduce((b,c)=>b.extend(c), new maplibregl.LngLatBounds(allCoords[0],allCoords[0]));
  map.fitBounds(bounds,{padding:50,maxZoom:15,animate:true});
}

function showJourneyBottomSheetLoading(destName){
  const sheet = document.getElementById('journey-bottom-sheet');
  if(!sheet) return;
  document.getElementById('jbs-dest').textContent = `To: ${destName}`;
  document.getElementById('jbs-mode-pill').textContent = '🗺';
  document.getElementById('jbs-mode-pill').style.background = '#5b8dee';
  document.getElementById('jbs-route-name').textContent = 'Finding route…';
  document.getElementById('jbs-route-sub').textContent = '';
  document.getElementById('jbs-duration').textContent = '—';
  document.getElementById('jbs-depart-time').textContent = '—';
  document.getElementById('jbs-walk-time').textContent = '—';
  document.getElementById('jbs-next-stop').textContent = 'Calculating…';
  sheet.classList.add('show');
}

function showJourneyBottomSheet(journey){
  const sheet = document.getElementById('journey-bottom-sheet');
  if(!sheet) return;
  sheet.classList.add('show');

  if(destLoc) document.getElementById('jbs-dest').textContent = `To: ${destLoc.name}`;

  if(!journey){
    const pill = document.getElementById('jbs-mode-pill');
    pill.style.background = '#aaa';
    pill.textContent = '🔍';
    document.getElementById('jbs-route-name').textContent = 'No direct route found';
    document.getElementById('jbs-route-sub').textContent = 'Showing nearest vehicles instead';
    document.getElementById('jbs-duration').textContent   = '—';
    document.getElementById('jbs-depart-time').textContent = '—';
    document.getElementById('jbs-walk-time').textContent   = '—';
    document.getElementById('jbs-next-stop').textContent   = '—';
    return;
  }

  const transitLeg = (journey.legs||[]).find(l=>l.type!=='walk');
  const walkLeg    = (journey.legs||[]).find(l=>l.type==='walk');

  if(transitLeg){
    const modeEmoji = {train:'🚆',tram:'🚊',bus:'🚌',vline:'🚂'}[transitLeg.type]||'🚌';
    const stopCount = transitLeg.routePath?.length > 1 ? `${transitLeg.routePath.length - 1} stops` : '';
    const pill = document.getElementById('jbs-mode-pill');
    pill.style.background = transitLeg.color || '#5b8dee';
    pill.textContent = modeEmoji;
    document.getElementById('jbs-route-name').textContent =
      [transitLeg.line, stopCount].filter(Boolean).join(' · ');
    document.getElementById('jbs-route-sub').textContent =
      transitLeg.minsUntilDep != null ? `Departs in ${transitLeg.minsUntilDep} min` :
      transitLeg.delay > 0 ? `${transitLeg.delay} min late` : 'On time';
    document.getElementById('jbs-duration').textContent    = journey.duration || '—';
    document.getElementById('jbs-depart-time').textContent = transitLeg.depart || '—';
    document.getElementById('jbs-walk-time').textContent   = walkLeg ? walkLeg.duration : '—';
    document.getElementById('jbs-next-stop').textContent   = transitLeg.from || '—';
  } else {
    // Walk-only
    const pill = document.getElementById('jbs-mode-pill');
    pill.style.background = '#4ecdc4';
    pill.textContent = '🚶';
    document.getElementById('jbs-route-name').textContent  = 'Walk only';
    document.getElementById('jbs-route-sub').textContent   = `${journey.duration || '?'} min walk`;
    document.getElementById('jbs-duration').textContent    = journey.duration || '—';
    document.getElementById('jbs-depart-time').textContent = 'Now';
    document.getElementById('jbs-walk-time').textContent   = journey.duration || '—';
    document.getElementById('jbs-next-stop').textContent   = destLoc?.name || '—';
  }
}

function placeDestPin(lat, lng, name, fullAddr){
  if(destMarker){ destMarker.remove(); destMarker=null; }
  const pinSvg = `<svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2 C8.27 2 2 8.27 2 16 C2 27 16 42 16 42 C16 42 30 27 30 16 C30 8.27 23.73 2 16 2Z" fill="#5b8dee" stroke="white" stroke-width="2"/>
    <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
    <circle cx="16" cy="16" r="4" fill="#5b8dee"/>
  </svg>`;
  const el = document.createElement('div');
  el.innerHTML = pinSvg;
  el.style.cursor = 'pointer';
  destMarker = new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([lng,lat]).addTo(map);
}

function openDestSheet(lat, lng, name, fullAddr){
  // Legacy: kept for compatibility, now handled by journey cards
  destLoc = {lat, lng, name};
}

// ═══════════════════════════════════════════════════════════════════════
// ── JOURNEY MODE ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

function bearingBetween(lat1,lng1,lat2,lng2){
  const φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180;
  const Δλ=(lng2-lng1)*Math.PI/180;
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}
function bearingDiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d;}

function activateJourneyMode(){
  closeSheet('dest-sheet');
  if(!destLoc) return;
  updateJourneyLine();
  showJourneyBottomSheetLoading(destLoc.name);
  if(userLoc){
    fetchAndActivateJourney(userLoc.lat, userLoc.lng, destLoc.lat, destLoc.lng, destLoc.name);
  } else {
    updateJourneyVehicles();
  }
}

function updateJourneyLine(){
  if(!userLoc||!destLoc) return;
  const coords=[[userLoc.lng,userLoc.lat],[destLoc.lng,destLoc.lat]];
  const geojson={type:'Feature',geometry:{type:'LineString',coordinates:coords}};
  if(map.getSource('journey-placeholder')){
    map.getSource('journey-placeholder').setData(geojson);
    map.setLayoutProperty('journey-placeholder','visibility','visible');
  } else if(map.loaded()){
    map.addSource('journey-placeholder',{type:'geojson',data:geojson});
    map.addLayer({
      id:'journey-placeholder',type:'line',source:'journey-placeholder',
      layout:{'line-cap':'round','line-join':'round','visibility':'visible'},
      paint:{'line-color':'#5b8dee','line-width':3,'line-opacity':0.55,
        'line-dasharray':[2,2]}
    });
  }
  journeyLine = true; // flag: placeholder active
}

// ── Journey cards ───────────────────────────────────────────────────────
let jcIndex=0, jcTotal=0, jcTouchStartX=0;

function makeRouteMinimap(v){
  const routeData=ROUTES.find(([m,l])=>l===v.line);
  if(!routeData) return '<div class="jc-minimap"></div>';
  const [,,color,,pts]=routeData;
  const lats=pts.map(p=>p[0]),lngs=pts.map(p=>p[1]);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const W=300,H=50,pad=5;
  const sx=(W-2*pad)/((maxLng-minLng)||0.001);
  const sy=(H-2*pad)/((maxLat-minLat)||0.001);
  const tx=lng=>pad+(lng-minLng)*sx;
  const ty=lat=>H-pad-(lat-minLat)*sy;
  const pathD=pts.map((p,i)=>`${i===0?'M':'L'}${tx(p[1]).toFixed(1)},${ty(p[0]).toFixed(1)}`).join(' ');
  const vDot=`<circle cx="${tx(v.lng).toFixed(1)}" cy="${ty(v.lat).toFixed(1)}" r="5" fill="${color}" stroke="white" stroke-width="1.5"/>`;
  const uDot=userLoc?`<circle cx="${tx(userLoc.lng).toFixed(1)}" cy="${ty(userLoc.lat).toFixed(1)}" r="4" fill="#ff6b6b" stroke="white" stroke-width="1.5"/>`:'';
  const dDot=destLoc?`<circle cx="${tx(destLoc.lng).toFixed(1)}" cy="${ty(destLoc.lat).toFixed(1)}" r="4" fill="#5b8dee" stroke="white" stroke-width="1.5"/>`:'';
  return `<div class="jc-minimap"><svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
    ${uDot}${vDot}${dDot}
  </svg></div>`;
}

function findJourneyOptions(){
  if(!userLoc||!destLoc) return [];
  const bearingToDest=bearingBetween(userLoc.lat,userLoc.lng,destLoc.lat,destLoc.lng);
  const options=[];
  vehicles.filter(v=>passesBaseFilter(v)&&v._live).forEach(v=>{
    const walkDist=haversine(userLoc.lat,userLoc.lng,v.lat,v.lng);
    const walkMin=Math.max(1,Math.round(walkDist/80));
    const routeData=ROUTES.find(([m,l])=>l===v.line);
    let walkStopName=v.line+' stop';
    let routeNearDest=false;
    if(routeData){
      const pts=routeData[4];
      let bestWalk=Infinity,bestDest=Infinity;
      pts.forEach(p=>{
        const dw=haversine(userLoc.lat,userLoc.lng,p[0],p[1]);
        if(dw<bestWalk){
          bestWalk=dw;
          const ns=STATIONS.find(s=>haversine(p[0],p[1],s.lat,s.lng)<500);
          if(ns) walkStopName=ns.name;
        }
        const dd=haversine(destLoc.lat,destLoc.lng,p[0],p[1]);
        if(dd<bestDest) bestDest=dd;
      });
      routeNearDest=bestDest<3000;
    }
    const bd=typeof v.bearing==='number'?bearingDiff(v.bearing,bearingToDest):180;
    const headingRight=bd<100;
    const speedMpM=v.speed>0?(v.speed*60):(v.mode==='train'?500:v.mode==='tram'?220:200);
    const arrivalMin=headingRight?Math.max(1,Math.round(walkDist/speedMpM)):null;
    const straightDist=haversine(userLoc.lat,userLoc.lng,destLoc.lat,destLoc.lng);
    const transitSpeedMpM=v.mode==='train'?600:v.mode==='tram'?250:270;
    const transitMin=Math.max(2,Math.round(straightDist/transitSpeedMpM));
    const totalMin=walkMin+(arrivalMin||walkMin*2)+transitMin;
    const score=(headingRight?0:300)+(routeNearDest?0:400)+walkDist/100+totalMin;
    options.push({v,walkDist,walkMin,walkStopName,arrivalMin,transitMin,totalMin,score,routeNearDest});
  });
  return options.sort((a,b)=>a.score-b.score).slice(0,5);
}

function buildJcCard(opt){
  const{v,walkDist,walkMin,walkStopName,arrivalMin,transitMin,totalMin}=opt;
  const color=MODE_COLOR[v.mode]||v.color||'#5b8dee';
  const walkM=walkDist>=1000?`${(walkDist/1000).toFixed(1)}km`:`${Math.round(walkDist)}m`;
  return `<div class="jc-card">
    <div class="jc-top">
      <div class="jc-face" style="background:${color}">${makeFaceSVG(v.mode,v.delay>2,color,52,getRouteLabel(v))}</div>
      <div class="jc-info">
        <div class="jc-route">${escHtml(v.label)}</div>
        <div class="jc-linename">${escHtml(v.line)}</div>
      </div>
    </div>
    <div class="jc-badges">
      <span class="jc-badge walk">🚶 ${walkM} to ${escHtml(walkStopName)}</span>
      ${arrivalMin!=null?`<span class="jc-badge arr">⏱ ~${arrivalMin} min away</span>`:''}
      <span class="jc-badge dur">🗺 ~${totalMin} min total</span>
    </div>
    ${makeRouteMinimap(v)}
    <button class="jc-go" onclick="jcStartFollow('${v.id.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">🚀 Let's go!</button>
  </div>`;
}

function renderJourneyCards(options){
  const track=document.getElementById('jc-track');
  const dotsEl=document.getElementById('jc-dots');
  const cardsEl=document.getElementById('journey-cards');
  if(!track||!cardsEl) return;
  if(!options.length){
    cardsEl.classList.remove('show');
    document.getElementById('journey-bar').classList.add('show');
    document.getElementById('jb-title').textContent='No vehicles heading your way';
    document.getElementById('jb-sub').textContent='Try again in a moment';
    return;
  }
  document.getElementById('journey-bar').classList.remove('show');
  jcTotal=options.length; jcIndex=0;
  track.innerHTML=options.map(o=>buildJcCard(o)).join('');
  dotsEl.innerHTML=options.map((_,i)=>`<div class="jc-dot ${i===0?'active':''}" id="jc-dot-${i}"></div>`).join('');
  jcUpdateNav();
  cardsEl.classList.add('show');
  const vp=document.getElementById('jc-viewport');
  if(vp&&!vp._swipeInit){
    vp._swipeInit=true;
    vp.addEventListener('touchstart',e=>{jcTouchStartX=e.touches[0].clientX;},{passive:true});
    vp.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-jcTouchStartX;
      if(Math.abs(dx)>40) jcSwipe(dx>0?-1:1);
    },{passive:true});
  }
}

function jcSwipe(dir){
  jcIndex=Math.max(0,Math.min(jcTotal-1,jcIndex+dir));
  const track=document.getElementById('jc-track');
  if(track) track.style.transform=`translateX(-${jcIndex*100}%)`;
  document.querySelectorAll('.jc-dot').forEach((d,i)=>d.classList.toggle('active',i===jcIndex));
  jcUpdateNav();
}
function jcUpdateNav(){
  const p=document.getElementById('jc-prev'),n=document.getElementById('jc-next');
  if(p) p.disabled=jcIndex===0;
  if(n) n.disabled=jcIndex>=jcTotal-1;
}
function jcStartFollow(vehicleId){
  const v=vehicles.find(v=>v.id===vehicleId);
  if(!v) return;
  selectMarker(vehicleId);
  startFollow(vehicleId);
  openDetail(v);
  showToast(`Following ${v.label} — jump on! 🚀`);
}

function updateJourneyVehicles(){
  if(!userLoc||!destLoc){ clearJourneyHighlights(); return; }
  clearJourneyHighlights();

  const transitLeg = activeJourney && (activeJourney.legs||[]).find(
    l => l.type !== 'walk' && l.routePath && l.routePath.length >= 2
  );

  if(transitLeg){
    // Fuzzy match: vehicle is on the correct mode + line AND within 500m of any route stop
    const legLineLow = (transitLeg.line||'').toLowerCase();
    const fuzzy = vehicles.filter(v=>{
      if(!passesBaseFilter(v)) return false;
      if(v.mode !== transitLeg.type && !(v.mode === 'vline' && transitLeg.type === 'train')) return false;
      // run_ref exact match is the strongest signal
      if(transitLeg.run_ref && v.run_ref && String(v.run_ref) === String(transitLeg.run_ref)) return true;
      // Line name fuzzy: either contains the other
      const vLineLow = (v.line||'').toLowerCase();
      const lineMatch = vLineLow.includes(legLineLow) || legLineLow.includes(vLineLow) || vLineLow === legLineLow;
      if(!lineMatch) return false;
      // Within 500m of any stop on the route path
      return transitLeg.routePath.some(([lat,lng]) => haversine(v.lat, v.lng, lat, lng) < 0.5);
    });

    if(fuzzy.length > 0){
      fuzzy.forEach(v=>{
        journeyHighlightedIds.add(v.id);
        const el = markers[v.id]?.getElement()?.querySelector('.vm-wrap');
        if(el) el.classList.add('journey-hl');
      });
      applyFilters();
      // Update next-stop in bottom sheet from nearest matched vehicle
      const nearest = fuzzy.slice().sort((a,b)=>
        haversine(userLoc.lat,userLoc.lng,a.lat,a.lng) -
        haversine(userLoc.lat,userLoc.lng,b.lat,b.lng)
      )[0];
      if(nearest?.dest) document.getElementById('jbs-next-stop').textContent = nearest.dest;
      return;
    }
  }

  // Fallback: bearing-based candidate matching
  const bearingToDest = bearingBetween(userLoc.lat, userLoc.lng, destLoc.lat, destLoc.lng);
  const candidates = vehicles
    .filter(v => passesBaseFilter(v) && typeof v.bearing === 'number')
    .map(v => {
      const bd   = bearingDiff(v.bearing, bearingToDest);
      const dist = haversine(userLoc.lat, userLoc.lng, v.lat, v.lng);
      return {v, bd, dist};
    })
    .filter(({bd}) => bd < 90)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  candidates.forEach(({v}) => {
    journeyHighlightedIds.add(v.id);
    const el = markers[v.id]?.getElement()?.querySelector('.vm-wrap');
    if(el) el.classList.add('journey-hl');
  });
  applyFilters();
}

function clearJourneyHighlights(){
  journeyHighlightedIds.forEach(id=>{
    const el=markers[id]?.getElement()?.querySelector('.vm-wrap');
    if(el) el.classList.remove('journey-hl');
  });
  journeyHighlightedIds.clear();
  applyFilters();
}

function clearDestination(){
  if(destMarker){ destMarker.remove(); destMarker=null; }
  if(journeyLine){
    if(map.getLayer('journey-placeholder')) map.setLayoutProperty('journey-placeholder','visibility','none');
    journeyLine=false;
  }
  if(journeyPolyline){
    if(map.getLayer('journey-route')) map.setLayoutProperty('journey-route','visibility','none');
    journeyPolyline=null;
  }
  clearJourneyHighlights();
  journeyRoutePaths.clear();
  activeJourney = null;
  destLoc = null;
  const sheet = document.getElementById('journey-bottom-sheet');
  if(sheet) sheet.classList.remove('show');
}

// Refresh journey vehicle highlights on each data update
const _origUpdateCounts = typeof updateCounts==='function' ? updateCounts : null;

// ═══════════════════════════════════════════════════════════════════════
// ── AUTH SYSTEM ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

let currentUser = null; // { email, username, karma, avatar }

// ── Avatar SVG renderer ─────────────────────────────────────────────────
const AV_FACES    = ['#FFCBA4','#F5A27A','#E8956D','#C68642','#8D5524','#FADDE1'];
const AV_HAIRS    = ['#1a1a1a','#5C3317','#8B4513','#D4A017','#F4E04D','#E0E0E0','#D44BC1','#4169E1'];
const AV_OUTFITS  = ['#5b8dee','#2CA05A','#F5A623','#ff6b6b','#9b7fd4','#4ecdc4'];
const AV_HAIR_STYLES = ['none','short','long','curly'];
const AV_EYES     = ['normal','happy','star'];
const AV_MOUTHS   = ['smile','grin','neutral'];
const AV_ACCS     = ['none','glasses','hat','headband'];

const AV_DEFAULTS = {
  face:'#FFCBA4', hairColor:'#1a1a1a', hair:'short',
  eyes:'normal', mouth:'smile', accessory:'none', outfit:'#5b8dee'
};

function renderAvatarSVG(cfg, sz=48){
  const fc = cfg.face     || AV_DEFAULTS.face;
  const hc = cfg.hairColor|| AV_DEFAULTS.hairColor;
  const oc = cfg.outfit   || AV_DEFAULTS.outfit;

  let hairSvg = '';
  switch(cfg.hair||'short'){
    case 'short':
      hairSvg = `<rect x="9" y="7" width="30" height="15" rx="8" fill="${hc}"/>`;
      break;
    case 'long':
      hairSvg = `<rect x="9" y="7" width="30" height="12" rx="8" fill="${hc}"/>
      <rect x="7" y="17" width="7" height="22" rx="4" fill="${hc}"/>
      <rect x="34" y="17" width="7" height="22" rx="4" fill="${hc}"/>`;
      break;
    case 'curly':
      hairSvg = `<circle cx="24" cy="9" r="8" fill="${hc}"/>
      <circle cx="14" cy="13" r="5.5" fill="${hc}"/>
      <circle cx="34" cy="13" r="5.5" fill="${hc}"/>`;
      break;
    default: hairSvg = '';
  }

  let eyesSvg = '';
  switch(cfg.eyes||'normal'){
    case 'happy':
      eyesSvg = `<path d="M14 23 Q18 19 22 23" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M26 23 Q30 19 34 23" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
      break;
    case 'star':
      eyesSvg = `<text x="18" y="27" text-anchor="middle" font-size="8" fill="#1a1a2e">★</text>
      <text x="30" y="27" text-anchor="middle" font-size="8" fill="#1a1a2e">★</text>`;
      break;
    default:
      eyesSvg = `<circle cx="18" cy="24" r="5" fill="white"/>
      <circle cx="30" cy="24" r="5" fill="white"/>
      <circle cx="18" cy="24" r="3" fill="#1a1a2e"/>
      <circle cx="30" cy="24" r="3" fill="#1a1a2e"/>
      <circle cx="16.5" cy="22.5" r="1.5" fill="white"/>
      <circle cx="28.5" cy="22.5" r="1.5" fill="white"/>`;
  }

  let mouthSvg = '';
  switch(cfg.mouth||'smile'){
    case 'grin':
      mouthSvg = `<path d="M16 32 Q24 39 32 32" stroke="#c06040" stroke-width="2" fill="none" stroke-linecap="round"/>
      <rect x="18" y="33" width="12" height="3.5" rx="1" fill="white"/>`;
      break;
    case 'neutral':
      mouthSvg = `<line x1="18" y1="33" x2="30" y2="33" stroke="#c06040" stroke-width="2.2" stroke-linecap="round"/>`;
      break;
    default:
      mouthSvg = `<path d="M17 31 Q24 37 31 31" stroke="#c06040" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }

  let accSvg = '';
  switch(cfg.accessory||'none'){
    case 'glasses':
      accSvg = `<circle cx="18" cy="24" r="6.5" fill="none" stroke="rgba(40,40,40,0.75)" stroke-width="1.5"/>
      <circle cx="30" cy="24" r="6.5" fill="none" stroke="rgba(40,40,40,0.75)" stroke-width="1.5"/>
      <line x1="24.5" y1="24" x2="23.5" y2="24" stroke="rgba(40,40,40,0.75)" stroke-width="1.5"/>
      <line x1="10" y1="22" x2="11.5" y2="22" stroke="rgba(40,40,40,0.75)" stroke-width="1.5"/>
      <line x1="38" y1="22" x2="36.5" y2="22" stroke="rgba(40,40,40,0.75)" stroke-width="1.5"/>`;
      break;
    case 'hat':
      accSvg = `<rect x="10" y="10" width="28" height="4" rx="2" fill="${oc}"/>
      <rect x="15" y="4" width="18" height="8" rx="4" fill="${oc}"/>`;
      break;
    case 'headband':
      accSvg = `<rect x="8" y="15" width="32" height="5" rx="2.5" fill="${oc}" opacity="0.85"/>`;
      break;
    case 'bow':
      accSvg = `<polygon points="20,8 24,13 20,18" fill="${oc}"/>
      <polygon points="28,8 24,13 28,18" fill="${oc}"/>
      <circle cx="24" cy="13" r="2.5" fill="${oc}"/>`;
      break;
  }

  return `<svg width="${sz}" height="${sz}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="12" fill="${oc}"/>
    ${hairSvg}
    <circle cx="24" cy="27" r="18" fill="${fc}"/>
    ${eyesSvg}${mouthSvg}${accSvg}
  </svg>`;
}

// ── Auth state ──────────────────────────────────────────────────────────
function getAuthToken(){ return localStorage.getItem('tl-auth-token'); }
function setAuthToken(t){ localStorage.setItem('tl-auth-token', t); }
function clearAuthToken(){ localStorage.removeItem('tl-auth-token'); }

function updateHeaderAuth(){
  const signinBtn   = document.getElementById('hdr-signin-btn');
  const avatarEl    = document.getElementById('hdr-avatar');
  const sbarLogout  = document.getElementById('sbar-logout');
  const sbarSep     = document.getElementById('sbar-logout-sep');
  if(currentUser){
    signinBtn.style.display = 'none';
    avatarEl.style.display  = 'flex';
    const cfg = currentUser.avatar || AV_DEFAULTS;
    avatarEl.innerHTML = renderAvatarSVG(cfg, 36);
    avatarEl.style.background   = 'transparent';
    avatarEl.style.padding      = '0';
    avatarEl.style.border       = 'none';
    avatarEl.style.width        = '36px';
    avatarEl.style.height       = '36px';
    avatarEl.style.borderRadius = '10px';
    avatarEl.style.overflow     = 'hidden';
    if(sbarLogout) sbarLogout.style.display = 'block';
    if(sbarSep)    sbarSep.style.display    = 'block';
  } else {
    signinBtn.style.display = 'block';
    avatarEl.style.display  = 'none';
    if(sbarLogout) sbarLogout.style.display = 'none';
    if(sbarSep)    sbarSep.style.display    = 'none';
  }
}

async function initAuth(){
  const token = getAuthToken();
  if(!token){
    // No stored token — show sign-in button but don't block the UI
    updateHeaderAuth();
    return;
  }
  // Validate stored token against server
  try{
    const res = await fetch('/auth/me', {headers:{Authorization:'Bearer '+token}});
    if(res.ok){
      currentUser = await res.json();
      updateHeaderAuth();
      refreshUserPin();
      // Returning user with valid token — go straight to map
      showToast(`Welcome back, ${currentUser.username}! 🎉`);
    } else {
      // Token expired or invalid — clear and show sign-in
      clearAuthToken();
      currentUser = null;
      updateHeaderAuth();
      openAuth();
    }
  } catch(e){
    // Network error — keep token, let them use app, retry later
    updateHeaderAuth();
  }
}

function clearSession(){
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tl-onboarded','1'); // prevent onboarding re-triggering
  location.reload();
}

// ── Auth modal ──────────────────────────────────────────────────────────
function openAuth(){
  authShowEmailStep();
  document.getElementById('auth-overlay').classList.add('show');
}
function closeAuth(){
  document.getElementById('auth-overlay').classList.remove('show');
}
function authShowEmailStep(){
  document.getElementById('auth-step-email').style.display='';
  document.getElementById('auth-step-otp').style.display='none';
  document.getElementById('auth-err').textContent='';
}
function authShowOtpStep(email){
  document.getElementById('auth-step-email').style.display='none';
  document.getElementById('auth-step-otp').style.display='';
  document.getElementById('auth-otp-sub').textContent=`Enter the 6-digit code sent to ${email}`;
  document.getElementById('auth-otp-err').textContent='';
  buildOtpInputs();
}

function buildOtpInputs(){
  const row = document.getElementById('otp-row');
  row.innerHTML='';
  for(let i=0;i<6;i++){
    const inp = document.createElement('input');
    inp.type='text'; inp.inputMode='numeric'; inp.maxLength=1;
    inp.className='otp-digit'; inp.id=`otp-${i}`;
    inp.addEventListener('input', e=>{
      const v = e.target.value.replace(/\D/g,'');
      e.target.value = v.slice(-1);
      if(v && i<5) document.getElementById(`otp-${i+1}`)?.focus();
    });
    inp.addEventListener('keydown', e=>{
      if(e.key==='Backspace'&&!inp.value&&i>0) document.getElementById(`otp-${i-1}`)?.focus();
    });
    inp.addEventListener('paste', e=>{
      e.preventDefault();
      const paste = (e.clipboardData||window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
      [...paste].forEach((ch,j)=>{
        const el = document.getElementById(`otp-${j}`);
        if(el) el.value=ch;
      });
      document.getElementById(`otp-${Math.min(paste.length,5)}`)?.focus();
    });
    row.appendChild(inp);
  }
  setTimeout(()=>document.getElementById('otp-0')?.focus(),100);
}

function getOtpValue(){
  return Array.from({length:6},(_,i)=>document.getElementById(`otp-${i}`)?.value||'').join('');
}

let _authEmail='';
async function authSendOtp(){
  const emailEl = document.getElementById('auth-email-input');
  const email   = emailEl.value.trim();
  const errEl   = document.getElementById('auth-err');
  if(!email||!email.includes('@')){ errEl.textContent='Please enter a valid email address'; return; }
  errEl.textContent='';
  const btn = document.getElementById('auth-send-btn');
  btn.disabled=true; btn.textContent='Sending…';
  try{
    const res  = await fetch('/auth/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const data = await res.json();
    if(!res.ok){ errEl.textContent=data.error||'Failed to send code'; btn.disabled=false; btn.textContent='Send code 📨'; return; }
    _authEmail = email;
    authShowOtpStep(email);
    if(data.dev_code){
      setTimeout(()=>{
        [...data.dev_code].forEach((ch,i)=>{const el=document.getElementById(`otp-${i}`);if(el)el.value=ch;});
        showToast('Dev: OTP auto-filled (' + data.dev_code + ')');
      },300);
    }
  } catch(e){ errEl.textContent='Network error. Try again.'; }
  btn.disabled=false; btn.textContent='Send code 📨';
}

async function authVerifyOtp(){
  const code   = getOtpValue();
  const errEl  = document.getElementById('auth-otp-err');
  if(code.length<6){ errEl.textContent='Enter all 6 digits'; return; }
  errEl.textContent='';
  const btn = document.getElementById('auth-verify-btn');
  btn.disabled=true; btn.textContent='Verifying…';
  try{
    const res  = await fetch('/auth/verify-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:_authEmail,code})});
    const data = await res.json();
    if(!res.ok){ errEl.textContent=data.error||'Invalid code'; btn.disabled=false; btn.textContent='Verify ✓'; return; }
    setAuthToken(data.token);
    currentUser = data.user;
    updateHeaderAuth();
    refreshUserPin();
    closeAuth();
    if(!data.user.avatar){
      // New user — show avatar creator fullscreen before revealing map
      showAvatarOnboard();
    } else {
      // Returning user with saved avatar — go straight to map
      showToast(`Welcome back, ${data.user.username}! 🎉`);
    }
  } catch(e){ errEl.textContent='Network error. Try again.'; }
  btn.disabled=false; btn.textContent='Verify ✓';
}

function openProfile(){
  if(!currentUser){ openAuth(); return; }
  const cfg = currentUser.avatar || AV_DEFAULTS;
  document.getElementById('prof-avatar-display').innerHTML = renderAvatarSVG(cfg, 80);
  document.getElementById('prof-username').textContent     = currentUser.username || '—';
  document.getElementById('prof-email-disp').textContent   = currentUser.email    || '—';
  document.getElementById('prof-karma').textContent        = currentUser.karma    || 0;
  openSheet('profile-sheet');
}

function authSignOut(){
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tl-onboarded','1'); // prevent onboarding re-triggering
  location.reload();
}

// ── Avatar first-run onboarding ─────────────────────────────────────────
function showAvatarOnboard(){
  avCfg = {...AV_DEFAULTS};
  buildAvatarOnboard();
  document.getElementById('avatar-onboard').classList.add('show');
}
function hideAvatarOnboard(){
  document.getElementById('avatar-onboard').classList.remove('show');
}

function buildAvatarOnboard(){
  const body = document.getElementById('avob-body');
  const prev = document.getElementById('avob-preview');
  if(!body||!prev) return;

  function swatch(colors, key){
    return `<div class="av-swatch-row">${colors.map(c=>
      `<button class="av-swatch${avCfg[key]===c?' sel':''}" style="background:${c}" onclick="avObSet('${key}','${c}')"></button>`
    ).join('')}</div>`;
  }
  function opts(options, key, labels){
    return `<div class="av-opt-row">${options.map((o,i)=>
      `<button class="av-opt${avCfg[key]===o?' sel':''}" onclick="avObSet('${key}','${o}')">${labels?labels[i]:o}</button>`
    ).join('')}</div>`;
  }

  body.innerHTML = `
    <div class="av-section"><div class="av-section-label">Skin tone</div>${swatch(AV_FACES,'face')}</div>
    <div class="av-section"><div class="av-section-label">Hair style</div>${opts(AV_HAIR_STYLES,'hair',['None 🥚','Short','Long','Curly'])}</div>
    <div class="av-section"><div class="av-section-label">Hair colour</div>${swatch(AV_HAIRS,'hairColor')}</div>
    <div class="av-section"><div class="av-section-label">Eyes</div>${opts(AV_EYES,'eyes',['Normal','Happy ^-^','Stars ✦'])}</div>
    <div class="av-section"><div class="av-section-label">Mouth</div>${opts(AV_MOUTHS,'mouth',['Smile','Grin','Neutral'])}</div>
    <div class="av-section"><div class="av-section-label">Accessory</div>${opts(AV_ACCS,'accessory',['None','Glasses 👓','Hat 🎩','Headband'])}</div>
    <div class="av-section"><div class="av-section-label">Outfit colour</div>${swatch(AV_OUTFITS,'outfit')}</div>`;

  prev.innerHTML = renderAvatarSVG(avCfg, 100);
}

function avObSet(key, val){
  avCfg[key] = val;
  buildAvatarOnboard();
}

async function saveAvatarOnboard(){
  const token = getAuthToken();
  if(!token || !currentUser){ hideAvatarOnboard(); return; }
  try{
    await fetch('/auth/update-avatar',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({avatar:avCfg})
    });
    currentUser.avatar = {...avCfg};
    updateHeaderAuth();
    refreshUserPin();
  } catch(e){ /* silent — avatar saves best-effort */ }
  hideAvatarOnboard();
  showToast(`Welcome, ${currentUser.username}! 🎉`);
}

function skipAvatarOnboard(){
  hideAvatarOnboard();
  showToast(`Welcome, ${currentUser?.username||''}! You can set an avatar anytime from the profile.`);
}

// ── Avatar creator (in-sheet, for edits) ────────────────────────────────
let avCfg = {...AV_DEFAULTS};

function buildAvatarCreator(){
  function makeSwatches(containerId, colors, cfgKey){
    const el = document.getElementById(containerId);
    if(!el) return;
    el.innerHTML = colors.map((col,i)=>`<button class="av-swatch${avCfg[cfgKey]===col?' sel':''}" style="background:${col}" title="${col}" onclick="avSet('${cfgKey}','${col}')"></button>`).join('');
  }
  function makeOpts(containerId, options, cfgKey, labels){
    const el = document.getElementById(containerId);
    if(!el) return;
    el.innerHTML = options.map((o,i)=>`<button class="av-opt${avCfg[cfgKey]===o?' sel':''}" onclick="avSet('${cfgKey}','${o}')">${labels?labels[i]:o}</button>`).join('');
  }
  makeSwatches('av-face-swatches',    AV_FACES,   'face');
  makeSwatches('av-hair-color-swatches', AV_HAIRS,'hairColor');
  makeSwatches('av-outfit-swatches',  AV_OUTFITS, 'outfit');
  makeOpts('av-hair-opts',  AV_HAIR_STYLES, 'hair',  ['None 🥚','Short','Long','Curly']);
  makeOpts('av-eyes-opts',  AV_EYES,        'eyes',  ['Normal 👀','Happy ^-^','Stars ✦']);
  makeOpts('av-mouth-opts', AV_MOUTHS,      'mouth', ['Smile :)','Grin :D','Neutral :|']);
  makeOpts('av-acc-opts',   AV_ACCS,        'accessory',['None','Glasses 👓','Hat 🎩','Headband']);
  renderAvPreview();
}

function avSet(key, val){
  avCfg[key] = val;
  buildAvatarCreator();
}

function renderAvPreview(){
  const el = document.getElementById('av-preview');
  if(el) el.innerHTML = renderAvatarSVG(avCfg, 96);
}

async function saveAvatar(){
  if(!currentUser){ showToast('Sign in first'); return; }
  const token = getAuthToken();
  try{
    const res = await fetch('/auth/update-avatar',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({avatar:avCfg})
    });
    if(res.ok){
      currentUser.avatar = {...avCfg};
      updateHeaderAuth();
      refreshUserPin();
      closeSheet('avatar-sheet');
      showToast('Avatar saved! 🎨');
    }
  } catch(e){ showToast('Save failed — try again'); }
}

// Load user's existing avatar into the creator when sheet opens
// Script loads at end of body, DOM is ready — no DOMContentLoaded needed
(()=>{
  const origOpen = window.openSheet;
  window.openSheet = function(id){
    if(id==='avatar-sheet'){
      avCfg = currentUser?.avatar ? {...currentUser.avatar} : {...AV_DEFAULTS};
      buildAvatarCreator();
    }
    if(id==='profile-sheet'&&currentUser) openProfile();
    origOpen(id);
  };
})();

// ── Auth nudge ──────────────────────────────────────────────────────────
let _nudgeTimer = null;
function scheduleNudge(delay=30000){
  clearTimeout(_nudgeTimer);
  if(currentUser) return;
  if(localStorage.getItem('tl-nudge-dismissed')) return;
  _nudgeTimer = setTimeout(()=>{
    if(!currentUser) document.getElementById('auth-nudge').classList.add('show');
  }, delay);
}
function dismissNudge(){
  document.getElementById('auth-nudge').classList.remove('show');
  localStorage.setItem('tl-nudge-dismissed','1');
}

// ═══════════════════════════════════════════════════════════════════════
// ── END AUTH ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

init();
initAuth();
