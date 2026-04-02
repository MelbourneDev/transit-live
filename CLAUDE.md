# Transit-Live Melbourne — Project Reference

## Vision

**Google Maps for Melbourne** — a real-time transit tracker and journey planner with aesthetic maps, pro-Melbourne news/events/localised ads woven throughout. Web app first, native apps later once it gains traction.

**USP:** Beautiful map aesthetics + Melbourne-local content + social features (see friends on vehicles). Monetisation via hyper-local ads triggered by journey context ("you and your friend are both passing this restaurant").

## Principles — How to Work on This Project

1. **Everything API-driven** — never hardcode routes, stops, addresses, or data that should be dynamic.
2. **No amateur design** — this is a hobby project but it needs to feel professional. Buggy or slow = no users.
3. **Speed matters** — sub-second routing is the target. Use proper algorithms (RAPTOR), not brute force.
4. **Don't over-engineer** — fix the problem in front of you. Don't add abstractions for hypothetical futures.
5. **Ask before assuming** — when business logic is unclear, present options to Matt and let him decide. Don't spend long mulling alone.
6. **Commit often, push always** — small commits with clear messages. Push to GitHub after every logical change.
7. **Explain in plain language** — when Matt asks "what is this for?", explain without jargon. He's technical but values clarity.
8. **No buggy animations** — if an animation doesn't work right, remove it. Stable > flashy.
9. **One map system, many themes** — map themes must use the same MapLibre engine with different style JSONs. Never build a separate rendering system for a theme. See "Map Themes" section.

---

## Stack

**Backend:** Node.js + Express (`server.js` ~1000 lines)
**GTFS Loader + RAPTOR:** `gtfs.js` (~720 lines) — custom transit routing algorithm
**Walk Router:** `walkrouter.js` (~200 lines) — A* pathfinding on OSM road network
**Frontend:** Single-page HTML/CSS/Vanilla JS
**Map:** MapLibre GL JS v4 + PMTiles v3 (open-source, no API token)
**Geocoding:** 665k local Melbourne addresses + 27k GTFS stops + Nominatim fallback
**Walk Paths:** Local A* on OSM road network (3.6M nodes, 4M edges — full Greater Melbourne)

---

## File Structure

```
transit-live-app/
├── server.js              # Express backend — GTFS-RT feeds, journey API, auth
├── gtfs.js                # GTFS static data loader + RAPTOR journey planner
├── walkrouter.js          # A* walking path router using OSM road network
├── addresses.json         # 665k Melbourne addresses (built from OSM)
├── addresses.tsv          # Same addresses, tab-separated (loaded at startup)
├── melbourne_suburbs.json # Suburb boundary data
├── build-address-index.js # Script to rebuild addresses from OSM Overpass data
├── CLAUDE.md              # This file
├── public/
│   ├── index.html         # App shell — sidebar, map, sheets, overlays
│   ├── js/
│   │   ├── app.js         # Frontend core (~1950 lines) — map, vehicles, journey UI, filters, themes, POI click
│   │   ├── auth.js        # Auth system (~470 lines) — avatar SVG, OTP flow, profile
│   │   ├── markers.js     # MarkerSystem class — ad-spot markers (ES module, not yet wired)
│   │   └── navigation.js  # NavigationController — Valhalla routing + glow trail (ES module)
│   ├── css/style.css      # All styles (~1400 lines)
│   ├── styles/
│   │   ├── maplibre-style.json    # Default map theme (Ghibli pastels)
│   │   └── maplibre-pixel.json    # Pixel art theme (earthy palette, building textures, Press Start 2P font)
│   ├── sprites/
│   │   ├── pixel-sprite.png       # Sprite atlas for pixel art building/park/water patterns
│   │   └── pixel-sprite.json      # Sprite atlas index
│   ├── fonts/
│   │   └── Press Start 2P Regular/  # PBF glyph files for pixel art map labels (256 files)
│   ├── data/ad-spots.json # Ad spot GeoJSON (served via /api/ad-spots)
│   └── sprite-preview.html # Dev tool — preview all pixel art sprites
├── gtfs.zip               # GTFS static data (Victoria, ~400k trips) — not in git
├── melbourne_roads.json   # OSM walkable road network, full Greater Melbourne (~489MB) — not in git
├── public/melbourne.pmtiles # Vector tile archive for map (~112MB) — not in git
├── .env                   # API keys (gitignored)
└── package.json
```

---

## Map Themes

### Architecture
Map themes are **MapLibre style JSON files** that change how the same vector tile data is rendered. All themes use the same PMTiles source, same map engine, same interactions. Switching themes is a single `map.setStyle()` call.

**Critical rule:** Never build a separate rendering system for a theme. No overlay canvases, no React apps, no custom renderers. One MapLibre instance, swappable style JSONs.

### Current themes
1. **Ghibli** (`maplibre-style.json`) — pastel greens, warm creams, soft aesthetic. Default.
2. **Pixel Art** (`maplibre-pixel.json`) — earthy green/brown palette inspired by Pokemon/Stardew Valley.

### Pixel Art theme details
- **Colours:** Rich grass greens (#4a7c3f), sandy roads (#c8beb0), bold blue water (#2563a8), warm building tones
- **Building textures:** Uses `fill-extrusion-pattern` with 5 sprite variants by height:
  - 0-10m: warm brick with small windows (residential)
  - 10-20m: terracotta/red brick (terraces)
  - 20-50m: grey with window grid (commercial)
  - 50-80m: blue glass curtain wall (towers)
  - 80m+: dark glass (skyscrapers)
- **Parks:** Repeating pattern with tiny pixel trees and flower dots
- **Water:** Pixel ripple pattern with shimmer highlights
- **Font:** Press Start 2P (PBF glyphs generated from TTF using `fontnik`, hosted at `/fonts/`)
- **POI labels:** Landmarks, attractions, museums, stations, theatres visible. Restaurants/shops hidden.
- **Sprite atlas:** `/sprites/pixel-sprite.png` + `.json` — 9 patterns (3 building, 3 building variant, park, water, road)

### Theme switcher
- Dropdown in header: 🎨 Ghibli | 🎮 Pixel Art
- `switchMapStyle(styleId)` in app.js — calls `map.setStyle()` with the style URL
- Selection persisted in localStorage
- POI click handlers re-registered after style change via `map.on('style.load', setupPoiClick)`

### Adding a new theme
1. Copy `maplibre-style.json` as a starting point
2. Modify paint properties on fill, line, fill-extrusion layers. **Do not touch symbol layers** unless changing font/colour — keep their filter and layout logic intact.
3. Add custom sprites if needed (create PNG atlas + JSON, reference via `sprite` property in style)
4. For custom fonts: generate PBF glyphs using `fontnik` from a TTF file, host in `/public/fonts/FontName/`
5. Add entry to `MAP_STYLES` object in app.js
6. Add option to the `<select>` in index.html

### Pixelation shader — unsolved problem
Matt wants a WebGL post-processing shader that pixelates the map geometry while keeping text labels crisp. Multiple approaches were tried:
- **Overlay canvas** — pixelates everything including text, markers hidden behind
- **Custom MapLibre layer before symbols** — GL state restoration issues cause labels to detach from coordinates
- **CSS resolution reduction** — pixelates text too

The core challenge: MapLibre renders everything (geometry + labels) on one canvas. Separating them for independent processing breaks geo-anchoring. This needs someone with deep MapLibre/WebGL internals knowledge. The style JSON colour approach works as a fallback.

---

## POI / Landmark Click System

Clicking any POI on the map (attractions, museums, stations, etc.) shows a popup with:
- Icon + name + category label
- "Get Directions" button

The button calls `selectAddrResult(lat, lng, name)` which:
1. Places a destination pin on the map
2. Triggers the RAPTOR journey planner from user's location
3. Shows route cards in the sidebar

Click handler is registered via `setupPoiClick()` and re-registered on `style.load` events so it survives theme switches.

---

## Isometric View & Free Rotation

- **🏙️ Iso button** in header — toggles `pitch: 55, bearing: -20` with smooth animation
- **Free rotation** — `map.dragRotate` and `map.touchPitch` enabled. Right-click drag (desktop) or two-finger rotate (mobile)
- Works with both map themes
- 3D building extrusions look great in isometric view, especially with pixel art textures

---

## RAPTOR Journey Planner (`gtfs.js`)

Custom **RAPTOR algorithm** (Round-Based Public Transit Optimized Router).

### How it works
1. **Startup:** Loads GTFS zip (~90s), builds spatial grid, builds RAPTOR pattern index (~7s)
2. **Pattern index:** Groups 423k trips into ~3,300 route patterns (unique stop sequences) with sorted timetables
3. **Query (3 rounds):** Direct routes → 1 transfer → 2 transfers
4. **Binary search** for earliest departing trip at each stop
5. **Results:** Up to 5 Pareto-optimal routes with mode variety, deduplication, board/alight instructions

### Performance
- Query time: 700ms–3.7s (down from 5-12s with old brute-force planner)
- Still slower than ideal — see "Next Steps" for optimisation targets

### Journey result format
Each journey has `legs[]` where each leg is either:
- `walk` — with `fromLat/fromLng/toLat/toLng`, optional `walkPath` (A* road geometry)
- `train/tram/bus/vline` — with `from`, `to`, `line`, `color`, `stopCount`, `duration`, `depart`, `routePath` (GTFS shape geometry)

Consecutive walk legs are collapsed into single walks. Walk-only routes filtered out for trips > 5km.

---

## Walk Router (`walkrouter.js`)

Local A* pathfinding on Melbourne's OSM road network. No external API.

- **Data:** `melbourne_roads.json` — 3.6M nodes, 4M edges (footways, residential streets, paths)
- **Coverage:** Full Greater Melbourne bounding box (-38.5,144.4 to -37.4,145.8)
- **Speed:** 3-40ms per query
- **Fallback:** Straight line for walks outside coverage area or when nodes not found
- **Regeneration:** Download via OSM Overpass API with highway filter for walkable road types

### Known issues
- Short walks between very close stops sometimes return straight lines (same nearest node)
- Walk paths can visually cross building footprints (line drawn on top of map, not clipped)

---

## Search System

Three-tier search, prioritised:
1. **GTFS stops** (27k stations/tram/bus stops) — instant, local
2. **Address index** (772k Melbourne addresses from OSM via `addresses.tsv`) — instant, local
3. **Nominatim** (OpenStreetMap geocoder) — fallback, 3s timeout, only if <3 local results

### Address index
Built by `build-address-index.js` from OSM Overpass data. Server loads `addresses.tsv` (tab-separated: display name, lat, lng) into memory at startup (~126MB heap). Binary search + scan for fast queries.

---

## Vehicle System

- **On-demand:** Vehicles do NOT load at startup. Map starts clean.
- **Filter-triggered:** User opens filter panel, toggles a mode → triggers live feed
- **Rendering:** All vehicles are coloured dots (6-10px). SVG face markers exist in code but unused.
- **Refresh:** Every 15s while any mode is active. Stops when all modes off.
- **Payload:** ~400KB for ~2,000 vehicles per refresh.

---

## UI Architecture

### Sidebar (left panel, 380px)
- **From field** — defaults to "Your location" (GPS). Editable with same autocomplete.
  - Typing "my location" reverts to GPS. Custom origin gets green pin on map.
- **To field** — search input with 3-tier autocomplete
- **Route cards** — clickable cards showing mode icon, duration, summary, departure time
- **Journey timeline** — coloured vertical bar with dots at each stop
- **Let's Go button** — placeholder for navigation mode
- **Clear route** — resets everything
- **Mobile:** Collapses to bottom sheet at <600px

### Header
- Logo + live dot
- Mode badge (DEMO/LIVE)
- Ghost mode button (👻)
- **Map style dropdown** (🎨 Ghibli / 🎮 Pixel Art)
- **Iso view button** (🏙️)
- Auth area (Sign in / Avatar)
- Alerts button

### Map
- **Default:** Bird's eye view (pitch 0, bearing 0)
- **Iso mode:** pitch 55, bearing -20, smooth transition
- **Free rotation:** right-click drag or two-finger rotate
- **Style:** Switchable between Ghibli and Pixel Art
- **Route lines:** Dark border + coloured fill + white highlight. Walk lines are dotted purple.
- **POI click:** Click landmarks → info popup → Get Directions button

---

## Environment Variables

### Required
```
TRANSIT_API_KEY=<key>   # Transport Victoria Open Data — GTFS-R subscription required
JWT_SECRET=<random>     # CHANGE from default in production
```

### Optional
```
PORT=3000
EMAIL_USER=<gmail>      # For OTP emails (dev mode if blank)
EMAIL_PASS=<app-password>
```

---

## Running Locally

```bash
npm install
cp .env.example .env    # Set TRANSIT_API_KEY
# Place gtfs.zip in project root
# Place melbourne.pmtiles in public/
# melbourne_roads.json needed for walk paths — download via Overpass:
#   curl -d '[out:json][timeout:300];(way["highway"~"^(footway|pedestrian|path|steps|residential|tertiary|secondary|primary|trunk|living_street|service|track|unclassified|cycleway)$"](-38.5,144.4,-37.4,145.8););(._;>;);out body;' 'https://overpass-api.de/api/interpreter' -o melbourne_roads.json
node server.js
# Wait ~120s for GTFS + RAPTOR index + walk network + address index
# Open http://localhost:3000
```

---

## Git & Branches

- **master** — production-ready code, always deployable
- **feature/pixel-map** — pixel art theme development (merged to master 2026-04-02)
- Large files not in git: `gtfs.zip`, `melbourne_roads.json`, `public/melbourne.pmtiles`
- These files must be placed manually after cloning (see `.gitignore`)
- SSH key auth to GitHub (`git@github.com:MelbourneDev/transit-live.git`)

---

## For the Next Claude to Read

### What's been built (updated 2026-04-02)

**Core transport app:**
- Custom RAPTOR transit routing algorithm (no external routing API)
- A* walking path router on local OSM road network (full Greater Melbourne, 3.6M nodes)
- 772k Melbourne address search (local, instant)
- Google Maps-style sidebar with from/to fields and route comparison
- Journey timeline with board/alight instructions
- On-demand vehicle loading with coloured dots
- Multiple route options with mode variety

**Map themes (2026-04-02):**
- Pixel art theme with building textures (`fill-extrusion-pattern`), park/water patterns, Press Start 2P font
- Theme switcher dropdown in header
- Isometric view toggle + free rotation
- Custom PBF glyph generation pipeline for map fonts

**POI system (2026-04-02):**
- Click any landmark/attraction/station on map → info popup
- "Get Directions" button routes from user location to that POI
- Re-registers handlers on theme switch

### What needs doing next

**1. Navigation mode ("Let's Go")**
When user taps "Let's Go":
- Switch map to isometric view (pitch 45, bearing based on travel direction)
- Follow user's GPS in real-time with smooth animation
- Show their avatar moving along the route
- When they board a vehicle (estimated by proximity to stop + time), their avatar becomes the vehicle's icon
- This is the core differentiator — making transit feel alive and personal

**2. Add stops/waypoints to journeys**
User should be able to add intermediate stops ("via Flinders St"). This means:
- UI: draggable waypoint field between from/to in sidebar
- Backend: run RAPTOR twice (origin→waypoint, waypoint→destination) and stitch results

**3. Friends system**
- Add friends by username/email
- See friends' live positions on map (when they're on a journey)
- Privacy: only visible during active journeys, opt-in

**4. Contextual local ads**
- When user is on a journey, detect businesses near their route
- Ad spots already have an API (`/api/ad-spots`) and MarkerSystem ready to go
- Needs: business database, proximity matching, ad serving logic

**5. Speed optimisation**
- RAPTOR queries still 700ms-3.7s. Target: <200ms
- Pre-sort trip timetables per stop position
- Consider caching frequent route pairs

**6. More map themes**
- Cyberpunk, Anime, Vintage — each is a style JSON + optional sprite sheet
- The pixel art pixelation shader remains unsolved (see "Map Themes" section)
- Matt wants sellable/premium themes eventually

**7. Walk path improvements**
- Walk lines currently cross building footprints visually
- Could render walk path below building layer in MapLibre layer stack

**8. Search improvements**
- G-NAF (Australian government address database) would give every address in Melbourne
- Consider Photon geocoder (faster than Nominatim, same OSM data)

### Technical debt
- `app.js` is ~1950 lines — could extract journey UI, filters, vehicles into modules
- `navigation.js` and `markers.js` are built but not fully wired into the main app
- The Valhalla proxy at `/api/route` is still there but unused (walk routing is local now)
- Pixel art `sprite-preview.html` is a dev tool in `/public/` — should be moved or restricted

### Matt's working style
- Wants to be consulted on business logic, not surprised by decisions
- Prefers seeing options with trade-offs, then choosing
- Cares deeply about UX polish — will iterate on small details (line styles, padding, animations)
- Commits/pushes should happen frequently so he can track progress on GitHub
- Explain technical concepts plainly when asked
- If an animation or feature is buggy, remove it rather than ship it broken
- Doesn't want separate rendering systems per theme — one map engine, swappable styles
