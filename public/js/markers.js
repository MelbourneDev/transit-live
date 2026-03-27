/**
 * markers.js — Zelda Shrine & Animal Crossing Ad Spot Markers
 * for Transit-Live Melbourne
 *
 * Usage:
 *   import { MarkerSystem } from './markers.js';
 *   const markers = new MarkerSystem(map);
 *   markers.loadAdSpots(geojsonFeatureCollection);
 *   markers.clear();
 */


// ─────────────────────────────────────────────────────────────────────────────
// SVG Templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zelda-style Ancient Shrine marker.
 * Octagonal structure with a glowing blue core — represents a "pinned" ad location.
 *
 * @param {string} accentColor  — hex colour for the shrine glow (#60b8ee default)
 * @param {string} label        — short text label (1-2 chars) drawn on the core
 */
function shrineSVG(accentColor = '#60b8ee', label = '★') {
  const glow  = accentColor;
  const light = accentColor + 'aa';
  const dark  = accentColor.replace(/ee$/, '88');

  return `
<svg width="48" height="60" viewBox="0 0 48 60" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="sg-core" cx="50%" cy="40%">
      <stop offset="0%"   stop-color="#daf8ff"/>
      <stop offset="60%"  stop-color="${glow}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </radialGradient>
    <radialGradient id="sg-glow" cx="50%" cy="50%">
      <stop offset="0%"   stop-color="${light}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${glow}"  stop-opacity="0"/>
    </radialGradient>
    <filter id="sg-blur">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>

  <!-- Outer glow halo -->
  <ellipse cx="24" cy="48" rx="14" ry="5" fill="${light}" filter="url(#sg-blur)" opacity="0.6"/>

  <!-- Shrine stem / pillar -->
  <rect x="21" y="38" width="6" height="12" rx="2"
        fill="url(#sg-core)" opacity="0.85"/>

  <!-- Octagonal body -->
  <polygon
    points="24,4 33,8 39,17 39,27 33,36 15,36 9,27 9,17 15,8"
    fill="url(#sg-core)"
    stroke="#a8e8f8" stroke-width="1.2" opacity="0.95"/>

  <!-- Inner ring -->
  <polygon
    points="24,10 30,13 34,19 34,25 30,31 18,31 14,25 14,19 18,13"
    fill="none" stroke="${light}" stroke-width="0.8" opacity="0.7"/>

  <!-- Glowing core circle -->
  <circle cx="24" cy="21" r="8" fill="url(#sg-glow)" opacity="0.5" filter="url(#sg-blur)"/>
  <circle cx="24" cy="21" r="5.5"
          fill="radial-gradient(#fff,${glow})"
          stroke="#ffffff" stroke-width="0.8" opacity="0.95"/>

  <!-- Label text -->
  <text x="24" y="25" text-anchor="middle" dominant-baseline="auto"
        font-family="system-ui,sans-serif" font-size="7" font-weight="bold"
        fill="#ffffff" opacity="0.95">${label}</text>

  <!-- Corner rune marks -->
  <circle cx="14" cy="13" r="1.5" fill="#ffffff" opacity="0.6"/>
  <circle cx="34" cy="13" r="1.5" fill="#ffffff" opacity="0.6"/>
  <circle cx="34" cy="29" r="1.5" fill="#ffffff" opacity="0.6"/>
  <circle cx="14" cy="29" r="1.5" fill="#ffffff" opacity="0.6"/>
</svg>`.trim();
}


/**
 * Animal Crossing–style leaf shop marker.
 * Friendly pastel leaf with a cute dot-eye face.
 *
 * @param {string} leafColor   — hex fill (#8ecf6a default — AC leaf green)
 * @param {string} emoji       — emoji rendered in the centre of the leaf
 */
function leafMarkerSVG(leafColor = '#8ecf6a', emoji = '🛍') {
  const dark   = leafColor.replace(/[a-f0-9]{2}$/i, m => Math.max(0, parseInt(m,16) - 40).toString(16).padStart(2,'0'));
  const light  = '#ffffff';

  return `
<svg width="44" height="54" viewBox="0 0 44 54" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="lm-fill" cx="40%" cy="30%">
      <stop offset="0%"   stop-color="#d8f5be"/>
      <stop offset="100%" stop-color="${leafColor}"/>
    </radialGradient>
    <filter id="lm-shadow">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="${leafColor}" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Leaf shadow -->
  <ellipse cx="22" cy="50" rx="10" ry="3.5" fill="${leafColor}" opacity="0.25"/>

  <!-- Leaf body — AC-style asymmetric roundish leaf -->
  <path d="
    M22,6
    C30,2 42,10 40,22
    C38,32 30,40 22,44
    C14,40 6,32 4,22
    C2,10 14,2 22,6 Z
  " fill="url(#lm-fill)" stroke="${dark}" stroke-width="1.2"
  filter="url(#lm-shadow)"/>

  <!-- Central vein -->
  <path d="M22,10 C22,20 22,32 22,43"
        stroke="${light}" stroke-width="1" stroke-opacity="0.5"
        fill="none" stroke-linecap="round"/>

  <!-- Side veins left -->
  <path d="M22,18 C18,16 12,17 10,18" stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>
  <path d="M22,25 C16,22 10,23 8,25"  stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>
  <path d="M22,32 C17,29 12,30 10,32" stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>

  <!-- Side veins right -->
  <path d="M22,18 C26,16 32,17 34,18" stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>
  <path d="M22,25 C28,22 34,23 36,25" stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>
  <path d="M22,32 C27,29 32,30 34,32" stroke="${light}" stroke-width="0.7" stroke-opacity="0.4" fill="none"/>

  <!-- Emoji -->
  <text x="22" y="28" text-anchor="middle" dominant-baseline="middle"
        font-size="16">${emoji}</text>

  <!-- Cute dot eyes (Animal Crossing style) -->
  <circle cx="17" cy="18" r="1.8" fill="#3a6030" opacity="0.8"/>
  <circle cx="27" cy="18" r="1.8" fill="#3a6030" opacity="0.8"/>
  <!-- Eye shine -->
  <circle cx="17.7" cy="17.3" r="0.7" fill="${light}" opacity="0.9"/>
  <circle cx="27.7" cy="17.3" r="0.7" fill="${light}" opacity="0.9"/>
  <!-- Smile -->
  <path d="M18,22 Q22,25 26,22" stroke="#3a6030" stroke-width="1.2"
        fill="none" stroke-linecap="round" opacity="0.8"/>
</svg>`.trim();
}


/**
 * Pulse ring element (injected once into DOM) for highlighted / active markers.
 */
function pulseCSSOnce() {
  if (document.getElementById('tl-marker-css')) return;
  const style = document.createElement('style');
  style.id = 'tl-marker-css';
  style.textContent = `
    .tl-marker-wrap { cursor: pointer; transition: transform 0.15s ease; }
    .tl-marker-wrap:hover { transform: scale(1.15) translateY(-3px); }
    .tl-marker-wrap.active { transform: scale(1.2) translateY(-4px); }

    .tl-pulse-ring {
      position: absolute;
      top: 50%; left: 50%;
      width: 60px; height: 60px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      border: 2px solid var(--ring-color, #60b8ee);
      animation: tl-ring 2s ease-out infinite;
      pointer-events: none;
    }
    @keyframes tl-ring {
      0%   { transform: translate(-50%,-50%) scale(0.5); opacity: 0.8; }
      100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0; }
    }

    .tl-ad-popup {
      background: #fefaf0;
      border: 2px solid #a8d8e8;
      border-radius: 16px;
      padding: 12px 16px;
      min-width: 180px;
      max-width: 240px;
      font-family: 'Nunito', system-ui, sans-serif;
      box-shadow: 0 8px 32px rgba(91,160,220,0.25), 0 2px 8px rgba(0,0,0,0.1);
    }
    .tl-ad-popup-name {
      font-weight: 800;
      font-size: 0.95rem;
      color: #3a5030;
      margin-bottom: 2px;
    }
    .tl-ad-popup-type {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6a9060;
      margin-bottom: 6px;
    }
    .tl-ad-popup-desc {
      font-size: 0.82rem;
      color: #5a6850;
      line-height: 1.45;
    }
    .tl-ad-popup-cta {
      display: inline-block;
      margin-top: 8px;
      padding: 5px 14px;
      background: linear-gradient(135deg, #a8d8e8, #8ecf6a);
      color: #fff;
      font-weight: 800;
      font-size: 0.78rem;
      border-radius: 20px;
      border: none;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(91,160,220,0.3);
      transition: transform 0.12s, box-shadow 0.12s;
    }
    .tl-ad-popup-cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(91,160,220,0.5);
    }

    /* MapLibre popup override */
    .maplibregl-popup-content.tl-popup-wrap {
      background: transparent !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    .maplibregl-popup-tip { border-top-color: #a8d8e8 !important; }
  `;
  document.head.appendChild(style);
}


// ─────────────────────────────────────────────────────────────────────────────
// MarkerSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ad-spot marker categories.
 * Each entry: [markerType, accentColor, emoji, label]
 */
const CATEGORY_STYLES = {
  cafe:        ['leaf',   '#8ecf6a', '☕', 'CF'],
  restaurant:  ['leaf',   '#f0b56a', '🍜', 'RS'],
  shop:        ['leaf',   '#c8a8e8', '🛍', 'SH'],
  bar:         ['leaf',   '#f08888', '🍺', 'BR'],
  attraction:  ['shrine', '#60b8ee', '🎠', '★'],
  event:       ['shrine', '#f0c860', '🎪', '!'],
  transit:     ['shrine', '#94b8f8', '🚆', 'T'],
  default:     ['leaf',   '#8ecf6a', '📍', '?'],
};


export class MarkerSystem {
  /**
   * @param {maplibregl.Map} map
   * @param {object}         opts
   * @param {Function}       opts.onAdClick  — called with the feature properties when an ad spot is tapped
   */
  constructor(map, opts = {}) {
    this.map = map;
    this.onAdClick = opts.onAdClick || null;
    this._markers = [];
    this._activePopup = null;
    pulseCSSOnce();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Load a GeoJSON FeatureCollection of ad spots and place custom markers.
   *
   * Expected feature properties:
   *   name:        string   — Business / location name
   *   category:    string   — One of: cafe, restaurant, shop, bar, attraction, event, transit
   *   description: string   — Short ad tagline
   *   cta:         string   — CTA button text (e.g. "See deal")
   *   cta_url:     string   — URL to open on CTA click
   *
   * @param {GeoJSON.FeatureCollection} geojson
   */
  loadAdSpots(geojson) {
    this.clear();
    (geojson.features || []).forEach(f => this._addSpot(f));
  }

  /**
   * Add a single ad spot marker from a GeoJSON Feature.
   * @param {GeoJSON.Feature} feature
   */
  addSpot(feature) {
    this._addSpot(feature);
  }

  /** Remove all markers and popups */
  clear() {
    this._markers.forEach(m => m.marker.remove());
    this._markers = [];
    if (this._activePopup) { this._activePopup.remove(); this._activePopup = null; }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _addSpot(feature) {
    const props = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    const cat = (props.category || 'default').toLowerCase();
    const [type, color, emoji, label] = CATEGORY_STYLES[cat] || CATEGORY_STYLES.default;

    // Build SVG element
    const svgStr = type === 'shrine'
      ? shrineSVG(color, label)
      : leafMarkerSVG(color, emoji);

    // Wrap in a div for hover/active states
    const wrap = document.createElement('div');
    wrap.className = 'tl-marker-wrap';
    wrap.style.cssText = 'position:relative;width:48px;height:60px;';

    // Pulse ring (shown on hover via CSS)
    const ring = document.createElement('div');
    ring.className = 'tl-pulse-ring';
    ring.style.setProperty('--ring-color', color);
    wrap.appendChild(ring);

    wrap.insertAdjacentHTML('beforeend', svgStr);

    // Click → show popup
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showPopup(feature, [lng, lat], color);
      wrap.classList.add('active');
      if (this.onAdClick) this.onAdClick(props, feature);
    });

    // Remove active on map click
    this.map.on('click', () => wrap.classList.remove('active'));

    const { maplibregl } = window;
    if (!maplibregl) {
      console.warn('[MarkerSystem] window.maplibregl not found');
      return;
    }

    const marker = new maplibregl.Marker({ element: wrap, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(this.map);

    this._markers.push({ marker, feature });
  }

  _showPopup(feature, lngLat, accentColor) {
    if (this._activePopup) { this._activePopup.remove(); this._activePopup = null; }

    const p = feature.properties || {};
    const ctaHtml = p.cta
      ? `<button class="tl-ad-popup-cta" onclick="window.open('${p.cta_url || '#'}','_blank')">${p.cta}</button>`
      : '';

    const popupHtml = `
      <div class="tl-ad-popup" style="border-color:${accentColor}">
        <div class="tl-ad-popup-name">${p.name || 'Ad Spot'}</div>
        <div class="tl-ad-popup-type">${p.category || ''}</div>
        ${p.description ? `<div class="tl-ad-popup-desc">${p.description}</div>` : ''}
        ${ctaHtml}
      </div>
    `;

    const { maplibregl } = window;
    this._activePopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: [0, -58],
      className: 'tl-popup-wrap',
      maxWidth: '260px',
    })
      .setLngLat(lngLat)
      .setHTML(popupHtml)
      .addTo(this.map);
  }
}


