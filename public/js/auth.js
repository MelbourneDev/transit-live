// ── AUTH SYSTEM ─────────────────────────────────────────────────────────
// Avatar SVG rendering, OTP flow, profile, nudge system
// Extracted from app.js — all DOM interactions use window globals for
// interop with the non-module app.js script.
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
    updateHeaderAuth();
    return;
  }
  try{
    const res = await fetch('/auth/me', {headers:{Authorization:'Bearer '+token}});
    if(res.ok){
      currentUser = await res.json();
      updateHeaderAuth();
      refreshUserPin();
      showToast(`Welcome back, ${currentUser.username}! 🎉`);
    } else {
      clearAuthToken();
      currentUser = null;
      updateHeaderAuth();
      openAuth();
    }
  } catch(e){
    updateHeaderAuth();
  }
}

function clearSession(){
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tl-onboarded','1');
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
      showAvatarOnboard();
    } else {
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
  localStorage.setItem('tl-onboarded','1');
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

// Intercept openSheet to pre-populate avatar creator and profile
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

// ── Expose to window for HTML onclick handlers and app.js interop ──────
window.currentUser      = null; // proxy — use getter below
window.renderAvatarSVG  = renderAvatarSVG;
window.AV_DEFAULTS      = AV_DEFAULTS;
window.initAuth         = initAuth;
window.openAuth         = openAuth;
window.closeAuth        = closeAuth;
window.authSendOtp      = authSendOtp;
window.authVerifyOtp    = authVerifyOtp;
window.authShowEmailStep= authShowEmailStep;
window.openProfile      = openProfile;
window.authSignOut      = authSignOut;
window.clearSession     = clearSession;
window.showAvatarOnboard= showAvatarOnboard;
window.saveAvatarOnboard= saveAvatarOnboard;
window.skipAvatarOnboard= skipAvatarOnboard;
window.saveAvatar       = saveAvatar;
window.avSet            = avSet;
window.avObSet          = avObSet;
window.scheduleNudge    = scheduleNudge;
window.dismissNudge     = dismissNudge;

// Expose currentUser as a getter/setter so app.js can read it
Object.defineProperty(window, 'currentUser', {
  get(){ return currentUser; },
  set(v){ currentUser = v; },
  configurable: true,
});

// Self-initialize auth on load
initAuth();
