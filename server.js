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
app.use(express.static(path.join(__dirname, 'public')));

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
    const lineName   = LINE_NAMES[routeId] || LINE_NAMES[rawRouteId] || routeId || mode;
    const occupancy  = vp.occupancy_status != null ? vp.occupancy_status : null;
    return [{
      id:       `${mode}_${e.id}`,
      mode,
      line:     lineName,
      label:    (mode === 'train' || mode === 'vline')
                  ? `${lineName} Line`
                  : `${mode === 'tram' ? 'Tram' : 'Bus'} ${routeId}`,
      dest:     '',
      lat, lng,
      bearing:  bearing  || 0,
      speed:    speed    || 0,
      color:    LINE_COLORS[routeId] || LINE_COLORS[rawRouteId] || MODE_COLOR[mode],
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

// Melbourne locations data — train stations + suburbs
const MELBOURNE_LOCATIONS = [
  // City Loop & major train stations
  {name:'Flinders Street Station', lat:-37.8182, lng:144.9671, type:'train'},
  {name:'Southern Cross Station',  lat:-37.8183, lng:144.9526, type:'train'},
  {name:'Melbourne Central',       lat:-37.8098, lng:144.9631, type:'train'},
  {name:'Flagstaff',               lat:-37.8116, lng:144.9572, type:'train'},
  {name:'Parliament',              lat:-37.8114, lng:144.9730, type:'train'},
  {name:'Richmond',                lat:-37.8244, lng:144.9987, type:'train'},
  {name:'North Melbourne',         lat:-37.8047, lng:144.9426, type:'train'},
  {name:'Footscray',               lat:-37.8019, lng:144.8993, type:'train'},
  {name:'Caulfield',               lat:-37.8769, lng:145.0238, type:'train'},
  {name:'Clayton',                 lat:-37.9210, lng:145.1202, type:'train'},
  {name:'Box Hill',                lat:-37.8196, lng:145.1228, type:'train'},
  {name:'Camberwell',              lat:-37.8274, lng:145.0588, type:'train'},
  {name:'Dandenong',               lat:-37.9841, lng:145.2161, type:'train'},
  {name:'Frankston',               lat:-38.1391, lng:145.1232, type:'train'},
  {name:'Werribee',                lat:-37.9014, lng:144.6604, type:'train'},
  {name:'Sunshine',                lat:-37.7871, lng:144.8310, type:'train'},
  {name:'Broadmeadows',            lat:-37.6815, lng:144.9176, type:'train'},
  {name:'Ringwood',                lat:-37.8116, lng:145.2276, type:'train'},
  {name:'Belgrave',                lat:-37.9052, lng:145.3556, type:'train'},
  {name:'Lilydale',                lat:-37.7578, lng:145.3568, type:'train'},
  {name:'Glen Waverley',           lat:-37.8786, lng:145.1644, type:'train'},
  {name:'Cranbourne',              lat:-38.1133, lng:145.3485, type:'train'},
  {name:'Pakenham',                lat:-38.0724, lng:145.4897, type:'train'},
  {name:'Sandringham',             lat:-37.9504, lng:145.0091, type:'train'},
  {name:'Williamstown',            lat:-37.8640, lng:144.8950, type:'train'},
  {name:'Sunbury',                 lat:-37.5774, lng:144.7275, type:'train'},
  {name:'Craigieburn',             lat:-37.6025, lng:144.9463, type:'train'},
  {name:'Upfield',                 lat:-37.6422, lng:144.9536, type:'train'},
  {name:'Mernda',                  lat:-37.6012, lng:145.0886, type:'train'},
  {name:'Hurstbridge',             lat:-37.6283, lng:145.1805, type:'train'},
  {name:'Alamein',                 lat:-37.8518, lng:145.0981, type:'train'},
  {name:'Flinders Street',         lat:-37.8182, lng:144.9671, type:'train'},
  {name:'Spencer Street',          lat:-37.8183, lng:144.9526, type:'train'},
  // Suburbs
  {name:'St Kilda',                lat:-37.8649, lng:144.9785, type:'suburb'},
  {name:'Fitzroy',                 lat:-37.7990, lng:144.9786, type:'suburb'},
  {name:'Collingwood',             lat:-37.8037, lng:144.9924, type:'suburb'},
  {name:'Richmond',                lat:-37.8244, lng:144.9987, type:'suburb'},
  {name:'South Yarra',             lat:-37.8388, lng:144.9927, type:'suburb'},
  {name:'Prahran',                 lat:-37.8479, lng:144.9924, type:'suburb'},
  {name:'Toorak',                  lat:-37.8479, lng:145.0140, type:'suburb'},
  {name:'Malvern',                 lat:-37.8601, lng:145.0270, type:'suburb'},
  {name:'Elsternwick',             lat:-37.8887, lng:145.0027, type:'suburb'},
  {name:'Glen Iris',               lat:-37.8631, lng:145.0452, type:'suburb'},
  {name:'Hawthorn',                lat:-37.8228, lng:145.0280, type:'suburb'},
  {name:'Kew',                     lat:-37.8073, lng:145.0330, type:'suburb'},
  {name:'Doncaster',               lat:-37.7870, lng:145.1200, type:'suburb'},
  {name:'Balwyn',                  lat:-37.8121, lng:145.0856, type:'suburb'},
  {name:'Nunawading',              lat:-37.8209, lng:145.1726, type:'suburb'},
  {name:'Mitcham',                 lat:-37.8145, lng:145.1946, type:'suburb'},
  {name:'Croydon',                 lat:-37.7962, lng:145.2833, type:'suburb'},
  {name:'Mooroolbark',             lat:-37.7756, lng:145.3046, type:'suburb'},
  {name:'Boronia',                 lat:-37.8600, lng:145.2880, type:'suburb'},
  {name:'Ferntree Gully',          lat:-37.8800, lng:145.2947, type:'suburb'},
  {name:'Knox City',               lat:-37.8748, lng:145.2434, type:'suburb'},
  {name:'Rowville',                lat:-37.9290, lng:145.2157, type:'suburb'},
  {name:'Noble Park',              lat:-37.9671, lng:145.1718, type:'suburb'},
  {name:'Springvale',              lat:-37.9481, lng:145.1474, type:'suburb'},
  {name:'Cheltenham',              lat:-37.9607, lng:145.0590, type:'suburb'},
  {name:'Mentone',                 lat:-37.9817, lng:145.0595, type:'suburb'},
  {name:'Mordialloc',              lat:-38.0037, lng:145.0862, type:'suburb'},
  {name:'Bonbeach',                lat:-38.0461, lng:145.1024, type:'suburb'},
  {name:'Carrum',                  lat:-38.0671, lng:145.1219, type:'suburb'},
  {name:'Seaford',                 lat:-38.0959, lng:145.1366, type:'suburb'},
  {name:'Karingal',                lat:-38.1581, lng:145.1503, type:'suburb'},
  {name:'Rosebud',                 lat:-38.3555, lng:144.9021, type:'suburb'},
  {name:'Mornington',              lat:-38.2145, lng:145.0374, type:'suburb'},
  {name:'Berwick',                 lat:-38.0353, lng:145.3553, type:'suburb'},
  {name:'Narre Warren',            lat:-38.0280, lng:145.3048, type:'suburb'},
  {name:'Hallam',                  lat:-37.9997, lng:145.2706, type:'suburb'},
  {name:'Hampton Park',            lat:-38.0135, lng:145.2548, type:'suburb'},
  {name:'Bayswater',               lat:-37.8455, lng:145.2698, type:'suburb'},
  {name:'Wantirna',                lat:-37.8563, lng:145.2219, type:'suburb'},
  {name:'Vermont',                 lat:-37.8345, lng:145.1887, type:'suburb'},
  {name:'Doncaster East',          lat:-37.7889, lng:145.1502, type:'suburb'},
  {name:'Templestowe',             lat:-37.7628, lng:145.1387, type:'suburb'},
  {name:'Eltham',                  lat:-37.7143, lng:145.1480, type:'suburb'},
  {name:'Diamond Creek',           lat:-37.6721, lng:145.1581, type:'suburb'},
  {name:'Greensborough',           lat:-37.7046, lng:145.1030, type:'suburb'},
  {name:'Bundoora',                lat:-37.7067, lng:145.0576, type:'suburb'},
  {name:'Lalor',                   lat:-37.6727, lng:145.0180, type:'suburb'},
  {name:'Thomastown',              lat:-37.6947, lng:145.0080, type:'suburb'},
  {name:'Epping',                  lat:-37.6459, lng:145.0176, type:'suburb'},
  {name:'South Morang',            lat:-37.6462, lng:145.0858, type:'suburb'},
  {name:'Whittlesea',              lat:-37.5142, lng:145.1160, type:'suburb'},
  {name:'Reservoir',               lat:-37.7181, lng:145.0028, type:'suburb'},
  {name:'Preston',                 lat:-37.7422, lng:145.0020, type:'suburb'},
  {name:'Northcote',               lat:-37.7681, lng:145.0042, type:'suburb'},
  {name:'Brunswick',               lat:-37.7752, lng:144.9606, type:'suburb'},
  {name:'Coburg',                  lat:-37.7430, lng:144.9649, type:'suburb'},
  {name:'Pascoe Vale',             lat:-37.7298, lng:144.9469, type:'suburb'},
  {name:'Glenroy',                 lat:-37.7131, lng:144.9257, type:'suburb'},
  {name:'Fawkner',                 lat:-37.7131, lng:144.9640, type:'suburb'},
  {name:'Campbellfield',           lat:-37.6717, lng:144.9613, type:'suburb'},
  {name:'Roxburgh Park',           lat:-37.6462, lng:144.9260, type:'suburb'},
  {name:'Essendon',                lat:-37.7514, lng:144.9145, type:'suburb'},
  {name:'Moonee Ponds',            lat:-37.7670, lng:144.9228, type:'suburb'},
  {name:'Ascot Vale',              lat:-37.7800, lng:144.9211, type:'suburb'},
  {name:'Kensington',              lat:-37.7952, lng:144.9271, type:'suburb'},
  {name:'Flemington',              lat:-37.7963, lng:144.9270, type:'suburb'},
  {name:'Seddon',                  lat:-37.8121, lng:144.8876, type:'suburb'},
  {name:'Yarraville',              lat:-37.8150, lng:144.8845, type:'suburb'},
  {name:'Footscray',               lat:-37.8019, lng:144.8993, type:'suburb'},
  {name:'Altona',                  lat:-37.8665, lng:144.8302, type:'suburb'},
  {name:'Williamstown',            lat:-37.8640, lng:144.8950, type:'suburb'},
  {name:'Newport',                 lat:-37.8440, lng:144.8788, type:'suburb'},
  {name:'Laverton',                lat:-37.8568, lng:144.7693, type:'suburb'},
  {name:'Hoppers Crossing',        lat:-37.8818, lng:144.7045, type:'suburb'},
  {name:'Werribee',                lat:-37.9014, lng:144.6604, type:'suburb'},
  {name:'Caroline Springs',        lat:-37.7520, lng:144.7420, type:'suburb'},
  {name:'Tarneit',                 lat:-37.8542, lng:144.6926, type:'suburb'},
  {name:'Truganina',               lat:-37.8402, lng:144.7434, type:'suburb'},
  {name:'Deer Park',               lat:-37.7829, lng:144.7717, type:'suburb'},
  {name:'St Albans',               lat:-37.7501, lng:144.8050, type:'suburb'},
  {name:'Sydenham',                lat:-37.7286, lng:144.7620, type:'suburb'},
  {name:'Albion',                  lat:-37.7720, lng:144.8450, type:'suburb'},
  {name:'Docklands',               lat:-37.8181, lng:144.9433, type:'suburb'},
  {name:'Port Melbourne',          lat:-37.8380, lng:144.9380, type:'suburb'},
  {name:'Albert Park',             lat:-37.8484, lng:144.9539, type:'suburb'},
  {name:'South Melbourne',         lat:-37.8380, lng:144.9522, type:'suburb'},
  {name:'Melbourne Airport',       lat:-37.6690, lng:144.8410, type:'suburb'},
  {name:'Tullamarine',             lat:-37.7069, lng:144.8805, type:'suburb'},
  {name:'Westmeadows',             lat:-37.6878, lng:144.8745, type:'suburb'},
  {name:'Melbourne CBD',           lat:-37.8136, lng:144.9631, type:'suburb'},
  {name:'City Centre',             lat:-37.8136, lng:144.9631, type:'suburb'},
  {name:'Elizabeth Street',        lat:-37.8136, lng:144.9629, type:'tram'},
  {name:'Swanston Street',         lat:-37.8136, lng:144.9673, type:'tram'},
  {name:'Collins Street',          lat:-37.8170, lng:144.9650, type:'tram'},
  {name:'Bourke Street',           lat:-37.8130, lng:144.9650, type:'tram'},
  // Tram terminus/key stops
  {name:'St Kilda Beach',          lat:-37.8677, lng:144.9796, type:'tram'},
  {name:'Luna Park',               lat:-37.8654, lng:144.9793, type:'tram'},
  {name:'Melbourne Zoo',           lat:-37.7839, lng:144.9507, type:'tram'},
  {name:'University of Melbourne', lat:-37.7963, lng:144.9614, type:'suburb'},
  {name:'RMIT University',         lat:-37.8083, lng:144.9631, type:'suburb'},
  {name:'Monash University',       lat:-37.9100, lng:145.1330, type:'suburb'},
];

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fuzzy location search
function findLocation(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  // Exact match first
  let loc = MELBOURNE_LOCATIONS.find(l => l.name.toLowerCase() === q);
  if (loc) return loc;
  // Starts-with
  loc = MELBOURNE_LOCATIONS.find(l => l.name.toLowerCase().startsWith(q));
  if (loc) return loc;
  // Contains
  loc = MELBOURNE_LOCATIONS.find(l => l.name.toLowerCase().includes(q));
  if (loc) return loc;
  return null;
}

// Routes data (mirrors frontend ROUTES for fallback journey planning)
const ROUTES_DATA = [
  {mode:'train', line:'Belgrave',     color:'#094c8d', pts:[[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8116,145.2276],[-37.8603,145.3556]]},
  {mode:'train', line:'Glen Waverley',color:'#094c8d', pts:[[-37.8183,144.9671],[-37.8274,145.0118],[-37.8432,145.0693],[-37.8701,145.1146],[-37.8786,145.1644]]},
  {mode:'train', line:'Lilydale',     color:'#094c8d', pts:[[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8116,145.2276],[-37.7578,145.3568]]},
  {mode:'train', line:'Alamein',      color:'#094c8d', pts:[[-37.8183,144.9671],[-37.8274,145.0118],[-37.8241,145.0585],[-37.8381,145.0769],[-37.8518,145.0981]]},
  {mode:'train', line:'Frankston',    color:'#159943', pts:[[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9210,145.0740],[-37.9710,145.0942],[-38.1391,145.1232]]},
  {mode:'train', line:'Cranbourne',   color:'#8b1a4a', pts:[[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9841,145.1282],[-38.0652,145.2847],[-38.1133,145.3485]]},
  {mode:'train', line:'Pakenham',     color:'#8b1a4a', pts:[[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9841,145.1282],[-38.0480,145.3956],[-38.0724,145.4897]]},
  {mode:'train', line:'Sandringham',  color:'#f178af', pts:[[-37.8183,144.9671],[-37.8388,144.9927],[-37.8769,145.0238],[-37.9090,144.9980],[-37.9504,145.0091]]},
  {mode:'train', line:'Werribee',     color:'#159943', pts:[[-37.8183,144.9671],[-37.8047,144.9426],[-37.8440,144.8788],[-37.8671,144.7769],[-37.9014,144.6604]]},
  {mode:'train', line:'Williamstown', color:'#159943', pts:[[-37.8183,144.9671],[-37.8047,144.9426],[-37.8440,144.8788],[-37.8640,144.8950]]},
  {mode:'train', line:'Sunbury',      color:'#fc7f1e', pts:[[-37.8183,144.9671],[-37.8183,144.9526],[-37.7994,144.9293],[-37.7871,144.8310],[-37.5774,144.7275]]},
  {mode:'train', line:'Craigieburn',  color:'#fc7f1e', pts:[[-37.8183,144.9671],[-37.8047,144.9426],[-37.7994,144.9293],[-37.6815,144.9176],[-37.6025,144.9463]]},
  {mode:'train', line:'Upfield',      color:'#fc7f1e', pts:[[-37.8183,144.9671],[-37.8047,144.9426],[-37.7994,144.9293],[-37.7407,144.9641],[-37.6422,144.9536]]},
  {mode:'train', line:'Mernda',       color:'#e1261c', pts:[[-37.8183,144.9671],[-37.7921,144.9987],[-37.7596,145.0285],[-37.7096,145.0535],[-37.6012,145.0886]]},
  {mode:'train', line:'Hurstbridge',  color:'#e1261c', pts:[[-37.8183,144.9671],[-37.7921,144.9987],[-37.7596,145.0285],[-37.7096,145.0535],[-37.6795,145.1545],[-37.6283,145.1805]]},
  {mode:'tram',  line:'Route 96',     color:'#f5a800', pts:[[-37.8649,144.9785],[-37.8388,144.9800],[-37.8183,144.9671],[-37.8094,144.9671],[-37.7751,144.9789]]},
  {mode:'tram',  line:'Route 19',     color:'#00b5e2', pts:[[-37.7320,144.9601],[-37.7720,144.9630],[-37.8094,144.9671],[-37.8183,144.9671]]},
  {mode:'tram',  line:'Route 86',     color:'#f5a800', pts:[[-37.7087,145.0148],[-37.7610,144.9850],[-37.8070,144.9810],[-37.8183,144.9671]]},
  {mode:'tram',  line:'Route 57',     color:'#00b5e2', pts:[[-37.7628,144.8845],[-37.8000,144.9220],[-37.8140,144.9526],[-37.8183,144.9671]]},
  {mode:'tram',  line:'Route 48',     color:'#00b5e2', pts:[[-37.8085,145.0570],[-37.8094,145.0290],[-37.8094,144.9730],[-37.8094,144.9430]]},
  {mode:'tram',  line:'Route 70',     color:'#e1261c', pts:[[-37.8214,144.9443],[-37.8183,144.9671],[-37.8230,144.9921],[-37.8390,145.0760]]},
  {mode:'tram',  line:'Route 109',    color:'#e1261c', pts:[[-37.8183,144.9526],[-37.8183,144.9671],[-37.8280,145.0280],[-37.8280,145.1000]]},
  {mode:'tram',  line:'Route 112',    color:'#f5a800', pts:[[-37.7455,144.9777],[-37.7950,144.9700],[-37.8094,144.9671],[-37.8390,144.9671]]},
  {mode:'tram',  line:'Route 1',      color:'#78be20', pts:[[-37.8700,144.9580],[-37.8300,144.9666],[-37.8183,144.9671],[-37.7894,144.9698]]},
  {mode:'tram',  line:'Route 75',     color:'#e1261c', pts:[[-37.8630,145.1210],[-37.8290,145.0240],[-37.8183,144.9730],[-37.8183,144.9526]]},
  {mode:'tram',  line:'Route 59',     color:'#00b5e2', pts:[[-37.7220,144.8830],[-37.7720,144.9170],[-37.8094,144.9526]]},
  {mode:'bus',   line:'Route 246',    color:'#7b5ea7', pts:[[-37.8000,144.9580],[-37.8140,144.9350],[-37.8280,144.9100]]},
  {mode:'bus',   line:'Route 605',    color:'#009b77', pts:[[-37.8094,144.9629],[-37.7750,145.0450],[-37.7930,145.1218]]},
  {mode:'bus',   line:'Route 750',    color:'#009b77', pts:[[-37.8769,145.0238],[-37.9050,145.1100],[-37.9250,145.1650]]},
  {mode:'bus',   line:'Route 901',    color:'#d4a017', pts:[[-37.8769,145.0238],[-37.9841,145.1282],[-38.1145,145.1212]]},
  {mode:'bus',   line:'Route 902',    color:'#d4a017', pts:[[-37.7839,144.8781],[-37.8794,144.8608],[-37.9301,144.8952]]},
  {mode:'bus',   line:'Route 903',    color:'#d4a017', pts:[[-37.7839,144.8781],[-37.8769,145.0238],[-37.9841,145.1282]]},
  {mode:'bus',   line:'Route 302',    color:'#7b5ea7', pts:[[-37.8183,144.9671],[-37.8183,145.0500],[-37.8182,145.1428]]},
  {mode:'bus',   line:'Route 401',    color:'#7b5ea7', pts:[[-37.8183,144.9671],[-37.8600,144.9840],[-37.8769,145.0238]]},
];

// Find routes passing within 2km of a point
function findNearbyRoutes(lat, lng) {
  const nearby = [];
  for (const route of ROUTES_DATA) {
    let minDist = Infinity;
    for (const [rlat, rlng] of route.pts) {
      const d = haversine(lat, lng, rlat, rlng);
      if (d < minDist) minDist = d;
    }
    if (minDist <= 2.0) {
      nearby.push({ ...route, distKm: Math.round(minDist * 100) / 100 });
    }
  }
  nearby.sort((a, b) => a.distKm - b.distKm);
  return nearby.slice(0, 5);
}

// Build fallback journey options
function buildFallbackJourneys(fromLoc, toLoc) {
  const fromRoutes = findNearbyRoutes(fromLoc.lat, fromLoc.lng);
  const toRoutes   = findNearbyRoutes(toLoc.lat, toLoc.lng);
  const directKm   = haversine(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng);
  const directMin  = Math.round(directKm / 5 * 60); // walking at 5 km/h

  const journeys = [];

  // Option 1: Direct transport if shared route exists
  const sharedRoutes = fromRoutes.filter(r => toRoutes.some(tr => tr.line === r.line));
  if (sharedRoutes.length > 0) {
    const r = sharedRoutes[0];
    const transitMin = Math.max(5, Math.round(directKm / (r.mode === 'train' ? 60 : r.mode === 'tram' ? 25 : 30) * 60));
    journeys.push({
      duration: transitMin + 5,
      transfers: 0,
      legs: [
        { type: 'walk', from: fromLoc.name, to: 'Nearby stop', duration: 3 },
        { type: r.mode, line: r.line, color: r.color, from: fromLoc.name, to: toLoc.name, duration: transitMin },
        { type: 'walk', from: 'Nearby stop', to: toLoc.name, duration: 2 },
      ],
    });
  }

  // Option 2: Transfer via city if different zones
  if (fromRoutes.length > 0 && toRoutes.length > 0 && sharedRoutes.length === 0) {
    const r1 = fromRoutes[0];
    const r2 = toRoutes[0];
    const leg1Min = Math.round(haversine(fromLoc.lat, fromLoc.lng, -37.8183, 144.9671) / (r1.mode === 'train' ? 60 : 25) * 60) + 3;
    const leg2Min = Math.round(haversine(-37.8183, 144.9671, toLoc.lat, toLoc.lng) / (r2.mode === 'train' ? 60 : 25) * 60) + 3;
    journeys.push({
      duration: leg1Min + leg2Min + 8,
      transfers: 1,
      legs: [
        { type: 'walk', from: fromLoc.name, to: 'Nearby stop', duration: 3 },
        { type: r1.mode, line: r1.line, color: r1.color, from: fromLoc.name, to: 'City', duration: leg1Min },
        { type: 'walk', from: 'City', to: 'Transfer stop', duration: 5 },
        { type: r2.mode, line: r2.line, color: r2.color, from: 'City', to: toLoc.name, duration: leg2Min },
        { type: 'walk', from: 'Nearby stop', to: toLoc.name, duration: 2 },
      ],
    });
  }

  // Option 3: Walking (if under 3km)
  if (directKm <= 3) {
    journeys.push({
      duration: directMin,
      transfers: 0,
      legs: [
        { type: 'walk', from: fromLoc.name, to: toLoc.name, duration: directMin },
      ],
    });
  }

  if (journeys.length === 0) {
    // Fallback: always show a suggestion
    const r = fromRoutes[0] || { mode: 'tram', line: 'Route 96', color: '#f5a800' };
    journeys.push({
      duration: Math.round(directKm / 20 * 60) + 10,
      transfers: 1,
      legs: [
        { type: 'walk', from: fromLoc.name, to: 'Nearest stop', duration: 5 },
        { type: r.mode, line: r.line, color: r.color, from: fromLoc.name, to: toLoc.name, duration: Math.round(directKm / 20 * 60) },
        { type: 'walk', from: 'Stop', to: toLoc.name, duration: 3 },
      ],
    });
  }

  return journeys.slice(0, 3);
}

// ── POST /api/journey ─────────────────────────────────────────────────────────
app.post('/api/journey', async (req, res) => {
  const { from, to, time } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const fromLoc = findLocation(from);
  const toLoc   = findLocation(to);

  if (!fromLoc) return res.status(404).json({ error: `Location not found: ${from}` });
  if (!toLoc)   return res.status(404).json({ error: `Location not found: ${to}` });

  // Try PTV live journey planning
  if (PTV_DEV_ID && PTV_API_KEY) {
    try {
      // Search for stops near from/to
      const fromSearch = await ptvFetch(`/v3/search/${encodeURIComponent(fromLoc.name)}?route_types=0,1,2`);
      const toSearch   = await ptvFetch(`/v3/search/${encodeURIComponent(toLoc.name)}?route_types=0,1,2`);

      const fromStop = (fromSearch.stops || [])[0];
      const toStop   = (toSearch.stops   || [])[0];

      if (fromStop && toStop) {
        // Get departures from origin stop
        const rtMap = { 0: 'train', 1: 'tram', 2: 'bus', 3: 'vline' };
        const departures = await ptvFetch(
          `/v3/departures/route_type/${fromStop.route_type}/stop/${fromStop.stop_id}?max_results=6&expand=run,route`
        );

        const now = new Date();
        const legs = (departures.departures || []).slice(0, 3).map(dep => {
          const scheduledDep = dep.scheduled_departure_utc ? new Date(dep.scheduled_departure_utc) : now;
          const estDep       = dep.estimated_departure_utc ? new Date(dep.estimated_departure_utc) : scheduledDep;
          const delaySec     = (estDep - scheduledDep) / 1000;
          const route = (departures.routes || {})[dep.route_id] || {};
          const run   = (departures.runs   || {})[dep.run_ref]  || {};
          const modeStr = rtMap[fromStop.route_type] || 'bus';
          const transitMin = Math.round(haversine(fromLoc.lat, fromLoc.lng, toLoc.lat, toLoc.lng) / (modeStr === 'train' ? 60 : 25) * 60) + 3;

          return {
            duration: transitMin + 5,
            transfers: 0,
            depart: estDep.toISOString(),
            legs: [
              { type: 'walk', from: fromLoc.name, to: fromStop.stop_name, duration: 2 },
              {
                type: modeStr,
                line: route.route_number || route.route_name || dep.route_id,
                color: MODE_COLOR[modeStr] || '#094c8d',
                from: fromStop.stop_name,
                to: toStop.stop_name,
                duration: transitMin,
                depart: estDep.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
                delay: Math.max(0, Math.round(delaySec / 60)),
              },
              { type: 'walk', from: toStop.stop_name, to: toLoc.name, duration: 2 },
            ],
          };
        });

        if (legs.length > 0) {
          return res.json({ mode: 'live', from: fromLoc, to: toLoc, journeys: legs });
        }
      }
    } catch (e) {
      console.warn('PTV journey planning failed, using fallback:', e.message);
    }
  }

  // Fallback mode
  const journeys = buildFallbackJourneys(fromLoc, toLoc);
  res.json({ mode: 'fallback', from: fromLoc, to: toLoc, journeys });
});

// ── GET /api/journey/autocomplete?q=X ────────────────────────────────────────
app.get('/api/journey/autocomplete', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const results = MELBOURNE_LOCATIONS
    .filter(l => l.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(l => ({ name: l.name, type: l.type, lat: l.lat, lng: l.lng }));
  res.json(results);
});

// ── GET /api/stops/nearby?lat=X&lng=Y ────────────────────────────────────────
app.get('/api/stops/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

  const stops = MELBOURNE_LOCATIONS
    .map(loc => {
      const distKm = haversine(lat, lng, loc.lat, loc.lng);
      const walkMin = Math.round(distKm / 5 * 60);
      return { ...loc, distKm: Math.round(distKm * 100) / 100, walkMin };
    })
    .filter(s => s.distKm <= 1.0)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 5);

  res.json(stops);
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

// ── Static ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚆  Transit-Live → http://localhost:${PORT}`);
  console.log(`    API Key  : ${API_KEY ? '✓ set (' + API_KEY.slice(0,20) + '…)' : '✗ MISSING'}`);
  console.log(`    PTV Keys : ${(PTV_DEV_ID && PTV_API_KEY) ? '✓ set' : '✗ not set (fallback mode)'}`);
  console.log(`    Endpoint : ${FEEDS.train.pos}`);
  console.log(`    Debug    : http://localhost:${PORT}/api/debug\n`);
});
