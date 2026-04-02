
// ── Constants ──────────────────────────────────────────────────────────
const API_URL    = '/api/vehicles';
const REFRESH_MS = 15000;

const ALERT_EFFECTS = {
  1:'No Service',2:'Reduced Service',3:'Significant Delays',
  4:'Detour',5:'Additional Service',6:'Modified Service',7:'Other Effect',8:'Unknown Effect'
};

// Route lines and stations loaded from GTFS — no hardcoded data
let gtfsRoutes = []; // [{routeId, name, mode, color, geojson}]

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

// ── Isometric view toggle ─────────────────────────────────────────────
let isoMode = false;
function toggleIso() {
  isoMode = !isoMode;
  const btn = document.getElementById('iso-btn');
  if (isoMode) {
    map.easeTo({ pitch: 55, bearing: map.getBearing() || -20, duration: 800 });
    btn.classList.add('active');
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    btn.classList.remove('active');
  }
}
window.toggleIso = toggleIso;

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
  pitch: 0,
  bearing: 0,
  antialias: true
});
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
map.dragRotate.enable();
map.touchPitch.enable();
window.map = map; // expose for navigation.js module
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

// ── Map style switcher ────────────────────────────────────────────────
const MAP_STYLES = {
  ghibli: '/styles/maplibre-style.json',
  pixel:  '/styles/maplibre-pixel.json',
};
let currentStyleId = 'ghibli';

function switchMapStyle(styleId) {
  const url = MAP_STYLES[styleId];
  if (!url) return;
  currentStyleId = styleId;
  map.setStyle(url);
  localStorage.setItem('mapStyle', styleId);
}
window.switchMapStyle = switchMapStyle;

// Restore saved style preference
const savedStyle = localStorage.getItem('mapStyle');
if (savedStyle && MAP_STYLES[savedStyle] && savedStyle !== 'ghibli') {
  switchMapStyle(savedStyle);
  const sel = document.getElementById('map-style-select');
  if (sel) sel.value = savedStyle;
}

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


// ── Route polylines from GTFS ──────────────────────────────────────────
const routePolylines={}; // routeId → layer id
async function buildRouteSources(){
  let fc;
  try{ fc = await fetch('/api/gtfs/shapes').then(r=>r.json()); }
  catch(e){ console.warn('Could not load GTFS shapes:', e); return; }
  gtfsRoutes = fc.features.map(f=>({
    routeId: f.properties.routeId,
    name:    f.properties.name,
    mode:    f.properties.mode,
    color:   f.properties.color,
    pts:     f.geometry.coordinates.map(([lng,lat])=>[lat,lng]),
  }));
  fc.features.forEach(f=>{
    const { routeId, mode, color } = f.properties;
    const id = 'route-' + routeId.replace(/\s+/g,'-');
    const weight  = mode==='train'?3.5:mode==='tram'?2.5:1.5;
    const opacity = mode==='bus'?0.3:0.45;
    if(map.getSource(id)) return; // already added
    map.addSource(id,{ type:'geojson', data:f });
    map.addLayer({
      id, type:'line', source:id,
      layout:{'line-cap':'round','line-join':'round','visibility':'none'},
      paint:{'line-color':color,'line-width':weight,'line-opacity':opacity}
    });
    routePolylines[routeId]=id;
  });
}
function syncRouteLines(){
  gtfsRoutes.forEach(({ routeId, mode, name })=>{
    const id=routePolylines[routeId]; if(!id||!map.getLayer(id)) return;
    const modeOk = fModes.has(mode);
    map.setLayoutProperty(id,'visibility',modeOk?'visible':'none');
  });
}

// ── Stations from GTFS ─────────────────────────────────────────────────
async function buildStations(){
  let stations;
  try{ stations = await fetch('/api/gtfs/stations').then(r=>r.json()); }
  catch(e){ console.warn('Could not load GTFS stations:', e); return; }
  stations.forEach(s=>{
    const el=document.createElement('div');
    el.className='station-dot';
    el.style.cssText='background:#094c8d;cursor:pointer';
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
const fModes=new Set(); // empty — vehicles load on demand when user enables a mode
let fSearch='';
let showAll=false; // hidden on load; auto-shows at zoom ≥ 15

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

  // Per-line filter rows removed — route list now comes from GTFS (hundreds of routes)
}

function toggleMode(mode){
  if(fModes.has(mode)) fModes.delete(mode); else fModes.add(mode);
  const tog=document.getElementById(`tog-${mode}`);
  if(tog) tog.className=`fp-tog ${fModes.has(mode)?'on':''}`;
  // Fetch vehicles if any mode is now active and we haven't loaded yet
  if(fModes.size > 0 && !isLive && !_vehicleFetchActive) startVehicleFeed();
  // Stop refreshing if all modes off
  if(fModes.size === 0) stopVehicleFeed();
  applyFilters();
}
function filterShowAll(){
  ['train','tram','bus','vline'].forEach(m=>fModes.add(m));
  buildFilterPanel();
  if(!_vehicleFetchActive) startVehicleFeed();
  applyFilters();
}
function filterClearAll(){
  fModes.clear();
  buildFilterPanel();
  stopVehicleFeed();
  applyFilters();
}
function passesBaseFilter(v){
  if(!fModes.has(v.mode)) return false;
  if(!passesProximity(v)) return false;
  return true;
}
function passesFilter(v){
  if(!fModes.has(v.mode)) return false;
  // If user explicitly enabled this mode, show it (skip proximity/showAll gates)
  return true;
}
function updateShowAllBtn(){
  const btn=document.getElementById('show-all-btn');
  if(!btn) return;
  btn.textContent=showAll?'Hide All':'Show Transport 🚆';
  btn.classList.toggle('active',showAll);
}
function toggleShowAll(){
  showAll=!showAll;
  updateShowAllBtn();
  applyFilters();
}
function openFilterSheet(){
  // Ensure vehicles are visible when the user opens the filter panel
  if(!showAll){ showAll=true; updateShowAllBtn(); applyFilters(); }
  openSheet('filter-sheet');
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
const MARKER_SZ = 22; // fixed size — never changes with zoom, never turns into a dot

function makeMarkerEl(v){
  const delayed = v.delay>2;
  const color = MODE_COLOR[v.mode]||v.color||'#5b8dee';
  const dotColor = delayed ? '#ff6b6b' : color;
  const zoom = map.getZoom();
  const dotSz = zoom >= 14 ? 10 : zoom >= 12 ? 8 : 6;
  const el = document.createElement('div');
  el.innerHTML=`<div class="vm-dot" style="width:${dotSz}px;height:${dotSz}px;background:${dotColor};border-radius:50%;border:1.5px solid rgba(255,255,255,0.8);box-shadow:0 0 4px ${dotColor}66;cursor:pointer"></div>`;
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
  // 2. Fall back to GTFS shape geometry if available
  if(!pts && v){
    const r=gtfsRoutes.find(r=>r.name===v.line||r.routeId===v.line);
    if(r) pts=r.pts;
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
  const z = map.getZoom();
  for(const id in markers){
    const m=markers[id]; const ip=interp[id];
    if(ip){
      const t=Math.min(1,(performance.now()-ip.startTime)/ip.duration);
      const e=easeInOut(t);
      const [lat,lng]=_interpPos(ip,e);
      m.setLngLat([lng,lat]);
    } else if(m._v) m.setLngLat([m._v.lng,m._v.lat]);
  }
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
          if(!pts){const r=gtfsRoutes.find(r=>r.name===v.line||r.routeId===v.line);if(r) pts=r.pts;}
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
let _vehicleFetchActive=false, _vehicleInterval=null;

function startVehicleFeed(){
  if(_vehicleFetchActive) return;
  _vehicleFetchActive=true;
  fetchLive().then(ok=>{
    if(ok && !_vehicleInterval){
      _vehicleInterval=setInterval(fetchLive, REFRESH_MS);
    }
  });
}
function stopVehicleFeed(){
  if(_vehicleInterval){ clearInterval(_vehicleInterval); _vehicleInterval=null; }
  // Remove all markers from map (keep data in memory for quick re-show)
  Object.keys(markers).forEach(id=>{
    if(markersOnMap.has(id)){ markers[id].remove(); markersOnMap.delete(id); }
  });
  updateCounts([]);
}

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
  // Use GTFS shapes — limit to a representative subset per mode
  const modeLimit={train:8,tram:6,bus:4,vline:2};
  const modeCounts={train:0,tram:0,bus:0,vline:0};
  for(const r of gtfsRoutes){
    const {mode,name,color,pts}=r;
    if(!pts||pts.length<2) continue;
    if((modeCounts[mode]||0)>=(modeLimit[mode]||0)) continue;
    modeCounts[mode]=(modeCounts[mode]||0)+1;
    const n=mode==='train'?4:mode==='tram'?5:3;
    for(let i=0;i<n;i++){
      const frac=i/n,total=pts.length-1,raw=frac*total;
      const seg=Math.min(Math.floor(raw),total-1),t=raw-seg;
      const a=pts[seg],b=pts[Math.min(seg+1,pts.length-1)];
      all.push({
        id:`demo_${id++}`,mode,line:name,color,label:name,dest:'',
        lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t,
        pts,seg,t,fwd:i%2===0,
        delay:Math.floor(Math.random()*7),
        speed:mode==='train'?0.07:mode==='tram'?0.038:0.028,
        bearing:Math.random()*360,_live:false,occupancy:null
      });
    }
  }
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
  updateShowAllBtn(); // set button label to match initial showAll=false
  buildFilterPanel();
  initSearch();
  initFromSearch();

  // Vehicles load on demand when user enables a mode in the filter panel
  // No demo or live fetch at startup — clean map

  fetchInspectors();
  setInterval(fetchInspectors, 60000);

  // Hide loader immediately — don't wait for map tiles
  hideLoader();

  // Map setup — resolve GPS in background
  try {
    await mapReady();
    buildRouteSources(); // fire-and-forget, don't block

    // Use cached GPS for instant startup, then update with fresh position
    try {
      const cached = JSON.parse(localStorage.getItem('tl-last-loc'));
      if(cached && cached.lat && cached.lng){
        userLoc = cached;
        map.jumpTo({center:[cached.lng,cached.lat], zoom:14});
        try { placeUserPin(cached.lat,cached.lng); } catch(e){}
      }
    } catch(e){}

    // Resolve fresh GPS in background
    locateUser().then(loc => {
      if(loc){
        userLoc = loc;
        localStorage.setItem('tl-last-loc', JSON.stringify(loc));
        map.flyTo({center:[loc.lng,loc.lat], zoom:14, duration:800});
        try { placeUserPin(loc.lat,loc.lng); } catch(e){}
        const fromInput = document.getElementById('from-input');
        if(fromInput && !fromInput.value) fromInput.value = 'Your location';
      } else {
        document.getElementById('sb-nearest').textContent = '📍 Enable location for nearby info';
      }
    });
    try { startLocationWatch(); } catch(e){ console.warn('Watch error:',e); }
  } catch(e){ console.error('Init map error:',e); }

  // Mode badge — starts as LIVE (data loads when user picks a filter)
  document.getElementById('mode-badge').className = 'mode-badge live';
  document.getElementById('mode-text').textContent = 'LIVE';

  if(!localStorage.getItem('tl-onboarded')) setTimeout(showOnboarding, 800);
}

// ═══════════════════════════════════════════════════════════════════════
// ── ADDRESS SEARCH ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

let destLoc = null;           // {lat, lng, name}
let destMarker = null;
let journeyLine = null;       // Placeholder dashed straight line
let journeyPolyline = null;   // Real route polyline from API
let _journeyLegLayerCount = 0; // Number of dynamic journey-leg-N layers currently on map
let allJourneys = [];          // All journey options returned by server
let activeJourneyIdx = 0;      // Which option is selected
let activeJourney = null;     // Best journey object from /api/journey
const journeyHighlightedIds = new Set();
// Maps run_ref/line → [[lat,lng],...] from /api/journey response
const journeyRoutePaths = new Map();

function initSearch(){
  const input = document.getElementById('addr-search-input');
  const results = document.getElementById('addr-suggestions');
  if(!input || !results) return;

  let debounceTimer = null;

  const typeIco = {train:'🚆',tram:'🚋',bus:'🚌',station:'🚉',stop:'🚏',suburb:'🏘',address:'🏠',university:'🎓',hospital:'🏥'};

  function renderSuggestions(data){
    results.innerHTML = data.map((l,i)=>{
      // Nominatim display_name is "Main Name, suburb, city, state, postcode, Australia"
      // Split on first comma: main = first part, sub = rest trimmed
      const parts = l.name.split(',');
      const main = parts[0].trim();
      const sub  = parts.slice(1,3).map(s=>s.trim()).filter(Boolean).join(', ');
      const ico  = typeIco[l.type]||'📍';
      const fullDisplay = sub ? `${main}, ${sub}` : main;
      return `<div class="addr-suggestion" data-i="${i}" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${escHtml(fullDisplay)}">
        <span class="addr-sug-ico">${ico}</span>
        <div>
          <div class="addr-result-main">${escHtml(main)}</div>
          ${sub?`<div class="addr-result-sub">${escHtml(sub)}</div>`:''}
        </div>
      </div>`;
    }).join('');
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
    // Show searching indicator immediately
    results.innerHTML='<div class="addr-searching">Searching…</div>';
    results.classList.add('show');
    debounceTimer = setTimeout(async () => {
      try{
        const r = await fetch(`/api/journey/autocomplete?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if(!Array.isArray(data)||!data.length){
          results.innerHTML='<div class="addr-no-results">No results found</div>';
          results.classList.add('show');
          return;
        }
        renderSuggestions(data);
      }catch(e){ console.error('[Search] fetch error:', e); }
    }, 300);
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

let customOrigin = null; // {lat, lng, name} — set when user picks a "from" address
let _originMarker = null; // green pin for custom origin

function initFromSearch(){
  const fromInput = document.getElementById('sb-from-input');
  const results   = document.getElementById('addr-suggestions');
  if(!fromInput || !results) return;

  let debounceTimer = null;
  const typeIco = {train:'🚆',tram:'🚋',bus:'🚌',station:'🚉',stop:'🚏',address:'🏠'};

  fromInput.addEventListener('focus', ()=>{
    // Clear "Your location" placeholder on focus so user can type
    if(fromInput.value === 'Your location') fromInput.value = '';
  });
  fromInput.addEventListener('blur', ()=>{
    // Restore placeholder if empty
    setTimeout(()=>{
      if(!fromInput.value.trim() && !customOrigin) fromInput.value = 'Your location';
    }, 200);
  });
  fromInput.addEventListener('input', ()=>{
    clearTimeout(debounceTimer);
    const q = fromInput.value.trim();

    // Detect "my location" variants — revert to GPS
    if(/^my\s*loc/i.test(q) || q.toLowerCase() === 'your location'){
      fromInput.value = 'Your location';
      customOrigin = null;
      if(_originMarker){ _originMarker.remove(); _originMarker = null; }
      results.innerHTML=''; results.classList.remove('show');
      return;
    }

    if(!q){ customOrigin=null; if(_originMarker){_originMarker.remove();_originMarker=null;} results.innerHTML=''; results.classList.remove('show'); return; }
    results.innerHTML='<div class="addr-searching">Searching…</div>';
    results.classList.add('show');
    debounceTimer = setTimeout(async ()=>{
      try{
        const r = await fetch(`/api/journey/autocomplete?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if(!data.length){ results.innerHTML='<div class="addr-no-results">No results</div>'; return; }
        results.innerHTML = data.map((l,i)=>{
          const parts = l.name.split(',');
          const main = parts[0].trim();
          const sub = parts.slice(1,3).map(s=>s.trim()).filter(Boolean).join(', ');
          const fullDisplay = sub ? `${main}, ${sub}` : main;
          const ico = typeIco[l.type]||'📍';
          return `<div class="addr-suggestion" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${escHtml(fullDisplay)}">
            <span class="addr-sug-ico">${ico}</span>
            <div><div class="addr-result-main">${escHtml(main)}</div>
            ${sub?`<div class="addr-result-sub">${escHtml(sub)}</div>`:''}</div>
          </div>`;
        }).join('');
        results.classList.add('show');
        results.querySelectorAll('.addr-suggestion').forEach(el=>{
          el.addEventListener('click', e=>{
            e.stopPropagation();
            const lat = parseFloat(el.dataset.lat);
            const lng = parseFloat(el.dataset.lng);
            const name = el.dataset.name;
            customOrigin = {lat, lng, name};
            fromInput.value = name;
            results.innerHTML=''; results.classList.remove('show');
            // Place green origin pin on map
            if(_originMarker){ _originMarker.remove(); }
            const pinEl = document.createElement('div');
            pinEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#2CA05A" stroke="white" stroke-width="3"/></svg>';
            _originMarker = new maplibregl.Marker({element:pinEl,anchor:'center'}).setLngLat([lng,lat]).addTo(map);
          });
        });
      }catch(e){}
    }, 300);
  });
}

function clearAddrSearch(){
  const input = document.getElementById('addr-search-input');
  const results = document.getElementById('addr-suggestions');
  if(input) input.value = '';
  if(results){ results.innerHTML=''; results.classList.remove('show'); }
}

function selectAddrResult(lat, lng, name, fullAddr){
  // Keep the destination name in the input, just hide suggestions
  const results = document.getElementById('addr-suggestions');
  if(results){ results.innerHTML=''; results.classList.remove('show'); }
  const input = document.getElementById('addr-search-input');
  if(input){ input.value = name; input.blur(); }
  placeDestPin(+lat, +lng, name, fullAddr);
  destLoc = {lat:+lat, lng:+lng, name};
  // Show bottom sheet in loading state right away
  showJourneyBottomSheetLoading(name);
  // Fetch real route from server — use custom origin if set, else GPS
  const origin = customOrigin || userLoc;
  if(origin){
    fetchAndActivateJourney(origin.lat, origin.lng, +lat, +lng, name);
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

    allJourneys = journeys;
    activeJourneyIdx = 0;
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

    updateJourneyPolyline();
    showJourneyBottomSheet(activeJourney);
    updateJourneyVehicles();

  }catch(e){
    // No data — fall back to bearing-based approach
    updateJourneyVehicles();
    showJourneyBottomSheet(null);
  }
}

function selectJourneyOption(idx){
  if(!allJourneys[idx]) return;
  activeJourneyIdx = idx;
  activeJourney = allJourneys[idx];
  // Refresh card highlight
  document.querySelectorAll('.sb-route-card').forEach((el,i) => el.classList.toggle('active', i===idx));
  updateJourneyPolyline();
  showJourneyBottomSheet(activeJourney, true); // true = skip re-rendering tabs
  updateJourneyVehicles();
}

function startJourneyGo(){
  // Placeholder for navigation mode — will expand later
  showToast('Navigation mode coming soon!');
}

function clearJourneyLayers(){
  for(let i = 0; i < _journeyLegLayerCount + 1; i++){
    const id = `journey-leg-${i}`;
    // Remove sub-layers (pulse, border, main) then sources
    for(const suffix of ['-pulse', '-border', '']){
      if(map.getLayer(id+suffix)) map.removeLayer(id+suffix);
    }
    if(map.getSource(id)) map.removeSource(id);
  }
  _journeyLegLayerCount = 0;
  if(map.getLayer('journey-route')) map.setLayoutProperty('journey-route','visibility','none');
}

function updateJourneyPolyline(){
  clearJourneyLayers();
  journeyPolyline = null;
  if(!activeJourney) return;

  const legs = activeJourney.legs || [];
  if(!legs.length) return;

  const LEG_COLORS = {
    train: '#094c8d',
    tram:  '#2CA05A',
    bus:   '#F5A623',
    vline: '#6c3483',
    walk:  '#888888',
  };

  let layerCount = 0;
  const allPts = [];

  const addSegment = (coords, color, isWalk) => {
    if(!coords || coords.length < 2) return;
    const baseId = `journey-leg-${layerCount++}`;
    const geojson = {type:'Feature',geometry:{type:'LineString',coordinates:coords}};
    map.addSource(baseId, {type:'geojson', data:geojson});

    if(isWalk){
      // Walk: soft purple dotted line with white border
      map.addLayer({
        id: baseId+'-border', type:'line', source:baseId,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#ffffff','line-width':6,'line-opacity':0.7}
      });
      map.addLayer({
        id: baseId, type:'line', source:baseId,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#6C63FF','line-width':4,'line-opacity':0.85,'line-dasharray':[0.01, 1.5]}
      });
    } else {
      // Transit: vibrant colored line with crisp dark border
      map.addLayer({
        id: baseId+'-border', type:'line', source:baseId,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':'#1a1a2e','line-width':10,'line-opacity':0.35}
      });
      map.addLayer({
        id: baseId, type:'line', source:baseId,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':color,'line-width':6,'line-opacity':0.95}
      });
      // Subtle white highlight line on top of transit route
      map.addLayer({
        id: baseId+'-pulse', type:'line', source:baseId,
        layout:{'line-cap':'round','line-join':'round'},
        paint:{
          'line-color':'rgba(255,255,255,0.25)',
          'line-width':2,
        }
      });
    }
    allPts.push(...coords);
  };

  for(const leg of legs){
    const isWalk = leg.type === 'walk';
    if(isWalk){
      if(leg.fromLat == null || leg.toLat == null) continue;
      const same = Math.abs(leg.fromLat - leg.toLat) < 1e-5 && Math.abs(leg.fromLng - leg.toLng) < 1e-5;
      if(same) continue;
      // Skip drawing micro walks on map (<150m) — just show in sidebar
      const walkDistM = haversine(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng) * 1000;
      if(walkDistM < 150) continue;
      // Use walk path if available, else straight line
      if(leg.walkPath && leg.walkPath.length >= 2){
        addSegment(leg.walkPath, LEG_COLORS.walk, true);
      } else {
        addSegment([[leg.fromLng, leg.fromLat],[leg.toLng, leg.toLat]], LEG_COLORS.walk, true);
      }
    } else {
      // Transit leg — routePath is [[lat,lng],...] from GTFS
      if(leg.routePath && leg.routePath.length >= 2){
        const coords = leg.routePath.map(p => [p[1], p[0]]); // [lat,lng] → [lng,lat]
        addSegment(coords, LEG_COLORS[leg.type] || leg.color || '#5b8dee', false);
      }
    }
  }

  _journeyLegLayerCount = layerCount;
  journeyPolyline = true;


  if(allPts.length > 0){
    // Switch to birds-eye for route clarity, then fit
    map.easeTo({pitch:0, bearing:0, duration:600});
    setTimeout(() => {
      const bounds = allPts.reduce((b,c) => b.extend(c), new maplibregl.LngLatBounds(allPts[0], allPts[0]));
      map.fitBounds(bounds, {padding:70, maxZoom:15, animate:true});
    }, 650);
  }
}

function showJourneyBottomSheetLoading(destName){
  const routesEl = document.getElementById('sb-routes');
  const detailEl = document.getElementById('sb-route-detail');
  if(routesEl) routesEl.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:.82rem;font-weight:700;text-align:center">Finding routes…</div>';
  if(detailEl) detailEl.innerHTML = '';
  const clearBtn = document.getElementById('sb-clear-btn');
  if(clearBtn) clearBtn.style.display = 'block';
  const goBtn = document.getElementById('jbs-go-btn');
  if(goBtn) goBtn.style.display = 'none';
}

function showJourneyBottomSheet(journey, skipTabs=false){
  const MODE_EMOJI = {train:'🚆',tram:'🚊',bus:'🚌',vline:'🚂',walk:'🚶'};
  const LEG_COLORS = {train:'#094c8d',tram:'#2CA05A',bus:'#F5A623',vline:'#6c3483'};
  const routesEl = document.getElementById('sb-routes');
  const detailEl = document.getElementById('sb-route-detail');

  if(!journey){
    if(routesEl) routesEl.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:.82rem;font-weight:700;text-align:center">No routes found — try a different destination</div>';
    if(detailEl) detailEl.innerHTML = '';
    return;
  }

  // Render route option cards
  if(!skipTabs && routesEl && allJourneys.length > 0){
    routesEl.innerHTML = allJourneys.map((j,i) => {
      const tl = (j.legs||[]).find(l=>l.type!=='walk');
      const icon = tl ? (MODE_EMOJI[tl.type]||'🚌') : '🚶';
      const color = tl ? (LEG_COLORS[tl.type]||'#5b8dee') : '#888';
      const summary = j.legs.filter(l=>l.type!=='walk').map(l=>`${MODE_EMOJI[l.type]||''} ${l.line||l.type}`).join(' → ') || 'Walk';
      return `<div class="sb-route-card${i===activeJourneyIdx?' active':''}" onclick="selectJourneyOption(${i})">
        <div class="sb-route-icon" style="background:${color}">${icon}</div>
        <div class="sb-route-info">
          <div class="sb-route-duration">${j.duration||'?'} min</div>
          <div class="sb-route-summary">${escHtml(summary)}</div>
        </div>
        <div class="sb-route-time">${j.depart||''}</div>
      </div>`;
    }).join('');
  }

  // Render step-by-step legs with timeline bar, board AND alight instructions
  if(detailEl){
    const legs = journey.legs || [];
    let html = '<div class="sb-timeline">';

    legs.forEach((leg, idx) => {
      const isWalk = leg.type === 'walk';
      const color  = isWalk ? '#aaa' : (LEG_COLORS[leg.type] || leg.color || '#5b8dee');
      const emoji  = MODE_EMOJI[leg.type] || '🚌';

      if(isWalk){
        html += `<div class="sb-tl-step walk-step">
          <div class="sb-tl-bar dashed"></div>
          <div class="sb-tl-dot walk"></div>
          <div class="sb-tl-content">
            <div class="sb-tl-title">🚶 Walk to ${escHtml(leg.to||'stop')}</div>
            <div class="sb-tl-sub">${leg.duration||'?'} min</div>
          </div>
        </div>`;
      } else {
        const sc = leg.stopCount || 0;
        const stopsStr = sc > 0 ? `${sc} stop${sc !== 1 ? 's' : ''}` : '';
        const depStr = leg.minsUntilDep > 0 ? `departs in ${leg.minsUntilDep} min` : '';
        const details = [stopsStr, `${leg.duration||'?'} min`, depStr].filter(Boolean).join(' · ');

        // Board instruction — with tall coloured bar
        html += `<div class="sb-tl-step board-step">
          <div class="sb-tl-bar" style="background:${color}"></div>
          <div class="sb-tl-dot transit" style="border-color:${color}"></div>
          <div class="sb-tl-content">
            <div class="sb-tl-title">${emoji} Board <strong>${escHtml(leg.line||leg.type)}</strong> at ${escHtml(leg.from||'')}</div>
            <div class="sb-tl-sub">${details}</div>
          </div>
        </div>`;

        // Alight instruction — no bar, just a dot
        html += `<div class="sb-tl-step alight-step">
          <div class="sb-tl-dot transit" style="border-color:${color}"></div>
          <div class="sb-tl-content">
            <div class="sb-tl-title">Get off at ${escHtml(leg.to||'')}</div>
          </div>
        </div>`;
      }
    });

    // Final destination dot
    html += `<div class="sb-tl-step last">
      <div class="sb-tl-dot dest"></div>
      <div class="sb-tl-content"><div class="sb-tl-title">📍 ${escHtml(destLoc?.name||'Destination')}</div></div>
    </div>`;
    html += '</div>';
    detailEl.innerHTML = html;
  }

  // Show Go button
  const goBtn = document.getElementById('jbs-go-btn');
  if(goBtn) goBtn.style.display = journey ? 'block' : 'none';
  const clearBtn = document.getElementById('sb-clear-btn');
  if(clearBtn) clearBtn.style.display = 'block';
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

  // No bearing fallback — only show vehicles matched to the actual route
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
    clearJourneyLayers();
    journeyPolyline=null;
  }
  clearJourneyHighlights();
  journeyRoutePaths.clear();
  activeJourney = null;
  allJourneys = [];
  activeJourneyIdx = 0;
  destLoc = null;
  // Clear sidebar route display
  const routesEl = document.getElementById('sb-routes');
  const detailEl = document.getElementById('sb-route-detail');
  if(routesEl) routesEl.innerHTML = '';
  if(detailEl) detailEl.innerHTML = '';
  const goBtn = document.getElementById('jbs-go-btn');
  if(goBtn) goBtn.style.display = 'none';
  const clearBtn = document.getElementById('sb-clear-btn');
  if(clearBtn) clearBtn.style.display = 'none';
  // Clear search inputs and custom origin
  const searchInput = document.getElementById('addr-search-input');
  if(searchInput) searchInput.value = '';
  const fromInput = document.getElementById('sb-from-input');
  if(fromInput) fromInput.value = 'Your location';
  customOrigin = null;
  if(_originMarker){ _originMarker.remove(); _originMarker = null; }
  // Restore isometric view
  map.easeTo({pitch:0, bearing:0, duration:800});
}

// Refresh journey vehicle highlights on each data update
const _origUpdateCounts = typeof updateCounts==='function' ? updateCounts : null;

// ═══════════════════════════════════════════════════════════════════════
// Auth system loaded from auth.js — currentUser, renderAvatarSVG, etc. on window

init();
