/**
 * navigation.js — Fantasy Trail Navigation for Transit-Live Melbourne
 *
 * Stack: MapLibre GL JS + self-hosted Valhalla routing API
 *
 * Usage:
 *   import { NavigationController } from './navigation.js';
 *   const nav = new NavigationController(map, { valhallaUrl: 'https://your-valhalla.example.com' });
 *   nav.route({ lng: 144.9631, lat: -37.8136 }, { lng: 144.982, lat: -37.821 }, 'pedestrian');
 *   nav.clear();
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COSTING_MAP = {
  pedestrian: { costing: 'pedestrian', icon: '🚶', label: 'Walking' },
  bicycle:    { costing: 'bicycle',    icon: '🚲', label: 'Cycling' },
  auto:       { costing: 'auto',       icon: '🚗', label: 'Driving' },
  transit:    { costing: 'transit',    icon: '🚆', label: 'Transit'  },
};

// Layer IDs that must exist in the style JSON before we can show the route
const ROUTE_LAYER_IDS = [
  'navigation-route-glow-outer',
  'navigation-route-glow-mid',
  'navigation-route-core',
  'navigation-route-dash',
];

// Source ID the style already declares as an empty placeholder
const ROUTE_SOURCE_ID = 'navigation-route';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Decode a Valhalla-encoded polyline6 string into [lng, lat] pairs */
function decodePolyline6(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

/** Format seconds → "X min" or "X hr Y min" */
function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

/** Format metres → "X km" or "X m" */
function formatDistance(metres) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/** Convert Valhalla manoeuvre type → readable instruction */
function formatManoeuvre(m) {
  const type = m.type || 0;
  const street = m.street_names?.[0] || '';
  const dist = formatDistance((m.length || 0) * 1000);

  const TYPES = {
    1:  `Head ${m.begin_cardinal_direction || 'forward'}${street ? ' on ' + street : ''}`,
    2:  `Turn right${street ? ' onto ' + street : ''}`,
    3:  `Turn slightly right${street ? ' onto ' + street : ''}`,
    4:  `Turn sharply right${street ? ' onto ' + street : ''}`,
    5:  `Turn left${street ? ' onto ' + street : ''}`,
    6:  `Turn slightly left${street ? ' onto ' + street : ''}`,
    7:  `Turn sharply left${street ? ' onto ' + street : ''}`,
    8:  `Continue straight${street ? ' on ' + street : ''}`,
    9:  `Take the exit`,
    10: `Keep right`,
    11: `Keep left`,
    15: 'Arrive at your destination',
    17: 'Enter the roundabout',
    18: 'Exit the roundabout',
  };
  return `${TYPES[type] || 'Continue'} — ${dist}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// NavigationController
// ─────────────────────────────────────────────────────────────────────────────

export class NavigationController {
  /**
   * @param {maplibregl.Map} map        — Your MapLibre map instance
   * @param {object}         opts
   * @param {string}         opts.valhallaUrl  — Base URL of your Valhalla instance
   *                                             e.g. "https://valhalla.yourserver.com"
   *                                             or "http://localhost:8002" for local dev
   */
  constructor(map, opts = {}) {
    this.map = map;
    this.valhallaUrl = (opts.valhallaUrl || 'https://valhalla.stadiamaps.com').replace(/\/$/, '');
    this._markers = [];
    this._animationFrame = null;
    this._dashOffset = 0;
    this._ensureSource();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetch and draw a route between two points.
   *
   * @param {{ lng: number, lat: number }} origin
   * @param {{ lng: number, lat: number }} destination
   * @param {'pedestrian'|'bicycle'|'auto'|'transit'} mode
   * @returns {Promise<RouteResult>}
   */
  async route(origin, destination, mode = 'pedestrian') {
    const costingInfo = COSTING_MAP[mode] || COSTING_MAP.pedestrian;

    // Build the Valhalla /route request body
    const body = {
      locations: [
        { lon: origin.lng,      lat: origin.lat,      type: 'break' },
        { lon: destination.lng, lat: destination.lat, type: 'break' },
      ],
      costing: costingInfo.costing,
      costing_options: {
        pedestrian: { use_ferry: 0, use_living_streets: 0.5 },
        bicycle:    { bicycle_type: 'Hybrid', use_roads: 0.3 },
        auto:       { use_tolls: 0, use_highways: 0.5 },
      },
      directions_options: { units: 'kilometres', language: 'en-AU' },
      api_key: '',
    };

    const response = await fetch(`${this.valhallaUrl}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Valhalla error ${response.status}`);
    }

    const data = await response.json();
    const leg = data.trip?.legs?.[0];
    if (!leg) throw new Error('No route found');

    // Decode the geometry
    const coordinates = decodePolyline6(leg.shape);

    // Build a GeoJSON LineString
    const geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    };

    // Draw the route
    this._drawRoute(geojson);
    this._placeMarkers(origin, destination, costingInfo.icon);

    // Compute summary
    const summary = data.trip.summary;
    const result = {
      duration:  formatDuration(summary.time),
      distance:  formatDistance(summary.length * 1000),
      mode:      costingInfo.label,
      icon:      costingInfo.icon,
      manoeuvres: leg.maneuvers?.map(formatManoeuvre) || [],
      geojson,
      bounds:    coordinates.reduce(
        (b, [lng, lat]) => ({
          minLng: Math.min(b.minLng, lng), maxLng: Math.max(b.maxLng, lng),
          minLat: Math.min(b.minLat, lat), maxLat: Math.max(b.maxLat, lat),
        }),
        { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
      ),
    };

    // Fit map to route
    this.map.fitBounds(
      [[result.bounds.minLng, result.bounds.minLat], [result.bounds.maxLng, result.bounds.maxLat]],
      { padding: { top: 80, bottom: 220, left: 60, right: 60 }, maxZoom: 16, duration: 900 }
    );

    return result;
  }

  /** Remove the route and markers from the map */
  clear() {
    this._setRouteLayersVisible(false);

    const src = this.map.getSource(ROUTE_SOURCE_ID);
    if (src) src.setData({ type: 'FeatureCollection', features: [] });

    this._markers.forEach(m => m.remove());
    this._markers = [];

    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Make sure the GeoJSON source exists (layers are declared in the style JSON) */
  _ensureSource() {
    const ready = () => {
      if (!this.map.getSource(ROUTE_SOURCE_ID)) {
        this.map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          lineMetrics: true,          // Required for line-gradient
          data: { type: 'FeatureCollection', features: [] },
        });
        // If layers aren't in style JSON, add them programmatically as fallback
        if (!this.map.getLayer('navigation-route-core')) {
          this._addFallbackLayers();
        }
      }
    };
    if (this.map.loaded()) ready();
    else this.map.once('load', ready);
  }

  _drawRoute(geojson) {
    const src = this.map.getSource(ROUTE_SOURCE_ID);
    if (src) {
      src.setData(geojson);
    } else {
      // Re-add if removed
      this.map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        lineMetrics: true,
        data: geojson,
      });
      this._addFallbackLayers();
    }

    this._setRouteLayersVisible(true);
    this._startDashAnimation();
  }

  _setRouteLayersVisible(visible) {
    const v = visible ? 'visible' : 'none';
    ROUTE_LAYER_IDS.forEach(id => {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', v);
      }
    });
  }

  /**
   * Animate the dashed white overlay on the route — gives the "magic trail" effect.
   * Uses requestAnimationFrame to scroll the dash offset each frame.
   */
  _startDashAnimation() {
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);

    const dashLayer = 'navigation-route-dash';
    const step = () => {
      if (!this.map.getLayer(dashLayer)) return;
      this._dashOffset = (this._dashOffset - 0.3) % 20;
      this.map.setPaintProperty(dashLayer, 'line-dasharray', [
        0, 4 + Math.sin(Date.now() / 800) * 1.5,   // pulsing gap
        2, 4
      ]);
      this.map.setLayoutProperty(dashLayer, 'line-offset', this._dashOffset);
      this._animationFrame = requestAnimationFrame(step);
    };
    this._animationFrame = requestAnimationFrame(step);
  }

  /** Place origin and destination custom markers */
  _placeMarkers(origin, destination, modeIcon) {
    this._markers.forEach(m => m.remove());
    this._markers = [];

    // Origin: pulsing green dot (Korok seed style)
    const originEl = document.createElement('div');
    originEl.innerHTML = `
      <div style="
        width:20px;height:20px;border-radius:50%;
        background:radial-gradient(circle at 40% 35%, #c8f8d8, #5bc87a);
        border:2.5px solid #3a9a5a;
        box-shadow:0 0 0 6px rgba(91,200,122,0.25), 0 0 12px rgba(91,200,122,0.5);
        animation: tl-pulse 2s ease-in-out infinite;
      "></div>
      <style>
        @keyframes tl-pulse {
          0%,100%{box-shadow:0 0 0 6px rgba(91,200,122,0.25),0 0 12px rgba(91,200,122,0.5)}
          50%{box-shadow:0 0 0 12px rgba(91,200,122,0.1),0 0 20px rgba(91,200,122,0.7)}
        }
      </style>
    `;
    originEl.style.cssText = 'cursor:pointer;transform:translate(-50%,-50%)';

    // Destination: shrine-style beacon (see markers.js for full shrine marker)
    const destEl = document.createElement('div');
    destEl.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;
        filter:drop-shadow(0 4px 8px rgba(91,160,220,0.6));
      ">
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:radial-gradient(circle at 40% 35%, #daf0ff, #60b8ee);
          border:2.5px solid #a8d8e8;
          display:flex;align-items:center;justify-content:center;
          font-size:18px;line-height:1;
          box-shadow:0 0 16px rgba(91,160,220,0.8), inset 0 1px 2px rgba(255,255,255,0.7);
          animation: tl-beacon 2.5s ease-in-out infinite;
        ">${modeIcon}</div>
        <div style="
          width:2px;height:10px;
          background:linear-gradient(to bottom, #60b8ee, transparent);
          margin-top:2px;
        "></div>
      </div>
      <style>
        @keyframes tl-beacon {
          0%,100%{transform:translateY(0)}
          50%{transform:translateY(-4px)}
        }
      </style>
    `;
    destEl.style.cssText = 'cursor:pointer;transform:translate(-50%,-100%)';

    const { maplibregl } = window;
    if (!maplibregl) {
      console.warn('[NavigationController] window.maplibregl not found for marker placement');
      return;
    }

    this._markers.push(
      new maplibregl.Marker({ element: originEl })
        .setLngLat([origin.lng, origin.lat])
        .addTo(this.map)
    );
    this._markers.push(
      new maplibregl.Marker({ element: destEl })
        .setLngLat([destination.lng, destination.lat])
        .addTo(this.map)
    );
  }

  /** Fallback: add layers in JS if they're not declared in the style JSON */
  _addFallbackLayers() {
    const layers = [
      {
        id: 'navigation-route-glow-outer',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#7dd4f8', 'line-width': 18, 'line-opacity': 0.2, 'line-blur': 6 },
      },
      {
        id: 'navigation-route-glow-mid',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#4fc3f7', 'line-width': 10, 'line-opacity': 0.4, 'line-blur': 2 },
      },
      {
        id: 'navigation-route-core',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a8d8e8',
          'line-width': 5,
          'line-opacity': 0.95,
          'line-gradient': [
            'interpolate', ['linear'], ['line-progress'],
            0, '#5bc8f5', 0.5, '#a8e8c8', 1, '#c8f8d8',
          ],
        },
      },
      {
        id: 'navigation-route-dash',
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [0, 4, 2, 4],
        },
      },
    ];

    layers.forEach(l => {
      if (!this.map.getLayer(l.id)) this.map.addLayer(l);
    });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// UI helper — wire up the Journey Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connect a NavigationController to the existing Transit-Live Journey Bottom Sheet UI.
 *
 * @param {NavigationController} nav
 */
export function bindJourneySheet(nav) {
  /**
   * Call this after the user taps "Go here" in the dest-sheet.
   * @param {{ lng: number, lat: number }} origin
   * @param {{ lng: number, lat: number }} destination
   * @param {string} destinationName
   * @param {'pedestrian'|'bicycle'|'auto'} mode
   */
  window.startNavigation = async function(origin, destination, destinationName, mode = 'pedestrian') {
    // Show the bottom sheet
    const sheet = document.getElementById('journey-bottom-sheet');
    if (sheet) sheet.classList.add('show');

    const dest   = document.getElementById('jbs-dest');
    const name   = document.getElementById('jbs-route-name');
    const sub    = document.getElementById('jbs-route-sub');
    const dur    = document.getElementById('jbs-duration');
    const depart = document.getElementById('jbs-depart-time');
    const walk   = document.getElementById('jbs-walk-time');

    if (dest)   dest.textContent   = destinationName || 'Destination';
    if (name)   name.textContent   = 'Finding route…';
    if (sub)    sub.textContent    = '';
    if (dur)    dur.textContent    = '—';
    if (depart) depart.textContent = '—';
    if (walk)   walk.textContent   = '—';

    try {
      const result = await nav.route(origin, destination, mode);

      if (name)   name.textContent   = `${result.icon} ${result.mode} route`;
      if (sub)    sub.textContent    = result.manoeuvres[0] || '';
      if (dur)    dur.textContent    = result.duration;
      if (depart) depart.textContent = 'Now';
      if (walk)   walk.textContent   = mode === 'pedestrian' ? result.duration.split(' ')[0] : '—';

    } catch (err) {
      console.error('[Navigation]', err);
      if (name) name.textContent = '⚠️ Route unavailable';
      if (sub)  sub.textContent  = 'Check your Valhalla server';
    }
  };

  window.clearNavigation = function() {
    nav.clear();
    const sheet = document.getElementById('journey-bottom-sheet');
    if (sheet) sheet.classList.remove('show');
  };
}
