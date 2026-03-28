require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const protobuf   = require('protobufjs');
const path       = require('path');
const crypto     = require('crypto');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const jwt        = require('jsonwebtoken');
const gtfs       = require('./gtfs');
const walkRouter = require('./walkrouter');

// Address search — file-based streaming (no RAM overhead)
const ADDR_TSV = path.join(__dirname, 'addresses.tsv');
const _addrFileExists = fs.existsSync(ADDR_TSV);
if (_addrFileExists) console.log('✓ Address file: addresses.tsv ready (streaming search, no RAM cost)');

function searchAddresses(query, maxResults = 8) {
  if (!_addrFileExists) return [];
  const qParts = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!qParts.length) return [];
  const results = [];
  const data = fs.readFileSync(ADDR_TSV, 'utf8');
  const lines = data.split('\n');
  for (const line of lines) {
    if (results.length >= maxResults) break;
    if (!line) continue;
    const low = line.toLowerCase();
    if (qParts.every(p => low.includes(p))) {
      const [display, lat, lng] = line.split('\t');
      results.push({ name: display, lat: parseFloat(lat), lng: parseFloat(lng), type: 'address' });
    }
  }
  return results;
}

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.TRANSIT_API_KEY || '';

// PTV Timetable API credentials (optional — enables live journey planning)
const PTV_DEV_ID  = process.env.PTV_DEV_ID  || '';
const PTV_API_KEY = process.env.PTV_API_KEY  || '';

// Auth config
const JWT_SECRET  = process.env.JWT_SECRET  || 'transit-live-dev-secret';
const EMAIL_USER  = process.env.EMAIL_USER  || '';
const EMAIL_PASS  = process.env.EMAIL_PASS  || '';

// Inspector reports persistence
const INSPECTORS_FILE = path.join(__dirname, 'inspectors.json');

// Auth users persistence
const USERS_FILE = path.join(__dirname, 'users.json');
let authUsers = {};
if (fs.existsSync(USERS_FILE)) {
  try { authUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) {}
}
function saveAuthUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(authUsers, null, 2));
}

// OTP store: email → { code, expires }
const otpStore = new Map();

function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
// Serve local PMTiles file
app.get('/melbourne.pmtiles', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  res.sendFile(path.join(__dirname, 'melbourne.pmtiles'));
});

// ── Inline GTFS-RT protobuf schema ───────────────────────────────────────────
const PROTO = `
syntax = "proto2";
package transit_realtime;
message FeedMessage {
  required FeedHeader header = 1;
  repeated FeedEntity entity = 2;
}
message FeedHeader {
  required string gtfs_realtime_version = 1;
  optional uint64 timestamp = 3;
}
message FeedEntity {
  required string id = 1;
  optional bool   is_deleted = 3;
  optional VehiclePosition vehicle = 4;
  optional TripUpdate trip_update  = 5;
  optional Alert alert = 6;
}
message VehiclePosition {
  optional TripDescriptor trip             = 1;
  optional Position       position         = 2;
  optional uint64         timestamp        = 5;
  optional int32          occupancy_status = 9;
}
message TripDescriptor {
  optional string trip_id    = 1;
  optional string start_time = 2;
  optional string start_date = 3;
  optional string route_id   = 5;
}
message Position {
  required float latitude  = 1;
  required float longitude = 2;
  optional float bearing   = 3;
  optional float speed     = 5;
}
message TripUpdate {
  required TripDescriptor trip = 1;
  repeated StopTimeUpdate stop_time_update = 2;
}
message StopTimeUpdate {
  optional StopTimeEvent arrival   = 2;
  optional StopTimeEvent departure = 3;
}
message StopTimeEvent {
  optional int32 delay = 1;
  optional int64 time  = 2;
}
message Alert {
  repeated TimeRange        active_period    = 1;
  optional int32            cause            = 2;
  optional int32            effect           = 3;
  repeated EntitySelector   informed_entity  = 5;
  optional TranslatedString header_text      = 10;
  optional TranslatedString description_text = 11;
}
message TimeRange {
  optional uint64 start = 1;
  optional uint64 end   = 2;
}
message EntitySelector {
  optional string agency_id = 1;
  optional string route_id  = 3;
  optional string trip_id   = 4;
}
message TranslatedString {
  repeated Translation translation = 1;
}
message Translation {
  required string text     = 1;
  optional string language = 2;
}
`;

let protoRoot = null;
async function decode(buf) {
  if (!protoRoot) {
    protoRoot = protobuf.parse(PROTO, { keepCase: true }).root;
  }
  const FM = protoRoot.lookupType('transit_realtime.FeedMessage');
  return FM.decode(new Uint8Array(buf));
}

// ── API Endpoints ─────────────────────────────────────────────────────────────
const FEEDS = {
  train: {
    pos: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions',
    upd: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/trip-updates',
  },
  tram: {
    pos: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/vehicle-positions',
    upd: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/trip-updates',
  },
  bus: {
    pos: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions',
    upd: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/trip-updates',
  },
  vline: {
    pos: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/regional-coach/vehicle-positions',
    upd: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/regional-coach/trip-updates',
  },
  alerts: 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/service-alerts',
};

const MODE_COLOR = { train:'#094c8d', tram:'#2CA05A', bus:'#F5A623', vline:'#6c3483' };

// Route name/color lookup built from GTFS data (populated on load)
// Maps normalised route codes (e.g. 'BEG', 'ALM', '96') → {name, color, mode}
let gtfsRouteLookup = new Map();

function buildRouteLookup() {
  if (!gtfs.isLoaded()) return;
  const { _debug: { routes } } = gtfs;
  const lookup = new Map();
  for (const [routeId, route] of routes) {
    // Extract normalised code from route_id (e.g. 'aus:vic:vic-02-BEG:' → 'BEG')
    const m = routeId.match(/vic-\d+-([A-Z0-9-]+):?$/i);
    const code = m ? m[1].toUpperCase().replace(/-R$/, '') : '';
    // Also map by route_short_name (e.g. '96' for trams, '200' for buses)
    const shortCode = (route.shortName || '').toUpperCase();
    const entry = {
      name:  route.longName || route.shortName || code,
      color: route.color || MODE_COLOR[route.mode] || '#888',
      mode:  route.mode,
    };
    if (code && !lookup.has(code)) lookup.set(code, entry);
    if (shortCode && !lookup.has(shortCode)) lookup.set(shortCode, entry);
  }
  gtfsRouteLookup = lookup;
  console.log(`  ✓ Route lookup: ${lookup.size} entries from GTFS`);
}

// ── Fetch a single feed ───────────────────────────────────────────────────────
async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: {
      'KeyID': API_KEY,
      'Accept': 'application/x-protobuf',
    },
    timeout: 8000,
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes('MessageBlocked')) {
      throw new Error('API_SUBSCRIPTION_REQUIRED');
    }
    throw new Error('HTTP ' + res.status + ' from ' + url);
  }
  const buf = await res.arrayBuffer();
  console.log('Feed:', url.split('/').pop(), buf.byteLength, 'bytes');
  return decode(Buffer.from(buf));
}

function buildDelayMap(feed) {
  const m = {};
  for (const e of feed.entity || []) {
    const tu = e.trip_update;
    if (!tu?.trip?.trip_id) continue;
    const stu = (tu.stop_time_update || []).find(
      s => s.arrival?.delay != null || s.departure?.delay != null
    );
    if (stu) m[tu.trip.trip_id] = stu.arrival?.delay ?? stu.departure?.delay ?? 0;
  }
  return m;
}

function normaliseRouteId(raw) {
  if (!raw) return '';
  const m = raw.match(/vic-\d+-([A-Z0-9]+)/i);
  return m ? m[1].toUpperCase() : raw;
}

function parseVehicles(posFeed, delays, mode) {
  return (posFeed.entity || []).flatMap(e => {
    const vp = e.vehicle;
    if (!vp?.position) return [];
    const { latitude: lat, longitude: lng, bearing, speed } = vp.position;
    if (!lat || !lng) return [];
    // Wider bounding box for V/Line regional services
    if (lat < -39.5 || lat > -33.5 || lng < 140.5 || lng > 150.5) {
      console.warn(`  ⚠ Out-of-bounds: ${lat},${lng} (${e.id})`);
      return [];
    }
    const rawRouteId = vp.trip?.route_id || '';
    const routeId    = normaliseRouteId(rawRouteId) || rawRouteId;
    const tripId     = vp.trip?.trip_id  || '';
    const delaySec   = delays[tripId] || 0;
    const occupancy  = vp.occupancy_status != null ? vp.occupancy_status : null;
    // Look up route name/color from GTFS data
    const gtfsRoute = gtfsRouteLookup.get(routeId) || gtfsRouteLookup.get(rawRouteId);
    const isRail = mode === 'train' || mode === 'vline';
    const lineName = gtfsRoute
      ? (isRail ? gtfsRoute.name : (routeId || rawRouteId || gtfsRoute.name))
      : (routeId || rawRouteId || mode);
    const color = gtfsRoute?.color || MODE_COLOR[mode];
    return [{
      id:       `${mode}_${e.id}`,
      mode,
      line:     lineName,
      label:    isRail
                  ? `${lineName} Line`
                  : `${mode === 'tram' ? 'Tram' : 'Bus'} ${routeId || lineName}`,
      dest:     '',
      lat, lng,
      bearing:  bearing  || 0,
      speed:    speed    || 0,
      color,
      delay:    Math.max(0, Math.round(delaySec / 60)),
      occupancy,
    }];
  });
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache     = null;
let cacheTime = 0;
const CACHE_MS = 14000;

// ── /api/vehicles ─────────────────────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
  if (!API_KEY) {
    console.error('✗ No API key — set TRANSIT_API_KEY environment variable');
    return res.status(401).json({ error: 'No API key set. Add TRANSIT_API_KEY to your environment.' });
  }

  if (cache && Date.now() - cacheTime < CACHE_MS) {
    return res.json(cache);
  }

  console.log(`[${new Date().toLocaleTimeString()}] Fetching live feeds…`);

  const results = await Promise.allSettled([
    fetchFeed(FEEDS.train.pos), fetchFeed(FEEDS.train.upd),
    fetchFeed(FEEDS.tram.pos),  fetchFeed(FEEDS.tram.upd),
    fetchFeed(FEEDS.bus.pos),   fetchFeed(FEEDS.bus.upd),
    fetchFeed(FEEDS.vline.pos), fetchFeed(FEEDS.vline.upd),
  ]);

  const [tp, tu, mp, mu, bp, bu, vp, vu] = results;

  const names = ['train-pos','train-upd','tram-pos','tram-upd','bus-pos','bus-upd','vline-pos','vline-upd'];
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`  ✗ ${names[i]}: ${r.reason.message}`);
  });

  if (tp.status === 'rejected' && mp.status === 'rejected' && bp.status === 'rejected') {
    const err = tp.reason.message;
    console.error('✗ All metro feeds failed:', err);
    return res.status(502).json({ error: err });
  }

  // Log raw entity counts to help diagnose missing modes (0 = likely subscription issue)
  const feedCounts = {
    train: tp.status === 'fulfilled' ? (tp.value.entity || []).length : 'ERR',
    tram:  mp.status === 'fulfilled' ? (mp.value.entity || []).length : 'ERR',
    bus:   bp.status === 'fulfilled' ? (bp.value.entity || []).length : 'ERR',
    vline: vp.status === 'fulfilled' ? (vp.value.entity || []).length : 'ERR',
  };
  console.log(`  Raw feed entities: trains:${feedCounts.train} trams:${feedCounts.tram} buses:${feedCounts.bus} vline:${feedCounts.vline}`);

  const vehicles = [
    ...(tp.status === 'fulfilled' ? parseVehicles(tp.value, tu.status === 'fulfilled' ? buildDelayMap(tu.value) : {}, 'train') : []),
    ...(mp.status === 'fulfilled' ? parseVehicles(mp.value, mu.status === 'fulfilled' ? buildDelayMap(mu.value) : {}, 'tram')  : []),
    ...(bp.status === 'fulfilled' ? parseVehicles(bp.value, bu.status === 'fulfilled' ? buildDelayMap(bu.value) : {}, 'bus')   : []),
    ...(vp.status === 'fulfilled' ? parseVehicles(vp.value, vu.status === 'fulfilled' ? buildDelayMap(vu.value) : {}, 'vline') : []),
  ];

  cache     = vehicles;
  cacheTime = Date.now();

  const counts = { train: 0, tram: 0, bus: 0, vline: 0 };
  vehicles.forEach(v => counts[v.mode]++);
  console.log(`  ✓ Serving ${vehicles.length} vehicles — trains:${counts.train} trams:${counts.tram} buses:${counts.bus} vline:${counts.vline}`);

  res.json(vehicles);
});

// ── /api/alerts ───────────────────────────────────────────────────────────────
let alertsCache     = null;
let alertsCacheTime = 0;

app.get('/api/alerts', async (req, res) => {
  if (!API_KEY) return res.json([]);
  if (alertsCache && Date.now() - alertsCacheTime < 60000) {
    return res.json(alertsCache);
  }
  try {
    const feed = await fetchFeed(FEEDS.alerts);
    const alerts = (feed.entity || []).flatMap(e => {
      const a = e.alert;
      if (!a) return [];
      const header = a.header_text?.translation?.[0]?.text || 'Service Alert';
      const desc   = a.description_text?.translation?.[0]?.text || '';
      const routes = (a.informed_entity || [])
        .map(ie => normaliseRouteId(ie.route_id || '')).filter(Boolean);
      return [{ id: e.id, header, desc, routes, effect: a.effect || 0 }];
    });
    alertsCache     = alerts;
    alertsCacheTime = Date.now();
    console.log(`  ✓ ${alerts.length} service alerts`);
    res.json(alerts);
  } catch(e) {
    console.error('  ✗ Alerts feed:', e.message);
    res.json([]);
  }
});

// ── /api/health ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:   'ok',
    keySet:   !!API_KEY,
    ptvKeys:  !!(PTV_DEV_ID && PTV_API_KEY),
    cacheAge: Date.now() - cacheTime,
    cached:   cache ? cache.length : 0,
  });
});

// ── /api/debug ────────────────────────────────────────────────────────────────
app.get('/api/debug', async (req, res) => {
  if (!API_KEY) return res.json({ error: 'No API key set' });
  try {
    const r = await fetch(FEEDS.train.pos, {
      headers: { 'KeyID': API_KEY, 'Accept': 'application/x-protobuf' },
      timeout: 8000,
    });
    const body = await r.buffer();
    res.json({
      status:      r.status,
      contentType: r.headers.get('content-type'),
      bytes:       body.length,
      isProtobuf:  body.length > 10 && body[0] === 0x0a,
      preview:     r.status !== 200 ? body.slice(0, 200).toString() : `[${body.length} bytes protobuf]`,
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── JOURNEY PLANNER ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// PTV Timetable API signing
function ptvSignUrl(apiPath) {
  if (!PTV_DEV_ID || !PTV_API_KEY) return null;
  const request = apiPath + (apiPath.includes('?') ? '&' : '?') + 'devid=' + PTV_DEV_ID;
  const sig = crypto.createHmac('sha1', Buffer.from(PTV_API_KEY, 'utf-8')).update(request).digest('hex').toUpperCase();
  return 'https://timetableapi.ptv.vic.gov.au' + request + '&signature=' + sig;
}

async function ptvFetch(apiPath) {
  const url = ptvSignUrl(apiPath);
  if (!url) throw new Error('PTV_KEYS_MISSING');
  const res = await fetch(url, { timeout: 8000 });
  if (!res.ok) throw new Error('PTV HTTP ' + res.status);
  return res.json();
}


// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ── Valhalla walk-path enrichment ────────────────────────────────────────────
// For every walk leg in every journey, fire a Valhalla pedestrian request and
// attach walkPath: [[lat,lng],...] so the frontend can draw real road geometry.
async function valhallaWalkPath(fromLat, fromLng, toLat, toLng) {
  try {
    const body = {
      locations: [
        { lon: fromLng, lat: fromLat, type: 'break' },
        { lon: toLng,   lat: toLat,   type: 'break' },
      ],
      costing: 'pedestrian',
      directions_options: { units: 'kilometres' },
    };
    const r = await fetch(`${VALHALLA_URL}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      console.warn(`[Valhalla] HTTP ${r.status}`);
      return null;
    }
    const data = await r.json();
    const shape = data.trip?.legs?.[0]?.shape;
    if (!shape) {
      console.warn('[Valhalla] response missing shape:', JSON.stringify(data).slice(0,200));
      return null;
    }
    return decodePolyline6(shape);
  } catch (e) {
    console.warn('[Valhalla] fetch error:', e.message);
    return null;
  }
}

function decodePolyline6(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e6, lat / 1e6]); // [lng,lat] for GeoJSON
  }
  return coords;
}

async function enrichWalkLegs(journeys) {
  const tasks = [];
  for (const journey of journeys) {
    for (const leg of journey.legs) {
      if (leg.type !== 'walk') continue;
      if (leg.fromLat == null || leg.toLat == null) continue;
      if (Math.abs(leg.fromLat - leg.toLat) < 1e-5 && Math.abs(leg.fromLng - leg.toLng) < 1e-5) continue;
      tasks.push(
        valhallaWalkPath(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng)
          .then(path => {
            if (path) {
              leg.walkPath = path;
            } else {
              console.warn(`[Valhalla] No walk path (${leg.fromLat.toFixed(4)},${leg.fromLng.toFixed(4)}) → (${leg.toLat.toFixed(4)},${leg.toLng.toFixed(4)})`);
            }
          })
      );
    }
  }
  await Promise.allSettled(tasks);
}

// ── GET /api/ad-spots — ad/marketing spots served from JSON file ─────────────
app.get('/api/ad-spots', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'data', 'ad-spots.json');
  if (!fs.existsSync(filePath)) return res.json({ type: 'FeatureCollection', features: [] });
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.json({ type: 'FeatureCollection', features: [] });
  }
});

// ── GET /api/gtfs/shapes — real route lines for map display ──────────────────
// Returns one representative GeoJSON LineString per route (train + tram only).
app.get('/api/gtfs/shapes', (req, res) => {
  if (!gtfs.isLoaded()) return res.json({ type: 'FeatureCollection', features: [] });

  const { _debug: { routes, trips, shapeCache } } = gtfs;

  // Build route_id → best shape_id (longest shape wins)
  const routeBestShape = new Map(); // route_id → {shapeId, len, mode, shortName, longName}
  for (const trip of trips.values()) {
    if (trip.mode !== 'train' && trip.mode !== 'tram') continue;
    if (!trip.shapeId || !shapeCache.has(trip.shapeId)) continue;
    const len = shapeCache.get(trip.shapeId).length;
    const existing = routeBestShape.get(trip.routeId);
    if (!existing || len > existing.len) {
      const route = routes.get(trip.routeId);
      routeBestShape.set(trip.routeId, {
        shapeId: trip.shapeId, len, mode: trip.mode,
        name: route ? (route.shortName || route.longName) : trip.routeId,
        color: route?.color || MODE_COLOR[trip.mode] || '#888',
      });
    }
  }

  const features = [];
  for (const [routeId, info] of routeBestShape) {
    const coords = shapeCache.get(info.shapeId);
    if (!coords || coords.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { routeId, name: info.name, mode: info.mode, color: info.color },
      geometry: { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) },
    });
  }

  res.json({ type: 'FeatureCollection', features });
});

// ── GET /api/gtfs/stations — real train stations for map dots ─────────────────
app.get('/api/gtfs/stations', (req, res) => {
  if (!gtfs.isLoaded()) return res.json([]);

  const { _debug: { stops, stopTrips } } = gtfs;
  const stations = [];
  for (const s of stops.values()) {
    if (s.mode !== 'train') continue;
    if (!stopTrips.has(s.id)) continue;
    // Only include named station stops (skip platforms/sub-entries)
    if (!s.name.toLowerCase().includes('station')) continue;
    stations.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng });
  }
  res.json(stations);
});

// ── POST /api/journey ─────────────────────────────────────────────────────────
// Accepts: { fromLat, fromLng, toLat, toLng, fromName?, toName? }
app.post('/api/journey', async (req, res) => {
  let { fromLat, fromLng, toLat, toLng } = req.body || {};
  if (!fromLat || !fromLng || !toLat || !toLng)
    return res.status(400).json({ error: 'Provide fromLat/fromLng/toLat/toLng' });

  fromLat = parseFloat(fromLat); fromLng = parseFloat(fromLng);
  toLat   = parseFloat(toLat);   toLng   = parseFloat(toLng);
  const fromName = req.body.fromName || 'Your location';
  const toName   = req.body.toName   || 'Destination';

  if (!gtfs.isLoaded())
    return res.json({ mode: 'fallback', from: { lat: fromLat, lng: fromLng, name: fromName },
                      to: { lat: toLat, lng: toLng, name: toName }, journeys: [] });

  try {
    const t0 = Date.now();
    const journeys = gtfs.planJourney(fromLat, fromLng, toLat, toLng, fromName, toName);
    if (!journeys.length) throw new Error('No routes found');

    // Enrich walk legs with local A* paths (instant, no external API)
    if (walkRouter.isLoaded()) {
      for (const j of journeys) {
        for (const leg of j.legs) {
          if (leg.type !== 'walk') continue;
          if (leg.fromLat == null || leg.toLat == null) continue;
          const wp = walkRouter.findPath(leg.fromLat, leg.fromLng, leg.toLat, leg.toLng);
          if (wp && wp.length > 2) leg.walkPath = wp;
        }
      }
    }

    console.log(`  ✓ GTFS journey: ${journeys.length} options in ${Date.now()-t0}ms (${fromLat},${fromLng}) → (${toLat},${toLng})`);
    return res.json({
      mode:     'live',
      from:     { lat: fromLat, lng: fromLng, name: fromName },
      to:       { lat: toLat,   lng: toLng,   name: toName },
      journeys,
    });
  } catch (e) {
    console.warn('GTFS journey failed:', e.message);
    return res.json({ mode: 'fallback', from: { lat: fromLat, lng: fromLng, name: fromName },
                      to: { lat: toLat, lng: toLng, name: toName }, journeys: [] });
  }
});

// ── GET /api/journey/autocomplete?q=X ────────────────────────────────────────
// Hybrid search: GTFS stops first (instant), Nominatim fallback for street addresses
app.get('/api/journey/autocomplete', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);

  const results = [];
  const seen = new Set(); // deduplicate by name

  // 1. Search GTFS stops (instant, local data)
  if (gtfs.isLoaded()) {
    const { _debug: { stops } } = gtfs;
    const modeIco = { train: 'station', tram: 'tram', bus: 'bus', vline: 'station' };
    const scored = [];
    for (const s of stops.values()) {
      const nameLow = s.name.toLowerCase();
      if (!nameLow.includes(q)) continue;
      // Score: exact start > contains, shorter name > longer (more specific)
      const startsWith = nameLow.startsWith(q) ? 0 : 1;
      const score = startsWith * 1000 + s.name.length;
      scored.push({ ...s, score, type: modeIco[s.mode] || 'stop' });
    }
    scored.sort((a, b) => a.score - b.score);
    // Deduplicate stops by name (many platforms per station)
    for (const s of scored) {
      const key = s.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: s.name, lat: s.lat, lng: s.lng, type: s.type });
      if (results.length >= 5) break;
    }
  }

  // 2. Search local address file (665k Melbourne addresses, streaming — no RAM)
  if (results.length < 8) {
    const addrResults = searchAddresses(q, 8 - results.length);
    for (const addr of addrResults) {
      const key = addr.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(addr);
    }
  }

  // 3. Nominatim fallback (only if local results are sparse)
  if (results.length < 3) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ' Melbourne VIC')}&countrycodes=au&limit=${6 - results.length}&format=json`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Transit-Live-Melbourne/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      const data = await r.json();
      for (const item of data) {
        const name = item.display_name;
        const key = name.toLowerCase().split(',')[0].trim();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type || 'address',
        });
      }
    } catch (e) { /* Nominatim timeout — just return local results */ }
  }

  res.json(results);
});

// ── GET /api/stops/nearby?lat=X&lng=Y ────────────────────────────────────────
app.get('/api/stops/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });
  if (!gtfs.isLoaded()) return res.json([]);
  const nearby = gtfs.nearestStops(lat, lng, 10, 1.0);
  res.json(nearby);
});

// ── GET /api/departures?stopName=X ───────────────────────────────────────────
app.get('/api/departures', async (req, res) => {
  const stopName = req.query.stopName || '';
  if (!stopName) return res.status(400).json({ error: 'stopName required' });

  if (PTV_DEV_ID && PTV_API_KEY) {
    try {
      const search = await ptvFetch(`/v3/search/${encodeURIComponent(stopName)}?route_types=0,1,2`);
      const stop = (search.stops || [])[0];
      if (stop) {
        const deps = await ptvFetch(
          `/v3/departures/route_type/${stop.route_type}/stop/${stop.stop_id}?max_results=8&expand=run,route`
        );
        return res.json({ mode: 'live', stop: stop.stop_name, departures: deps.departures || [] });
      }
    } catch (e) {
      console.warn('PTV departures failed:', e.message);
    }
  }

  // Fallback: find stop in GTFS data, then look for nearby vehicles from cache
  let loc = null;
  if (gtfs.isLoaded()) {
    const { _debug: { stops } } = gtfs;
    const lowerName = stopName.toLowerCase();
    for (const s of stops.values()) {
      if (s.name.toLowerCase().includes(lowerName)) { loc = s; break; }
    }
  }
  if (!loc || !cache) return res.json({ mode: 'fallback', departures: [] });

  const nearby = cache
    .map(v => ({ ...v, distKm: haversine(loc.lat, loc.lng, v.lat, v.lng) }))
    .filter(v => v.distKm <= 0.5)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 6)
    .map(v => ({
      line: v.line, mode: v.mode, color: v.color,
      distKm: v.distKm, delay: v.delay,
      eta: Math.round(v.distKm / (v.speed > 0 ? v.speed * 3.6 : 15) * 60),
    }));

  res.json({ mode: 'fallback', stop: loc.name, departures: nearby });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── MYKI INSPECTOR ALERTS ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Fun transit-themed username generator
const USERNAME_PREFIXES = ['Myki','Tram','Metro','Flinders','Transit','Ticket','Commuter','Loop','Vline','Depot'];
const USERNAME_SUFFIXES = ['Maven','Tracker','Watcher','Scout','Ranger','Spotter','Rider','Expert','Alert','Guard'];

function generateUsername() {
  const pre = USERNAME_PREFIXES[Math.floor(Math.random() * USERNAME_PREFIXES.length)];
  const suf = USERNAME_SUFFIXES[Math.floor(Math.random() * USERNAME_SUFFIXES.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${pre}${suf}${num}`;
}

// Load inspector data from disk
function loadInspectors() {
  try {
    if (fs.existsSync(INSPECTORS_FILE)) {
      return JSON.parse(fs.readFileSync(INSPECTORS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Could not load inspectors.json:', e.message);
  }
  return { reports: [], users: {} };
}

function saveInspectors(data) {
  try {
    fs.writeFileSync(INSPECTORS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Could not save inspectors.json:', e.message);
  }
}

function cleanOldReports(data) {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
  data.reports = data.reports.filter(r => r.timestamp > cutoff);
}

let inspectorData = loadInspectors();
cleanOldReports(inspectorData);

// ── GET /api/inspectors ───────────────────────────────────────────────────────
app.get('/api/inspectors', (req, res) => {
  cleanOldReports(inspectorData);
  const cutoff90 = Date.now() - 90 * 60 * 1000;
  const active = inspectorData.reports.filter(r => {
    if (r.timestamp < cutoff90) return false;
    if ((r.goneVotes || 0) >= 3) return false;
    return true;
  });
  res.json(active);
});

// ── POST /api/inspectors ──────────────────────────────────────────────────────
app.post('/api/inspectors', (req, res) => {
  const { transport, route, location, stop, lat, lng, userId } = req.body || {};
  if (!transport || !location) return res.status(400).json({ error: 'transport and location required' });

  // Ensure user record exists
  if (userId && !inspectorData.users[userId]) {
    inspectorData.users[userId] = { karma: 0, username: generateUsername(), reports: 0 };
  }

  const id = crypto.randomUUID();
  const report = {
    id,
    transport,
    route: route || '',
    location: String(location).slice(0, 80),
    stop: stop || '',
    lat: lat ? parseFloat(lat) : null,
    lng: lng ? parseFloat(lng) : null,
    userId: userId || null,
    timestamp: Date.now(),
    stillVotes: 0,
    goneVotes: 0,
    voters: [],
  };

  inspectorData.reports.push(report);

  // Award karma for reporting
  if (userId && inspectorData.users[userId]) {
    inspectorData.users[userId].karma += 5;
    inspectorData.users[userId].reports += 1;
  }

  saveInspectors(inspectorData);
  res.json({ id, message: 'Report submitted', karma: userId ? inspectorData.users[userId]?.karma : 0 });
});

// ── POST /api/inspectors/:id/vote ─────────────────────────────────────────────
app.post('/api/inspectors/:id/vote', (req, res) => {
  const { id } = req.params;
  const { userId, vote } = req.body || {};
  if (!vote || !['still', 'gone'].includes(vote)) return res.status(400).json({ error: 'vote must be "still" or "gone"' });

  const report = inspectorData.reports.find(r => r.id === id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  // Prevent duplicate votes
  if (userId && report.voters.includes(userId)) {
    return res.status(409).json({ error: 'Already voted on this report' });
  }

  if (vote === 'still') {
    report.stillVotes = (report.stillVotes || 0) + 1;
    // Karma for confirming
    if (userId && inspectorData.users[userId]) inspectorData.users[userId].karma += 2;
    // Karma for original reporter for confirmation
    if (report.userId && inspectorData.users[report.userId]) inspectorData.users[report.userId].karma += 3;
  } else {
    report.goneVotes = (report.goneVotes || 0) + 1;
    if (report.goneVotes >= 3) report.expired = true;
    // Small karma for reporting as gone (helps accuracy)
    if (userId && inspectorData.users[userId]) inspectorData.users[userId].karma += 1;
  }

  if (userId) report.voters.push(userId);
  saveInspectors(inspectorData);

  res.json({
    stillVotes: report.stillVotes,
    goneVotes: report.goneVotes,
    expired: !!report.expired,
    karma: userId ? inspectorData.users[userId]?.karma : 0,
  });
});

// ── GET /api/leaderboard ──────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const users = Object.entries(inspectorData.users)
    .map(([uid, u]) => ({
      username: u.username,
      karma: u.karma || 0,
      reports: u.reports || 0,
      badge: u.karma >= 100 ? '🏆' : u.karma >= 50 ? '🥇' : u.karma >= 20 ? '🥈' : u.karma >= 5 ? '🥉' : '🎟',
    }))
    .sort((a, b) => b.karma - a.karma)
    .slice(0, 10);
  res.json(users);
});

// ── GET /api/user/:userId ─────────────────────────────────────────────────────
app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;
  if (!inspectorData.users[userId]) {
    // Create new user
    const newUser = { karma: 0, username: generateUsername(), reports: 0 };
    inspectorData.users[userId] = newUser;
    saveInspectors(inspectorData);
    return res.json({ userId, ...newUser, isNew: true });
  }
  res.json({ userId, ...inspectorData.users[userId] });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

// POST /auth/send-otp
app.post('/auth/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const lowerEmail = String(email).toLowerCase().trim();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(lowerEmail, { code, expires: Date.now() + 10 * 60 * 1000 });

  // Dev mode (no email config) — return code directly so devs can test
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log(`[Auth] OTP for ${lowerEmail}: ${code}`);
    return res.json({ ok: true, dev_code: code });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  try {
    await transporter.sendMail({
      from: `Transit-Live 🚆 <${EMAIL_USER}>`,
      to: lowerEmail,
      subject: `${code} is your Transit-Live code`,
      html: `<div style="font-family:'Nunito',sans-serif;max-width:420px;margin:0 auto;padding:28px;background:#fef9f0;border-radius:16px">
        <h2 style="color:#3d3580;margin:0 0 8px">🚆 Transit-Live</h2>
        <p style="color:#7b75b0;margin:0 0 20px">Your one-time sign-in code:</p>
        <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#3d3580;text-align:center;padding:24px;background:#fff;border-radius:12px;border:2px solid rgba(100,80,200,0.12)">${code}</div>
        <p style="color:#c0bde0;font-size:12px;margin:16px 0 0;text-align:center">Expires in 10 minutes. Never share this code.</p>
      </div>`,
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('[Auth] Email error:', e.message);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /auth/verify-otp
app.post('/auth/verify-otp', (req, res) => {
  const { email, code } = req.body || {};
  const lowerEmail = String(email || '').toLowerCase().trim();
  const stored = otpStore.get(lowerEmail);
  if (!stored || String(code) !== stored.code || Date.now() > stored.expires) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }
  otpStore.delete(lowerEmail);

  if (!authUsers[lowerEmail]) {
    authUsers[lowerEmail] = {
      email: lowerEmail,
      username: generateUsername(),
      karma: 0,
      avatar: null,
      createdAt: Date.now(),
    };
    saveAuthUsers();
  }
  const user = authUsers[lowerEmail];
  const token = jwt.sign({ email: lowerEmail }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    ok: true,
    token,
    user: { email: lowerEmail, username: user.username, karma: user.karma, avatar: user.avatar },
  });
});

// GET /auth/me
app.get('/auth/me', authMiddleware, (req, res) => {
  const user = authUsers[req.user.email];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ email: req.user.email, username: user.username, karma: user.karma, avatar: user.avatar });
});

// POST /auth/update-avatar
app.post('/auth/update-avatar', authMiddleware, (req, res) => {
  const user = authUsers[req.user.email];
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.avatar = req.body.avatar || null;
  saveAuthUsers();
  res.json({ ok: true });
});

// POST /auth/logout — client deletes its own token; server just acks
app.post('/auth/logout', (_req, res) => res.json({ ok: true }));

// GET /auth/dev-login — instant login for local dev (?dev=true bypass)
// Never expose this on production — only works when JWT_SECRET is the default dev value
app.get('/auth/dev-login', (req, res) => {
  if (JWT_SECRET !== 'transit-live-dev-secret') {
    return res.status(403).json({ error: 'Dev login only available in dev mode' });
  }
  const devEmail = 'dev@localhost';
  if (!authUsers[devEmail]) {
    authUsers[devEmail] = {
      email: devEmail,
      username: 'DevRider',
      karma: 999,
      avatar: null,
      createdAt: Date.now(),
    };
    saveAuthUsers();
  }
  const user = authUsers[devEmail];
  const token = jwt.sign({ email: devEmail }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, user: { email: devEmail, username: user.username, karma: user.karma, avatar: user.avatar } });
});

// ── Valhalla routing proxy ────────────────────────────────────────────────────
// Proxies to the public OSM Valhalla instance so no API key is needed client-side.
const VALHALLA_URL = process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de';

app.post('/api/route', express.json(), async (req, res) => {
  try {
    const response = await fetch(`${VALHALLA_URL}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[route proxy]', err.message);
    res.status(502).json({ error: 'Routing service unavailable' });
  }
});

// ── Static — serve index.html ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚆  Transit-Live → http://localhost:${PORT}`);
  console.log(`    API Key  : ${API_KEY ? '✓ set (' + API_KEY.slice(0,20) + '…)' : '✗ MISSING'}`);
  console.log(`    Endpoint : ${FEEDS.train.pos}`);
  console.log(`    Debug    : http://localhost:${PORT}/api/debug\n`);

  // Load GTFS static data in the background — journey planning available once complete
  const gtfsPath = path.join(__dirname, 'gtfs.zip');
  if (fs.existsSync(gtfsPath)) {
    setImmediate(() => {
      gtfs.load(gtfsPath); buildRouteLookup(); gtfs.buildRaptorIndex();
      // Load walk network for local A* walking paths
      const roadsPath = path.join(__dirname, 'melbourne_roads.json');
      walkRouter.load(roadsPath);
    });
  } else {
    console.warn('⚠ gtfs.zip not found — journey planning unavailable');
  }
});
