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

// ── Journey planner ───────────────────────────────────────────────────────────
function planJourney(fromLat, fromLng, toLat, toLng, fromName, toName) {
  if (!_loaded) throw new Error('GTFS not loaded');

  const nowMins   = new Date().getHours() * 60 + new Date().getMinutes();
  const fromStops = nearestStops(fromLat, fromLng, 10, 0.8);
  const toStops   = nearestStops(toLat, toLng, 10, 0.8);
  const toStopSet = new Set(toStops.map(s => s.id));
  const toStopMap = new Map(toStops.map(s => [s.id, s]));

  const options = [];

  // ── Direct journeys ───────────────────────────────────────────────────────
  for (const fromStop of fromStops) {
    if (options.length >= 6) break;
    const tripSet = stopTrips.get(fromStop.id);
    if (!tripSet) continue;

    let checked = 0;
    for (const tripId of tripSet) {
      if (++checked > 150) break; // cap per stop to stay fast
      const seq     = tripStops.get(tripId);
      if (!seq) continue;
      const fromIdx = seq.findIndex(s => s.stopId === fromStop.id);
      if (fromIdx < 0) continue;

      for (let i = fromIdx + 1; i < seq.length; i++) {
        if (!toStopSet.has(seq[i].stopId)) continue;

        const toStop      = toStopMap.get(seq[i].stopId);
        const trip        = trips.get(tripId);
        const route       = trip ? routes.get(trip.routeId) : null;
        const mode        = trip?.mode || fromStop.mode;
        const stopCount   = i - fromIdx;
        const depMins     = depToMins(seq[fromIdx].dep);
        const arrMins     = depToMins(seq[i].dep);
        // Use real GTFS scheduled times when available, else estimate
        const transitMin  = (depMins !== null && arrMins !== null && arrMins > depMins)
          ? arrMins - depMins
          : Math.round(stopCount * (mode === 'train' ? 2 : 1.5));
        // Prefer trips departing soon; treat past trips as departing now
        // (GTFS has all-day schedules — we can't distinguish today vs other days)
        const minsUntilDep = depMins !== null ? Math.max(0, depMins - nowMins) : 0;
        const wTo         = walkMins(fromStop.distKm);
        const wFrom       = walkMins(toStop.distKm);
        const total       = wTo + minsUntilDep + transitMin + wFrom;

        // Use cached shape geometry if available, otherwise fall back to stop-sequence dots
        let routePath = seq.slice(fromIdx, i + 1)
          .map(s => stops.get(s.stopId)).filter(Boolean)
          .map(s => [+(s.lat.toFixed(5)), +(s.lng.toFixed(5))]);
        if (trip?.shapeId) {
          const shape = loadShape(trip.shapeId, mode); // cache hit for train/tram
          if (shape && shape.length > 1) {
            const clipped = clipShape(shape, fromStop, toStop);
            if (clipped && clipped.length > 1) routePath = clipped;
          }
        }

        options.push({
          score: total, duration: total, transfers: 0,
          depart: minsToTime(nowMins + wTo + minsUntilDep),
          legs: [
            { type: 'walk', from: fromName || 'Your location', to: fromStop.name, duration: wTo,
              fromLat, fromLng, toLat: fromStop.lat, toLng: fromStop.lng },
            { type: mode,
              line:  route ? (route.shortName || route.longName) : '',
              color: MODE_COLOR[mode] || '#5b8dee',
              from: fromStop.name, to: toStop.name,
              duration: transitMin, stopCount,
              depart: minsToTime(nowMins + wTo + minsUntilDep),
              minsUntilDep, delay: 0, routePath, run_ref: tripId },
            { type: 'walk', from: toStop.name, to: toName || 'Destination', duration: wFrom,
              fromLat: toStop.lat, fromLng: toStop.lng, toLat, toLng },
          ],
        });
        break;
      }
    }
  }

  // ── Transfer journeys (one change) ────────────────────────────────────────
  // Uses proximity-based transfers: any stop within 400m is a valid transfer point,
  // not just those listed in the sparse transfers.txt.
  if (options.length < 4) {
    outer:
    for (const fromStop of fromStops.slice(0, 5)) {
      const tripSet = stopTrips.get(fromStop.id);
      if (!tripSet) continue;

      let checked = 0;
      for (const tripId of tripSet) {
        if (++checked > 80) break;
        const seq     = tripStops.get(tripId);
        if (!seq) continue;
        const fromIdx = seq.findIndex(s => s.stopId === fromStop.id);
        if (fromIdx < 0) continue;

        for (let i = fromIdx + 1; i < seq.length; i++) {
          const xferStopId = seq[i].stopId;
          const xferStop   = stops.get(xferStopId);
          if (!xferStop) continue;

          // Collect all candidate transfer stops: the stop itself + proximity neighbours
          const xferCandidates = [
            ...(transfers.get(xferStopId) || []).map(t => t.toStopId),
            ..._nearbyStopIds(xferStopId, 0.4),
          ];
          if (!xferCandidates.length) continue;

          for (const toStopId2 of xferCandidates) {
            if (toStopId2 === xferStopId) continue;
            const xferTrips = stopTrips.get(toStopId2);
            if (!xferTrips) continue;

            let checked2 = 0;
            for (const tripId2 of xferTrips) {
              if (++checked2 > 60) break;
              if (tripId2 === tripId) continue;
              const seq2    = tripStops.get(tripId2);
              if (!seq2) continue;
              const xferIdx = seq2.findIndex(s => s.stopId === toStopId2);
              if (xferIdx < 0) continue;

              for (let j = xferIdx + 1; j < seq2.length; j++) {
                if (!toStopSet.has(seq2[j].stopId)) continue;

                const boardStop2 = stops.get(toStopId2);
                const toStop     = toStopMap.get(seq2[j].stopId);
                const trip1      = trips.get(tripId);
                const trip2      = trips.get(tripId2);
                const route1     = trip1 ? routes.get(trip1.routeId) : null;
                const route2     = trip2 ? routes.get(trip2.routeId) : null;
                const mode1      = trip1?.mode || fromStop.mode;
                const mode2      = trip2?.mode || 'bus';
                const dep1From   = depToMins(seq[fromIdx].dep);
                const dep1To     = depToMins(seq[i].dep);
                const dep2From   = depToMins(seq2[xferIdx].dep);
                const dep2To     = depToMins(seq2[j].dep);
                const transit1   = (dep1From !== null && dep1To !== null && dep1To > dep1From)
                  ? dep1To - dep1From
                  : Math.round((i - fromIdx) * (mode1 === 'train' ? 2 : 1.5));
                const transit2   = (dep2From !== null && dep2To !== null && dep2To > dep2From)
                  ? dep2To - dep2From
                  : Math.round((j - xferIdx) * (mode2 === 'train' ? 2 : 1.5));
                const xferWalkKm = haversineKm(xferStop.lat, xferStop.lng, boardStop2.lat, boardStop2.lng);
                const xferMins   = Math.max(2, walkMins(xferWalkKm));
                const wait1      = dep1From !== null ? Math.max(0, dep1From - nowMins) : 0;
                const wTo        = walkMins(fromStop.distKm);
                const wFrom      = walkMins(toStop.distKm);
                const total      = wTo + wait1 + transit1 + xferMins + transit2 + wFrom;

                let path1 = seq.slice(fromIdx, i+1).map(s=>stops.get(s.stopId)).filter(Boolean).map(s=>[+(s.lat.toFixed(5)),+(s.lng.toFixed(5))]);
                if (trip1?.shapeId) { const sh = loadShape(trip1.shapeId, mode1); if (sh?.length>1) { const c=clipShape(sh,fromStop,xferStop); if(c?.length>1) path1=c; } }
                let path2 = seq2.slice(xferIdx, j+1).map(s=>stops.get(s.stopId)).filter(Boolean).map(s=>[+(s.lat.toFixed(5)),+(s.lng.toFixed(5))]);
                if (trip2?.shapeId) { const sh = loadShape(trip2.shapeId, mode2); if (sh?.length>1) { const c=clipShape(sh,boardStop2,toStop); if(c?.length>1) path2=c; } }

                options.push({
                  score: total, duration: total, transfers: 1,
                  depart: minsToTime(nowMins + wTo + wait1),
                  legs: [
                    { type: 'walk', from: fromName || 'Your location', to: fromStop.name, duration: wTo,
                      fromLat, fromLng, toLat: fromStop.lat, toLng: fromStop.lng },
                    { type: mode1, line: route1 ? (route1.shortName||route1.longName) : '',
                      color: MODE_COLOR[mode1]||'#5b8dee', from: fromStop.name, to: xferStop.name,
                      duration: transit1, stopCount: i - fromIdx, depart: minsToTime(nowMins+wTo+wait1),
                      minsUntilDep: wait1, delay: 0, routePath: path1, run_ref: tripId },
                    { type: 'walk', from: xferStop.name, to: boardStop2.name, duration: xferMins,
                      fromLat: xferStop.lat, fromLng: xferStop.lng, toLat: boardStop2.lat, toLng: boardStop2.lng },
                    { type: mode2, line: route2 ? (route2.shortName||route2.longName) : '',
                      color: MODE_COLOR[mode2]||'#5b8dee', from: boardStop2.name, to: toStop.name,
                      duration: transit2, stopCount: j - xferIdx, depart: minsToTime(nowMins+wTo+wait1+transit1+xferMins),
                      minsUntilDep: 0, delay: 0, routePath: path2, run_ref: tripId2 },
                    { type: 'walk', from: toStop.name, to: toName||'Destination', duration: wFrom,
                      fromLat: toStop.lat, fromLng: toStop.lng, toLat, toLng },
                  ],
                });
                if (options.length >= 5) break outer;
                break;
              }
            }
          }
        }
      }
    }
  }

  options.sort((a, b) => a.score - b.score);

  // Deduplicate: keep only the best option per unique route signature
  const seen = new Set();
  const deduped = [];
  for (const opt of options) {
    const sig = opt.legs
      .filter(l => l.type !== 'walk')
      .map(l => `${l.type}:${l.line}`)
      .join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(opt);
  }

  // Ensure mode variety: prefer train > tram > bus so buses don't crowd out all slots.
  // Pick best of each mode first, then fill remaining slots with whatever's fastest.
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

module.exports = { load, isLoaded, nearestStops, planJourney, _debug: { stops, routes, trips, tripStops, stopTrips, transfers, shapeCache } };
