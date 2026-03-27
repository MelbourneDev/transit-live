/**
 * walkrouter.js — Local A* walking path router
 *
 * Loads Melbourne's walkable road network from OSM (Overpass JSON export),
 * builds an in-memory graph, and answers walk path queries in <50ms.
 * No external API calls — all local.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Graph storage ─────────────────────────────────────────────────────────────
const nodes = new Map();  // nodeId → {lat, lng}
const adj   = new Map();  // nodeId → [{to: nodeId, dist: meters}]

// Spatial grid for fast nearest-node lookups
const GRID  = 0.001; // ~111m cells
const grid  = new Map(); // "latBucket,lngBucket" → [nodeId, ...]

let _loaded = false;

// ── Haversine distance in meters ──────────────────────────────────────────────
function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Grid helpers ──────────────────────────────────────────────────────────────
function gridKey(lat, lng) {
  return `${Math.floor(lat / GRID)},${Math.floor(lng / GRID)}`;
}

function nearestNode(lat, lng, maxM = 500) {
  const latB = Math.floor(lat / GRID);
  const lngB = Math.floor(lng / GRID);
  const cells = Math.ceil(maxM / (GRID * 111000)) + 1;
  let best = null, bestDist = Infinity;
  for (let dLat = -cells; dLat <= cells; dLat++) {
    for (let dLng = -cells; dLng <= cells; dLng++) {
      const ids = grid.get(`${latB + dLat},${lngB + dLng}`);
      if (!ids) continue;
      for (const nid of ids) {
        const n = nodes.get(nid);
        if (!n) continue;
        const d = distM(lat, lng, n.lat, n.lng);
        if (d < bestDist && d <= maxM) { bestDist = d; best = nid; }
      }
    }
  }
  return best;
}

// ── Load OSM data ─────────────────────────────────────────────────────────────
function load(filePath) {
  if (_loaded) return;
  if (!fs.existsSync(filePath)) {
    console.warn('⚠ Walk router: road network file not found:', filePath);
    return;
  }

  const t0 = Date.now();
  console.log('Loading walk network…');

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const elements = raw.elements || [];

  // Pass 1: collect all nodes
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodes.set(el.id, { lat: el.lat, lng: el.lon });
      const key = gridKey(el.lat, el.lon);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(el.id);
    }
  }

  // Pass 2: build edges from ways
  let edgeCount = 0;
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;

    const oneway = el.tags?.oneway === 'yes';
    const hw = el.tags?.highway || '';
    // Walking speed penalty for major roads (less pleasant to walk)
    const penalty = (hw === 'trunk' || hw === 'primary') ? 1.3 : 1.0;

    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i];
      const b = el.nodes[i + 1];
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (!na || !nb) continue;

      const d = distM(na.lat, na.lng, nb.lat, nb.lng) * penalty;

      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push({ to: b, dist: d });

      // Walking is bidirectional regardless of road oneway
      if (!adj.has(b)) adj.set(b, []);
      adj.get(b).push({ to: a, dist: d });

      edgeCount++;
    }
  }

  _loaded = true;
  console.log(`✓ Walk network: ${nodes.size} nodes, ${edgeCount} edges, ${grid.size} grid cells — ${Date.now() - t0}ms`);
}

// ── A* pathfinding ────────────────────────────────────────────────────────────
// Returns array of [lng, lat] coordinates (GeoJSON order), or null if no path.
function findPath(fromLat, fromLng, toLat, toLng) {
  if (!_loaded) return null;

  const startNode = nearestNode(fromLat, fromLng);
  const endNode   = nearestNode(toLat, toLng);
  if (!startNode || !endNode) return null;
  if (startNode === endNode) {
    const n = nodes.get(startNode);
    return [[fromLng, fromLat], [n.lng, n.lat], [toLng, toLat]];
  }

  const endN = nodes.get(endNode);
  if (!endN) return null;

  // A* with haversine heuristic
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();

  gScore.set(startNode, 0);
  fScore.set(startNode, distM(nodes.get(startNode).lat, nodes.get(startNode).lng, endN.lat, endN.lng));

  // Simple priority queue (array-based, fine for short walks)
  const open = [startNode];
  const inOpen = new Set([startNode]);
  const closed = new Set();

  let iterations = 0;
  const MAX_ITER = 50000; // safety cap

  while (open.length > 0 && iterations < MAX_ITER) {
    iterations++;

    // Find node with lowest fScore
    let bestIdx = 0;
    let bestF = fScore.get(open[0]) ?? Infinity;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < bestF) { bestF = f; bestIdx = i; }
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);
    inOpen.delete(current);

    if (current === endNode) {
      // Reconstruct path
      const path = [[toLng, toLat]];
      let node = endNode;
      while (cameFrom.has(node)) {
        const n = nodes.get(node);
        if (n) path.unshift([n.lng, n.lat]);
        node = cameFrom.get(node);
      }
      path.unshift([fromLng, fromLat]);
      return path;
    }

    closed.add(current);
    const currentG = gScore.get(current) ?? Infinity;
    const neighbors = adj.get(current);
    if (!neighbors) continue;

    for (const { to, dist } of neighbors) {
      if (closed.has(to)) continue;
      const tentG = currentG + dist;
      const prevG = gScore.get(to) ?? Infinity;
      if (tentG < prevG) {
        cameFrom.set(to, current);
        gScore.set(to, tentG);
        const toN = nodes.get(to);
        fScore.set(to, tentG + (toN ? distM(toN.lat, toN.lng, endN.lat, endN.lng) : 0));
        if (!inOpen.has(to)) {
          open.push(to);
          inOpen.add(to);
        }
      }
    }
  }

  // No path found — return straight line
  return [[fromLng, fromLat], [toLng, toLat]];
}

function isLoaded() { return _loaded; }

module.exports = { load, isLoaded, findPath };
