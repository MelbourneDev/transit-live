/**
 * gtfs.js — GTFS Static loader + journey planner
 *
 * Loads Victoria's GTFS zip (nested: outer zip → per-mode inner zips → txt files).
 * Uses a byte-level line reader so giant files (tram stop_times ~400MB) never get
 * converted to a single JS string, avoiding the V8 string-length limit.
 */

'use strict';

const AdmZip = require('adm-zip');
const path   = require('path');

// ── In-memory indexes ─────────────────────────────────────────────────────────
const stops      = new Map(); // stop_id  → {id, name, lat, lng, mode}
const routes     = new Map(); // route_id → {id, shortName, longName, mode}
const trips      = new Map(); // trip_id  → {id, routeId, shapeId, mode}
const tripStops  = new Map(); // trip_id  → [{stopId, seq, dep}]  sorted by seq
const stopTrips  = new Map(); // stop_id  → Set<trip_id>
const transfers  = new Map(); // stop_id  → [{toStopId, minSecs}]
const innerZips  = new Map(); // mode     → AdmZip  (kept for lazy shape reads)
const shapeCache = new Map(); // shape_id → [[lat,lng],...]
const stopGrid   = new Map(); // "latBucket,lngBucket" → [stop_id,...]  (spatial index)

// Victoria GTFS folder numbers:
// 1 = V/Line Train (regional rail: Seymour, Ballarat, etc.)
// 2 = Metro Train (Williamstown, Alamein, Frankston, etc.)
// 3 = Metro Tram (routes 1, 8, 96, 109, etc.)
// 4 = Metro Bus
// 5 = V/Line Coach (regional coaches)
const FOLDER_MODE = { '1': 'vline', '2': 'train', '3': 'tram', '4': 'bus', '5': 'vline' };
const MODE_COLOR  = { train: '#094c8d', tram: '#2CA05A', bus: '#F5A623', vline: '#6c3483' };
const WALK_KMH    = 5;

let _loaded  = false;
let _loading = false;

// ── Buffer line reader (avoids single huge string) ────────────────────────────
function* readLines(buf) {
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      if (i > start) {
        const end = (i > 0 && buf[i - 1] === 0x0d) ? i - 1 : i;
        yield buf.subarray(start, end).toString('utf8');
      }
      start = i + 1;
    }
  }
}

// ── CSV line splitter ─────────────────────────────────────────────────────────
function splitLine(line) {
  const vals = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
    cur += c;
  }
  vals.push(cur);
  return vals;
}

// Parse a small file into array of objects (fine for stops/routes/trips/transfers)
function parseCSV(buf) {
  const gen     = readLines(buf);
  const hdrLine = gen.next().value;
  if (!hdrLine) return [];
  const headers = splitLine(hdrLine.trim());
  const rows    = [];
  for (const line of gen) {
    const t = line.trim();
    if (!t) continue;
    const vals = splitLine(t);
    const row  = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Per-mode loader ───────────────────────────────────────────────────────────
function loadFolder(outerZip, folder) {
  const mode = FOLDER_MODE[folder];
  if (!mode) return;

  const innerBuf = outerZip.readFile(`${folder}/google_transit.zip`);
  if (!innerBuf) { console.warn(`  ✗ GTFS folder ${folder} missing`); return; }

  const inner = new AdmZip(innerBuf);
  innerZips.set(mode, inner);

  const readEntry = name => {
    const e = inner.getEntry(name);
    return e ? inner.readFile(e) : null;
  };

  // ── stops.txt ──────────────────────────────────────────────────────────────
  const stopsBuf = readEntry('stops.txt');
  if (stopsBuf) {
    let n = 0;
    for (const r of parseCSV(stopsBuf)) {
      if (!r.stop_id || !r.stop_lat || !r.stop_lon) continue;
      const lat = parseFloat(r.stop_lat);
      const lng = parseFloat(r.stop_lon);
      // Discard stops with coordinates outside Victoria
      if (lat < -39.5 || lat > -33.5 || lng < 140.5 || lng > 150.5) continue;
      stops.set(r.stop_id, { id: r.stop_id, name: r.stop_name || r.stop_id, lat, lng, mode });
      n++;
    }
    console.log(`  ${mode} stops: ${n}`);
  }

  // ── routes.txt ─────────────────────────────────────────────────────────────
  const routesBuf = readEntry('routes.txt');
  if (routesBuf) {
    for (const r of parseCSV(routesBuf)) {
      if (!r.route_id) continue;
      routes.set(r.route_id, {
        id:        r.route_id,
        shortName: r.route_short_name || '',
        longName:  r.route_long_name  || '',
        color:     r.route_color ? '#' + r.route_color : '',
        mode,
      });
    }
  }

  // ── trips.txt ──────────────────────────────────────────────────────────────
  const tripsBuf = readEntry('trips.txt');
  if (tripsBuf) {
    for (const r of parseCSV(tripsBuf)) {
      if (!r.trip_id) continue;
      trips.set(r.trip_id, {
        id:       r.trip_id,
        routeId:  r.route_id,
        shapeId:  r.shape_id || '',
        headsign: r.trip_headsign || '',
        mode,
      });
    }
  }

  // ── stop_times.txt — streamed line by line, never a single huge string ──────
  const stBuf = readEntry('stop_times.txt');
  if (stBuf) {
    const gen     = readLines(stBuf);
    const hdrLine = gen.next().value;
    if (hdrLine) {
      const hdr    = splitLine(hdrLine.trim());
      const iTrip  = hdr.indexOf('trip_id');
      const iStop  = hdr.indexOf('stop_id');
      const iSeq   = hdr.indexOf('stop_sequence');
      const iDep   = hdr.indexOf('departure_time');
      const iArr   = hdr.indexOf('arrival_time');
      const byTrip = new Map();

      for (const line of gen) {
        const t = line.trim();
        if (!t) continue;
        const v      = splitLine(t);
        const tripId = v[iTrip];
        const stopId = v[iStop];
        if (!tripId || !stopId) continue;
        if (!byTrip.has(tripId)) byTrip.set(tripId, []);
        byTrip.get(tripId).push({
          stopId,
          seq: parseInt(v[iSeq]) || 0,
          dep: v[iDep] || v[iArr] || '',
        });
      }

      for (const [tripId, list] of byTrip) {
        const sorted = list.sort((a, b) => a.seq - b.seq);
        tripStops.set(tripId, sorted);
        for (const s of sorted) {
          if (!stopTrips.has(s.stopId)) stopTrips.set(s.stopId, new Set());
          stopTrips.get(s.stopId).add(tripId);
        }
      }
    }
    console.log(`  ${mode} trips indexed: ${trips.size} total`);
  }

  // ── transfers.txt ──────────────────────────────────────────────────────────
  const trBuf = readEntry('transfers.txt');
  if (trBuf) {
    for (const r of parseCSV(trBuf)) {
      if (!r.from_stop_id || !r.to_stop_id) continue;
      if (!transfers.has(r.from_stop_id)) transfers.set(r.from_stop_id, []);
      transfers.get(r.from_stop_id).push({
        toStopId: r.to_stop_id,
        minSecs:  parseInt(r.min_transfer_time) || 120,
      });
    }
  }
}

// ── Public: load all modes ────────────────────────────────────────────────────
function load(gtfsZipPath) {
  if (_loaded || _loading) return;
  _loading = true;
  console.log('\nLoading GTFS static data…');
  const t0 = Date.now();
  try {
    const outer = new AdmZip(gtfsZipPath);
    // Load metro train (2) last so its stop IDs take priority over any overlaps
    for (const folder of ['4', '3', '5', '1', '2']) {
      loadFolder(outer, folder);
    }
    _buildStopGrid();
    // Pre-load shapes for train + tram in one pass each (bus too large, loaded lazily)
    preloadShapes('train');
    preloadShapes('tram');
    _loaded  = true;
    console.log(`✓ GTFS ready — ${stops.size} stops | ${trips.size} trips | ${shapeCache.size} shapes cached | ${stopGrid.size} grid cells — ${((Date.now()-t0)/1000).toFixed(1)}s\n`);
  } catch (e) {
    console.error('✗ GTFS load failed:', e.message);
  } finally {
    _loading = false;
  }
}

// ── Shape pre-loader (single pass over shapes.txt, caches everything) ─────────
// Much faster than the lazy per-shape scan for modes with manageable shape files.
function preloadShapes(mode) {
  const inner = innerZips.get(mode);
  if (!inner) return;
  const e = inner.getEntry('shapes.txt');
  if (!e) return;

  const buf = inner.readFile(e);
  const gen = readLines(buf);
  const hdrLine = gen.next().value;
  if (!hdrLine) return;

  const hdr  = splitLine(hdrLine.trim());
  const iId  = hdr.indexOf('shape_id');
  const iLat = hdr.indexOf('shape_pt_lat');
  const iLng = hdr.indexOf('shape_pt_lon');
  const iSeq = hdr.indexOf('shape_pt_sequence');
  if (iId < 0 || iLat < 0 || iLng < 0) return;

  const byShape = new Map();
  for (const line of gen) {
    const t = line.trim();
    if (!t) continue;
    const v = splitLine(t);
    const id = v[iId];
    if (!id) continue;
    if (!byShape.has(id)) byShape.set(id, []);
    byShape.get(id).push({ seq: parseInt(v[iSeq]) || 0, lat: parseFloat(v[iLat]), lng: parseFloat(v[iLng]) });
  }

  let count = 0;
  for (const [shapeId, pts] of byShape) {
    pts.sort((a, b) => a.seq - b.seq);
    // Thin: keep every 2nd point to halve memory, always keep first + last
    const coords = pts
      .filter((_, i) => i % 2 === 0 || i === pts.length - 1)
      .map(p => [+(p.lat.toFixed(5)), +(p.lng.toFixed(5))]);
    shapeCache.set(shapeId, coords);
    count++;
  }
  console.log(`  ${mode} shapes: ${count} loaded`);
}

function isLoaded() { return _loaded; }

// ── Spatial stop grid ─────────────────────────────────────────────────────────
// Grid cell ≈ 0.01° ≈ 1.1km — used for fast proximity-based transfer discovery.
const GRID_DEG = 0.01;
function _gridKey(lat, lng) {
  return `${Math.floor(lat / GRID_DEG)},${Math.floor(lng / GRID_DEG)}`;
}
function _buildStopGrid() {
  stopGrid.clear();
  for (const s of stops.values()) {
    if (!stopTrips.has(s.id)) continue; // only indexable stops
    const key = _gridKey(s.lat, s.lng);
    if (!stopGrid.has(key)) stopGrid.set(key, []);
    stopGrid.get(key).push(s.id);
  }
}

// Returns stop IDs (excluding `stopId` itself) within maxKm using the grid.
function _nearbyStopIds(stopId, maxKm = 0.4) {
  const origin = stops.get(stopId);
  if (!origin) return [];
  const cells = Math.ceil(maxKm / (GRID_DEG * 111)) + 1;
  const latBucket = Math.floor(origin.lat / GRID_DEG);
  const lngBucket = Math.floor(origin.lng / GRID_DEG);
  const result = [];
  for (let dLat = -cells; dLat <= cells; dLat++) {
    for (let dLng = -cells; dLng <= cells; dLng++) {
      const ids = stopGrid.get(`${latBucket + dLat},${lngBucket + dLng}`);
      if (!ids) continue;
      for (const id of ids) {
        if (id === stopId) continue;
        const s = stops.get(id);
        if (s && haversineKm(origin.lat, origin.lng, s.lat, s.lng) <= maxKm) result.push(id);
      }
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
               Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function walkMins(km) { return Math.max(1, Math.round(km / WALK_KMH * 60)); }

function depToMins(dep) {
  if (!dep) return null;
  const p = dep.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1] || 0);
}

function minsToTime(mins) {
  const h      = Math.floor(Math.abs(mins) / 60) % 24;
  const m      = Math.abs(mins) % 60;
  const period = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Nearest stops (grid-accelerated) ──────────────────────────────────────────
// Uses the spatial grid to avoid scanning all 27k stops
function nearestStops(lat, lng, n = 5, maxKm = 1.2) {
  const cells = Math.ceil(maxKm / (GRID_DEG * 111)) + 1;
  const latBucket = Math.floor(lat / GRID_DEG);
  const lngBucket = Math.floor(lng / GRID_DEG);
  const results = [];
  for (let dLat = -cells; dLat <= cells; dLat++) {
    for (let dLng = -cells; dLng <= cells; dLng++) {
      const ids = stopGrid.get(`${latBucket + dLat},${lngBucket + dLng}`);
      if (!ids) continue;
      for (const id of ids) {
        const s = stops.get(id);
        if (!s) continue;
        const distKm = haversineKm(lat, lng, s.lat, s.lng);
        if (distKm <= maxKm) results.push({ ...s, distKm });
      }
    }
  }
  return results.sort((a, b) => a.distKm - b.distKm).slice(0, n);
}

// ── Lazy shape loader (cached, thinned to every 3rd point) ────────────────────
function loadShape(shapeId, mode) {
  if (shapeCache.has(shapeId)) return shapeCache.get(shapeId);
  const inner = innerZips.get(mode);
  if (!inner) return null;
  const e = inner.getEntry('shapes.txt');
  if (!e) return null;

  const buf = inner.readFile(e);
  const gen = readLines(buf);
  const hdrLine = gen.next().value;
  if (!hdrLine) return null;

  const hdr  = splitLine(hdrLine.trim());
  const iId  = hdr.indexOf('shape_id');
  const iLat = hdr.indexOf('shape_pt_lat');
  const iLng = hdr.indexOf('shape_pt_lon');
  const iSeq = hdr.indexOf('shape_pt_sequence');

  const pts = [];
  for (const line of gen) {
    const t = line.trim();
    if (!t) continue;
    const v = splitLine(t);
    if (v[iId] !== shapeId) continue;
    pts.push({ seq: parseInt(v[iSeq]) || 0, lat: parseFloat(v[iLat]), lng: parseFloat(v[iLng]) });
  }

  pts.sort((a, b) => a.seq - b.seq);
  const coords = pts
    .filter((_, i) => i % 3 === 0 || i === pts.length - 1)
    .map(p => [+(p.lat.toFixed(5)), +(p.lng.toFixed(5))]);

  shapeCache.set(shapeId, coords);
  return coords;
}

// ── Clip shape to the segment between two stops ───────────────────────────────
function clipShape(shape, fromStop, toStop) {
  if (!shape || shape.length < 2 || !fromStop?.lat || !toStop?.lat) return shape || [];
  let fromBest = 0, toBest = shape.length - 1;
  let fromDist = Infinity, toDist = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const d1 = haversineKm(fromStop.lat, fromStop.lng, shape[i][0], shape[i][1]);
    const d2 = haversineKm(toStop.lat,   toStop.lng,   shape[i][0], shape[i][1]);
    if (d1 < fromDist) { fromDist = d1; fromBest = i; }
    if (d2 < toDist)   { toDist   = d2; toBest   = i; }
  }
  if (fromBest >= toBest) return shape;
  return shape.slice(fromBest, toBest + 1);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ── RAPTOR — Round-Based Public Transit Routing ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Route patterns: group trips by their ordered stop sequence.
// A "pattern" is a unique ordered list of stop IDs that multiple trips share.
const patterns     = [];         // [{id, stopIds, trips:[{tripId, depMins:[]}], routeId, mode}]
const stopPatterns = new Map();  // stop_id → [{patIdx, stopPos}]
let _raptorBuilt   = false;

function buildRaptorIndex() {
  if (_raptorBuilt) return;
  const t0 = Date.now();

  // Group trips by their ordered stop sequence → pattern key
  const patternMap = new Map();
  for (const [tripId, seq] of tripStops) {
    if (!seq || seq.length < 2) continue;
    const trip = trips.get(tripId);
    if (!trip) continue;

    const stopIds = seq.map(s => s.stopId);
    const key = stopIds.join(',');
    const depMins = seq.map(s => depToMins(s.dep));
    if (depMins.every(d => d === null)) continue;

    if (!patternMap.has(key)) {
      patternMap.set(key, { stopIds, trips: [], routeId: trip.routeId, mode: trip.mode });
    }
    patternMap.get(key).trips.push({ tripId, depMins });
  }

  // Convert to array, sort trips within each pattern by first departure
  let patIdx = 0;
  for (const pat of patternMap.values()) {
    pat.trips.sort((a, b) => {
      const aFirst = a.depMins.find(d => d !== null) || 0;
      const bFirst = b.depMins.find(d => d !== null) || 0;
      return aFirst - bFirst;
    });
    pat.id = patIdx;
    patterns.push(pat);
    for (let pos = 0; pos < pat.stopIds.length; pos++) {
      const sid = pat.stopIds[pos];
      if (!stopPatterns.has(sid)) stopPatterns.set(sid, []);
      stopPatterns.get(sid).push({ patIdx, stopPos: pos });
    }
    patIdx++;
  }

  _raptorBuilt = true;
  console.log(`  ✓ RAPTOR index: ${patterns.length} patterns from ${tripStops.size} trips — ${Date.now()-t0}ms`);
}

// Find the earliest trip in a pattern departing from stopPos at or after minDepMins
function earliestTrip(pat, stopPos, minDepMins) {
  const trps = pat.trips;
  let lo = 0, hi = trps.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const dep = trps[mid].depMins[stopPos];
    if (dep !== null && dep >= minDepMins) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best !== null ? trps[best] : null;
}

// ── Main RAPTOR query ─────────────────────────────────────────────────────────
function planJourney(fromLat, fromLng, toLat, toLng, fromName, toName) {
  if (!_loaded) throw new Error('GTFS not loaded');
  if (!_raptorBuilt) buildRaptorIndex();

  const MAX_ROUNDS    = 3;
  const MAX_WALK_KM   = 1.5;
  const TRANSFER_WALK = 0.4;
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  const fromStopsAll = nearestStops(fromLat, fromLng, 30, MAX_WALK_KM);
  const toStopsAll   = nearestStops(toLat, toLng, 30, MAX_WALK_KM);
  if (!fromStopsAll.length || !toStopsAll.length) return [];

  const toStopSet = new Set(toStopsAll.map(s => s.id));

  // RAPTOR state
  const tau     = Array.from({length: MAX_ROUNDS + 1}, () => new Map());
  const tauBest = new Map();
  const parent  = new Map();

  // Initialize: walk to origin stops
  const marked = new Set();
  for (const s of fromStopsAll) {
    const arrTime = nowMins + walkMins(s.distKm);
    tau[0].set(s.id, arrTime);
    tauBest.set(s.id, arrTime);
    parent.set(s.id + ':0', { round: 0, type: 'origin', stopId: s.id, walkKm: s.distKm });
    marked.add(s.id);
  }

  // RAPTOR rounds
  for (let k = 1; k <= MAX_ROUNDS; k++) {
    const newMarked = new Set();
    const scanned = new Set();

    // Scan routes from marked stops
    for (const sid of marked) {
      const pats = stopPatterns.get(sid);
      if (!pats) continue;
      for (const { patIdx, stopPos } of pats) {
        if (scanned.has(patIdx)) continue;
        scanned.add(patIdx);

        const pat = patterns[patIdx];
        // Find the earliest boarding point on this pattern from any marked stop
        let bestBoardPos = -1, bestBoardTime = Infinity, bestBoardSid = null;
        for (let p = 0; p < pat.stopIds.length; p++) {
          const psid = pat.stopIds[p];
          const arr = tau[k-1].get(psid);
          if (arr !== undefined && arr < bestBoardTime) {
            bestBoardTime = arr;
            bestBoardPos = p;
            bestBoardSid = psid;
          }
        }
        if (bestBoardPos < 0) continue;

        const trip = earliestTrip(pat, bestBoardPos, bestBoardTime);
        if (!trip) continue;

        // Ride the trip forward
        for (let pos = bestBoardPos + 1; pos < pat.stopIds.length; pos++) {
          const arrMin = trip.depMins[pos];
          if (arrMin === null) continue;
          const destSid = pat.stopIds[pos];
          const prevBest = tauBest.get(destSid) ?? Infinity;
          if (arrMin < prevBest) {
            tau[k].set(destSid, arrMin);
            tauBest.set(destSid, arrMin);
            newMarked.add(destSid);
            parent.set(destSid + ':' + k, {
              round: k, type: 'transit', patIdx, tripId: trip.tripId,
              boardStopId: bestBoardSid, boardPos: bestBoardPos, alightPos: pos,
              depMin: trip.depMins[bestBoardPos], arrMin,
            });
          }
        }
      }
    }

    // Transfers: walk to nearby stops
    for (const sid of newMarked) {
      const arrTime = tau[k].get(sid);
      if (arrTime === undefined) continue;
      const nearby = _nearbyStopIds(sid, TRANSFER_WALK);
      for (const nid of nearby) {
        const ns = stops.get(nid);
        const os = stops.get(sid);
        if (!ns || !os) continue;
        const wk = haversineKm(os.lat, os.lng, ns.lat, ns.lng);
        const newArr = arrTime + walkMins(wk);
        const prevBest = tauBest.get(nid) ?? Infinity;
        if (newArr < prevBest) {
          tau[k].set(nid, newArr);
          tauBest.set(nid, newArr);
          newMarked.add(nid);
          parent.set(nid + ':' + k + ':xfer', {
            round: k, type: 'transfer', fromStopId: sid, toStopId: nid, walkKm: wk,
          });
        }
      }
    }

    marked.clear();
    for (const s of newMarked) marked.add(s);
    if (marked.size === 0) break;
  }

  // ── Extract journeys ────────────────────────────────────────────────────────
  const results = [];
  for (const toStop of toStopsAll) {
    for (let k = 1; k <= MAX_ROUNDS; k++) {
      const arr = tau[k]?.get(toStop.id);
      if (arr === undefined) continue;

      const legs = [];
      let curStopId = toStop.id;
      let curRound  = k;

      // Final walk to destination
      legs.unshift({
        type: 'walk', from: toStop.name, to: toName || 'Destination',
        duration: walkMins(toStop.distKm),
        fromLat: toStop.lat, fromLng: toStop.lng, toLat, toLng,
      });

      let safety = 20;
      while (curRound > 0 && --safety > 0) {
        // Check for transfer at this stop+round
        const xferKey = curStopId + ':' + curRound + ':xfer';
        const xp = parent.get(xferKey);
        if (xp && xp.type === 'transfer') {
          const fromS = stops.get(xp.fromStopId);
          const toS   = stops.get(xp.toStopId);
          if (fromS && toS) {
            legs.unshift({
              type: 'walk', from: fromS.name, to: toS.name,
              duration: walkMins(xp.walkKm),
              fromLat: fromS.lat, fromLng: fromS.lng, toLat: toS.lat, toLng: toS.lng,
            });
          }
          curStopId = xp.fromStopId;
          continue;
        }

        // Check for transit leg
        const key = curStopId + ':' + curRound;
        const p = parent.get(key);
        if (!p) break;

        if (p.type === 'transit') {
          const pat   = patterns[p.patIdx];
          const trip  = trips.get(p.tripId);
          const route = trip ? routes.get(trip.routeId) : null;
          const mode  = pat.mode || trip?.mode || 'bus';
          const boardStop  = stops.get(p.boardStopId);
          const alightStop = stops.get(pat.stopIds[p.alightPos]);
          const stopCount  = p.alightPos - p.boardPos;

          let routePath = pat.stopIds.slice(p.boardPos, p.alightPos + 1)
            .map(sid => stops.get(sid)).filter(Boolean)
            .map(s => [+(s.lat.toFixed(5)), +(s.lng.toFixed(5))]);
          if (trip?.shapeId && boardStop && alightStop) {
            const shape = loadShape(trip.shapeId, mode);
            if (shape && shape.length > 1) {
              const clipped = clipShape(shape, boardStop, alightStop);
              if (clipped && clipped.length > 1) routePath = clipped;
            }
          }

          legs.unshift({
            type: mode,
            line: route ? (route.shortName || route.longName) : '',
            color: route?.color || MODE_COLOR[mode] || '#5b8dee',
            from: boardStop?.name || '?', to: alightStop?.name || '?',
            duration: (p.arrMin != null && p.depMin != null) ? p.arrMin - p.depMin : stopCount * 2,
            stopCount,
            depart: minsToTime(p.depMin ?? nowMins),
            minsUntilDep: p.depMin != null ? Math.max(0, p.depMin - nowMins) : 0,
            delay: 0, routePath, run_ref: p.tripId,
          });

          curStopId = p.boardStopId;
          curRound--;
        } else if (p.type === 'origin') {
          const s = stops.get(p.stopId);
          legs.unshift({
            type: 'walk', from: fromName || 'Your location', to: s?.name || '?',
            duration: walkMins(p.walkKm),
            fromLat, fromLng, toLat: s?.lat, toLng: s?.lng,
          });
          break;
        } else {
          break;
        }
      }

      const totalMin = legs.reduce((s, l) => s + (l.duration || 0), 0);
      const transfers = legs.filter(l => l.type !== 'walk').length - 1;
      const firstTransit = legs.find(l => l.type !== 'walk');

      results.push({
        score: totalMin + Math.max(0, transfers) * 5,
        duration: totalMin,
        transfers: Math.max(0, transfers),
        depart: firstTransit?.depart || minsToTime(nowMins),
        legs,
      });
    }
  }

  // Dedup and variety
  results.sort((a, b) => a.score - b.score);
  const seen = new Set();
  const deduped = [];
  for (const opt of results) {
    const sig = opt.legs.filter(l => l.type !== 'walk').map(l => `${l.type}:${l.line}`).join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(opt);
  }

  const modeOrder = ['train', 'vline', 'tram', 'bus'];
  const getPrimaryMode = opt => opt.legs.find(l => l.type !== 'walk')?.type || 'bus';
  const final = [];
  for (const mode of modeOrder) {
    const best = deduped.find(o => getPrimaryMode(o) === mode);
    if (best && final.length < 5) final.push(best);
  }
  for (const opt of deduped) {
    if (final.length >= 5) break;
    if (!final.includes(opt)) final.push(opt);
  }
  final.sort((a, b) => a.score - b.score);
  return final;
}

module.exports = { load, isLoaded, nearestStops, planJourney, buildRaptorIndex, _debug: { stops, routes, trips, tripStops, stopTrips, transfers, shapeCache } };
