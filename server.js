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
// Serve static files but NOT index.html — that's served dynamically with token injection
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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

const LINE_NAMES = {
  '1':'Belgrave','2':'Glen Waverley','3':'Alamein','4':'Lilydale',
  '5':'Frankston','6':'Werribee','7':'Williamstown',
  '8':'Cranbourne','9':'Pakenham','10':'Sandringham',
  '11':'Sunbury','12':'Craigieburn','13':'Upfield',
  '14':'Mernda','15':'Hurstbridge',
  'BEL':'Belgrave','GLW':'Glen Waverley','ALM':'Alamein','LIL':'Lilydale',
  'FKN':'Frankston','WBE':'Werribee','WIL':'Williamstown',
  'CTM':'Cranbourne','PKM':'Pakenham','SDM':'Sandringham',
  'SBY':'Sunbury','CBE':'Craigieburn','UFD':'Upfield',
  'MER':'Mernda','HBG':'Hurstbridge',
};
const LINE_COLORS = {
  '1':'#094c8d','2':'#094c8d','3':'#094c8d','4':'#094c8d',
  '5':'#159943','6':'#159943','7':'#159943',
  '8':'#8b1a4a','9':'#8b1a4a','10':'#f178af',
  '11':'#fc7f1e','12':'#fc7f1e','13':'#fc7f1e',
  '14':'#e1261c','15':'#e1261c',
};
const MODE_COLOR = { train:'#094c8d', tram:'#f5a800', bus:'#7b5ea7', vline:'#6c3483' };

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
      throw new Error(`API_SUBSCRIPTION_REQUIRED: Key accepted but not subscribed to GTFS-R product.`);
    }
    throw new Error(`HTTP ${res.status} from ${url}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text') || contentType.includes('html') || contentType.includes('xml')) {
    const body = await res.text();
    throw new Error(`Expected protobuf but got text response: ${body.slice(0, 100)}`);
  }

  const buf = await res.arrayBuffer();
  console.log(`  ✓ ${url.split('/').pop()} — ${buf.byteLength} bytes`);
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
    // Only use LINE_NAMES/LINE_COLORS lookup for train/vline — tram/bus numbers
    // overlap with train line number keys (e.g. tram route "1" ≠ Belgrave)
    const isRail = mode === 'train' || mode === 'vline';
    const lineName = isRail
      ? (LINE_NAMES[routeId] || LINE_NAMES[rawRouteId] || routeId || mode)
      : (routeId || rawRouteId || mode);
    const color = isRail
      ? (LINE_COLORS[routeId] || LINE_COLORS[rawRouteId] || MODE_COLOR[mode])
      : MODE_COLOR[mode];
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


// ── POST /api/journey ─────────────────────────────────────────────────────────
// Accepts: { fromLat, fromLng, toLat, toLng, fromName?, toName? }
app.post('/api/journey', async (req, res) => {
  const { from, to, time } = req.body || {};
  let { fromLat, fromLng, toLat, toLng } = req.body || {};

  // Require coordinate input
  if (fromLat && fromLng && toLat && toLng) {
    fromLat = parseFloat(fromLat); fromLng = parseFloat(fromLng);
    toLat   = parseFloat(toLat);   toLng   = parseFloat(toLng);
  } else {
    return res.status(400).json({ error: 'Provide fromLat/fromLng/toLat/toLng' });
  }

  const fromName = req.body.fromName || from || `${fromLat.toFixed(4)},${fromLng.toFixed(4)}`;
  const toName   = req.body.toName   || to   || `${toLat.toFixed(4)},${toLng.toFixed(4)}`;
  const rtMap    = { 0: 'train', 1: 'tram', 2: 'bus', 3: 'vline' };

  // ── PTV live routing ──────────────────────────────────────────────────
  if (PTV_DEV_ID && PTV_API_KEY) {
    try {
      // 1. Find nearest stops to from and to coordinates
      const [fromStops, toStops] = await Promise.all([
        ptvFetch(`/v3/stops/location/${fromLat},${fromLng}?route_types=0,1,2,3&max_results=10&max_distance=1000`),
        ptvFetch(`/v3/stops/location/${toLat},${toLng}?route_types=0,1,2,3&max_results=10&max_distance=1000`),
      ]);

      // Sort by distance, prefer train stops for longer trips
      const directKmPrecheck = haversine(fromLat, fromLng, toLat, toLng);
      const preferTrain = directKmPrecheck > 3;
      const sortStops = (stops) => (stops || []).sort((a, b) => {
        const aScore = (preferTrain && a.route_type === 0) ? -0.3 : 0;
        const bScore = (preferTrain && b.route_type === 0) ? -0.3 : 0;
        const aDist  = haversine(fromLat, fromLng, a.stop_latitude || fromLat, a.stop_longitude || fromLng);
        const bDist  = haversine(fromLat, fromLng, b.stop_latitude || fromLat, b.stop_longitude || fromLng);
        return (aDist + aScore) - (bDist + bScore);
      });

      const nearFromStops = sortStops(fromStops.stops).slice(0, 5);
      const nearToStops   = (toStops.stops   || []).slice(0, 8); // keep more to-stops for matching

      if (!nearFromStops.length || !nearToStops.length) throw new Error('No stops near locations');

      const journeys = [];

      // 2. For each candidate from-stop, get upcoming departures
      for (const fromStop of nearFromStops) {
        if (journeys.length >= 3) break;
        try {
          const deps = await ptvFetch(
            `/v3/departures/route_type/${fromStop.route_type}/stop/${fromStop.stop_id}` +
            `?max_results=12&expand=run,route&include_cancelled=false`
          );

          const now = Date.now();

          for (const dep of (deps.departures || []).slice(0, 6)) {
            if (journeys.length >= 3) break;
            const route = (deps.routes || {})[dep.route_id] || {};
            const modeStr = rtMap[fromStop.route_type] || 'bus';
            const scheduledDep = dep.scheduled_departure_utc ? new Date(dep.scheduled_departure_utc) : new Date();
            const estDep       = dep.estimated_departure_utc ? new Date(dep.estimated_departure_utc) : scheduledDep;
            const delaySec     = Math.max(0, (estDep - scheduledDep) / 1000);
            const minsUntilDep = Math.max(0, Math.round((estDep - now) / 60000));

            // 3. Get full stop pattern for this run to find if it passes near destination
            let routePath = [];
            let toStopName = toName;
            let transitMin = Math.round(
              haversine(fromLat, fromLng, toLat, toLng) /
              (modeStr === 'train' ? 1.0 : modeStr === 'tram' ? 0.42 : 0.45) * 60
            ) + 2;

            try {
              const pattern = await ptvFetch(
                `/v3/patterns/run/${dep.run_ref}/route_type/${fromStop.route_type}?expand=stop`
              );
              const stops = (pattern.stops || []);

              // Find from-stop index and closest stop to destination
              let fromIdx = stops.findIndex(s => s.stop_id === fromStop.stop_id);
              if (fromIdx < 0) fromIdx = 0;

              let bestToIdx = -1, bestToDist = Infinity;
              for (const toStop of nearToStops) {
                const idx = stops.findIndex(s => s.stop_id === toStop.stop_id);
                if (idx > fromIdx) {
                  const d = haversine(toStop.stop_latitude, toStop.stop_longitude, toLat, toLng);
                  if (d < bestToDist) { bestToDist = d; bestToIdx = idx; toStopName = toStop.stop_name; }
                }
              }
              // If exact to-stop not in run, find nearest stop to destination along run
              if (bestToIdx < 0) {
                stops.slice(fromIdx + 1).forEach((s, i) => {
                  if (!s.stop_latitude) return;
                  const d = haversine(s.stop_latitude, s.stop_longitude, toLat, toLng);
                  if (d < bestToDist && d < 5.0) { // 5km radius
                    bestToDist = d;
                    bestToIdx = fromIdx + 1 + i;
                    toStopName = s.stop_name;
                  }
                });
              }

              if (bestToIdx > fromIdx) {
                const legStops = stops.slice(fromIdx, bestToIdx + 1);
                routePath = legStops
                  .filter(s => s.stop_latitude && s.stop_longitude)
                  .map(s => [s.stop_latitude, s.stop_longitude]);
                // Rough transit time from number of stops
                transitMin = Math.max(3, Math.round(legStops.length * (modeStr === 'train' ? 2 : 3)));
              }
            } catch (patternErr) {
              // Pattern fetch failed — use straight-line estimate
            }

            const walkDistM = haversine(fromLat, fromLng, fromStop.stop_latitude || fromLat, fromStop.stop_longitude || fromLng) * 1000;
            const walkMin   = Math.max(1, Math.round(walkDistM / 80));
            const totalMin  = walkMin + minsUntilDep + transitMin + 3;

            journeys.push({
              duration: totalMin,
              transfers: 0,
              depart: estDep.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
              legs: [
                { type: 'walk', from: fromName, to: fromStop.stop_name, duration: walkMin },
                {
                  type: modeStr,
                  line: route.route_number || route.route_name || String(dep.route_id),
                  color: MODE_COLOR[modeStr] || '#094c8d',
                  from: fromStop.stop_name,
                  to: toStopName,
                  duration: transitMin,
                  depart: estDep.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
                  minsUntilDep,
                  delay: Math.max(0, Math.round(delaySec / 60)),
                  routePath,            // ← real stop-sequence coordinates for path animation
                  run_ref: dep.run_ref, // ← for matching against live vehicle feed
                },
                { type: 'walk', from: toStopName, to: toName, duration: 3 },
              ],
            });
          }
        } catch (stopErr) {
          console.warn(`  ✗ PTV departures for stop ${fromStop.stop_id}: ${stopErr.message}`);
        }
      }

      if (journeys.length > 0) {
        console.log(`  ✓ PTV journey: ${journeys.length} options from (${fromLat},${fromLng}) → (${toLat},${toLng})`);
        return res.json({
          mode: 'live',
          from: { lat: fromLat, lng: fromLng, name: fromName },
          to:   { lat: toLat,   lng: toLng,   name: toName },
          journeys,
        });
      }
      console.warn(`  ✗ PTV found ${nearFromStops.length} from-stops, ${nearToStops.length} to-stops but built 0 journeys — falling back`);
    } catch (e) {
      console.warn('PTV journey planning failed, using fallback:', e.message);
    }
  }

  // ── Fallback: no PTV keys configured ──────────────────────────────────
  res.json({
    mode: 'fallback',
    from: { lat: fromLat, lng: fromLng, name: fromName },
    to:   { lat: toLat,   lng: toLng,   name: toName },
    journeys: [],
  });
});

// ── GET /api/journey/autocomplete?q=X ────────────────────────────────────────
app.get('/api/journey/autocomplete', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=au&viewbox=144.5,-38.5,145.8,-37.3&bounded=1&limit=6&format=json`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Transit-Live-Melbourne/1.0' } });
    const data = await r.json();
    res.json(data.map(item => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    })));
  } catch (e) {
    res.json([]);
  }
});

// ── GET /api/stops/nearby?lat=X&lng=Y ────────────────────────────────────────
app.get('/api/stops/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });
  res.json([]);
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

  // Fallback: look for vehicles near this stop from cache
  const loc = findLocation(stopName);
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

// ── Static — serve index.html with MAPBOX_TOKEN injected ─────────────────────
// Token is never committed to source; it's substituted at request time.
const indexPath = path.join(__dirname, 'public', 'index.html');
app.get('/', (req, res) => {
  try {
    const html = fs.readFileSync(indexPath, 'utf8')
      .replace('__MAPBOX_TOKEN__', process.env.MAPBOX_TOKEN || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch(e) {
    res.status(500).send('Failed to serve index.html');
  }
});

app.listen(PORT, () => {
  console.log(`\n🚆  Transit-Live → http://localhost:${PORT}`);
  console.log(`    API Key  : ${API_KEY ? '✓ set (' + API_KEY.slice(0,20) + '…)' : '✗ MISSING'}`);
  console.log(`    PTV Keys : ${(PTV_DEV_ID && PTV_API_KEY) ? '✓ set' : '✗ not set (fallback mode)'}`);
  console.log(`    Endpoint : ${FEEDS.train.pos}`);
  console.log(`    Debug    : http://localhost:${PORT}/api/debug\n`);
});
