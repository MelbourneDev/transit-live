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

---

## Stack

**Backend:** Node.js + Express (`server.js` ~1000 lines)
**GTFS Loader + RAPTOR:** `gtfs.js` (~720 lines) — custom transit routing algorithm
**Walk Router:** `walkrouter.js` (~200 lines) — A* pathfinding on OSM road network
**Frontend:** Single-page HTML/CSS/Vanilla JS
**Map:** MapLibre GL JS v4 + PMTiles v3 (open-source, no API token)
**Geocoding:** 665k local Melbourne addresses + 27k GTFS stops + Nominatim fallback
**Walk Paths:** Local A* on OSM road network (580k nodes, 674k edges)

---

## File Structure

```
transit-live-app/
├── server.js              # Express backend — GTFS-RT feeds, journey API, auth, Valhalla proxy
├── gtfs.js                # GTFS static data loader + RAPTOR journey planner
├── walkrouter.js           # A* walking path router using OSM road network
├── addresses.json          # 665k Melbourne addresses (built from OSM, loaded at startup)
├── melbourne_roads.json    # OSM walkable road network for inner Melbourne (84MB, not in git)
├── build-address-index.js  # Script to rebuild addresses.json from OSM Overpass data
├── build-dark-theme.js     # Script to generate dark map theme (experimental)
├── public/
│   ├── index.html         # App shell — sidebar, map, sheets, overlays
│   ├── js/
│   │   ├── app.js         # Frontend core (~1800 lines) — map, vehicles, journey UI, filters
│   │   ├── auth.js        # Auth system (~470 lines) — avatar SVG, OTP flow, profile
│   │   ├── markers.js     # MarkerSystem class — ad-spot markers (ES module, not yet wired)
│   │   └── navigation.js  # NavigationController — Valhalla routing + glow trail (ES module)
│   ├── css/style.css      # All styles
│   ├── styles/
│   │   ├── maplibre-style.json   # Current map theme (Ghibli pastels)
│   │   └── maplibre-dark.json    # Dark theme (experimental, has rendering issues)
│   └── data/ad-spots.json # Ad spot GeoJSON (served via /api/ad-spots)
├── gtfs.zip               # GTFS static data (Victoria, ~400k trips) — not in git
├── melbourne.pmtiles      # Vector tile archive for map — not in git
├── .env                   # API keys (gitignored)
└── package.json
```

---

## RAPTOR Journey Planner (`gtfs.js`)

Custom **RAPTOR algorithm** (Round-Based Public Transit Optimized Router).

### How it works
1. **Startup:** Loads GTFS zip (~60s), builds spatial grid, builds RAPTOR pattern index (~5s)
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

- **Data:** `melbourne_roads.json` — 580k nodes, 674k edges (footways, residential streets, paths)
- **Coverage:** Inner Melbourne bounding box (-37.9,144.8 to -37.7,145.1)
- **Speed:** 3-40ms per query
- **Fallback:** Straight line for walks outside coverage area or when nodes not found

### Known issues
- Short walks between very close stops sometimes return straight lines (same nearest node)
- Walk paths can visually cross building footprints (line drawn on top of map, not clipped)
- Road network is from a single Overpass download — could be expanded for wider coverage

---

## Search System

Three-tier search, prioritised:
1. **GTFS stops** (27k stations/tram/bus stops) — instant, local
2. **Address index** (665k Melbourne addresses from OSM) — instant, local
3. **Nominatim** (OpenStreetMap geocoder) — fallback, 3s timeout, only if <3 local results

### Address index
Built by `build-address-index.js` from OSM Overpass data. Compact format: `[displayName, lat, lng]`. 27MB loaded into memory at startup. Covers 410 suburbs.

Not as complete as G-NAF (Australian government address database) — could upgrade later.

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
- **Journey timeline** — coloured vertical bar with dots at each stop:
  - Walk legs: dashed grey bar, walking emoji
  - Board legs: solid coloured bar, "Board [line] at [stop]"
  - Alight legs: no bar, compact, "Get off at [stop]"
  - Destination: red dot at bottom
- **Let's Go button** — placeholder for navigation mode
- **Clear route** — resets everything
- **Mobile:** Collapses to bottom sheet at <600px

### Map
- **Default:** Bird's eye view (pitch 0, bearing 0)
- **Style:** Ghibli pastels (`maplibre-style.json`)
- **Route lines:** Dark border + coloured fill + white highlight. Walk lines are dotted purple.
- **GTFS route shapes:** Hidden by default, show only when transport filter active
- **Station dots:** Removed from map (were cluttering)

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
VALHALLA_URL=<url>      # Custom Valhalla instance (default: public OSM)
```

---

## Running Locally

```bash
npm install
cp .env.example .env    # Set TRANSIT_API_KEY
# Place gtfs.zip and melbourne.pmtiles in project root
# melbourne_roads.json needed for walk paths (download via Overpass or skip)
node server.js
# Wait ~75s for GTFS + RAPTOR index + walk network + address index
# Open http://localhost:3000
```

---

## For the Next Claude to Read

### What's been built (2026-03-27)
In one session we went from a buggy prototype with hardcoded data to:
- Custom RAPTOR transit routing algorithm (no external routing API)
- A* walking path router on local OSM road network
- 665k Melbourne address search (local, instant)
- Google Maps-style sidebar with from/to fields and route comparison
- Journey timeline with board/alight instructions
- On-demand vehicle loading with coloured dots
- Multiple route options with mode variety

### What needs doing next

**1. Add stops/waypoints to journeys**
User should be able to add intermediate stops ("via Flinders St"). This means:
- UI: draggable waypoint field between from/to in sidebar
- Backend: run RAPTOR twice (origin→waypoint, waypoint→destination) and stitch results
- Not hard architecturally, but needs clean UX for adding/removing/reordering stops

**2. Navigation mode ("Let's Go")**
When user taps "Let's Go":
- Switch map to isometric view (pitch 45, bearing based on travel direction)
- Follow user's GPS in real-time with smooth animation
- Show their avatar moving along the route
- When they board a vehicle (estimated by proximity to stop + time), their avatar becomes the vehicle's icon
- The vehicle dot becomes their avatar head for that journey (visible to friends only)
- This is the core differentiator — making transit feel alive and personal

**3. Friends system**
- Add friends by username/email
- See friends' live positions on map (when they're on a journey)
- "Your friend Alex is on the 96 tram heading to Federation Square"
- Privacy: only visible during active journeys, opt-in

**4. Contextual local ads**
The monetisation play:
- When user is on a journey, detect businesses near their route
- "Pellegrini's on Bourke St is having a lunch special — you pass it in 3 stops"
- Even better with friends: "You and Sarah are both near Lygon St — here's a dinner deal"
- Ad spots already have an API (`/api/ad-spots`) and MarkerSystem ready to go
- Needs: business database, proximity matching, ad serving logic

**5. Speed optimisation**
- RAPTOR queries still 700ms-3.7s. Target: <200ms
- Pre-sort trip timetables per stop position (currently binary search is on first-stop departure)
- Consider caching frequent route pairs
- Walk router could pre-compute paths for common stop-to-stop walks

**6. Map themes**
- Dark theme attempted but broke (style JSON colour transformation too crude)
- Need per-layer colour mapping, not bulk find-replace
- Matt wants sellable themes: Pokemon, Anime, Cyberpunk, Vintage
- MapLibre style spec supports full customisation — just needs careful design work
- Each theme is a JSON file, user switches via setting

**7. Walk path improvements**
- Walk lines currently cross building footprints visually
- Could render walk path below building layer in MapLibre layer stack
- Expand OSM road coverage beyond inner Melbourne (download larger bounding box)
- Consider self-hosted Valhalla for accurate walking directions (Docker, ~2GB RAM)

**8. Search improvements**
- G-NAF (Australian government address database) would give every address in Melbourne
- Current OSM-based index has ~665k but misses some newer addresses
- Consider Photon geocoder (faster than Nominatim, same OSM data)

### Technical debt
- `app.js` is still 1800 lines — could extract journey UI, filters, vehicles into modules
- `navigation.js` and `markers.js` are built but not fully wired into the main app
- The Valhalla proxy at `/api/route` is still there but unused (walk routing is local now)
- Some CSS is messy from rapid iteration — needs a cleanup pass

### Matt's working style
- Wants to be consulted on business logic, not surprised by decisions
- Prefers seeing options with trade-offs, then choosing
- Cares deeply about UX polish — will iterate on small details (line styles, padding, animations)
- Commits/pushes should happen frequently so he can track progress on GitHub
- Explain technical concepts plainly when asked
- If an animation or feature is buggy, remove it rather than ship it broken
