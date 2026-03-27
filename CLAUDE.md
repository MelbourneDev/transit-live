# Transit-Live Melbourne — Project Reference

## Vision

**Google Maps for Melbourne** — a real-time transit tracker and journey planner with aesthetic maps, pro-Melbourne news/events/localised ads woven throughout. Web app first, native apps later once it gains traction.

**USP:** Beautiful map aesthetics + Melbourne-local content. The mapping and routing must be rock-solid before adding extras.

## Principles — How to Work on This Project

1. **Everything API-driven** — never hardcode routes, stops, addresses, or data that should be dynamic. Only truly static reference data (SVG templates, UI palettes, GTFS-RT enum codes) is acceptable inline.
2. **No amateur design** — this is a hobby project but it needs to feel professional. Buggy or slow = no users.
3. **Speed matters** — 12 seconds for a route is unacceptable. Sub-second is the target. Use proper algorithms (RAPTOR), not brute force.
4. **Don't over-engineer** — fix the problem in front of you. Don't add abstractions for hypothetical futures.
5. **Ask before assuming** — when business logic is unclear, present options to the product owner (Matt) and let him decide.
6. **Commit often, push always** — small commits with clear messages. Push to GitHub after every logical change.

---

## Stack

**Backend:** Node.js + Express (`server.js` ~980 lines)
**Frontend:** Single-page HTML/CSS/Vanilla JS
**Map:** MapLibre GL JS v4 + PMTiles v3 (open-source, no API token needed)
**Routing:** Custom RAPTOR algorithm in `gtfs.js` (~720 lines)
**Walk paths:** Valhalla via public OSM instance (proxied through `/api/route`)
**Geocoding:** Nominatim (OpenStreetMap) via `/api/journey/autocomplete`

---

## Map — MapLibre GL JS v4

- **CDN:** `https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js`
- **PMTiles:** `https://unpkg.com/pmtiles@3/dist/pmtiles.js`
- **Style:** `/styles/maplibre-style.json` (Ghibli-inspired pastel earth tones)
- **Default view:** Bird's eye (pitch 0, bearing 0), center Melbourne CBD `[144.9631, -37.8136]`, zoom 13
- **Isometric view:** Reserved for navigation mode — when user clicks "Let's Go", camera tilts to pitch 45 and follows GPS
- **No Mapbox anywhere** — fully removed (tokens, injection, references). MapLibre uses `.mapboxgl-*` CSS classes for backwards compat but that's just class names.

---

## File Structure

```
transit-live-app/
├── server.js              # Express backend — GTFS-RT feeds, journey API, auth, karma, Valhalla proxy
├── gtfs.js                # GTFS static data loader + RAPTOR journey planner
├── public/
│   ├── index.html         # App shell — all HTML, sheets, overlays
│   ├── js/
│   │   ├── app.js         # Frontend core (~1800 lines) — map, vehicles, journey UI, filters
│   │   ├── auth.js        # Auth system (~470 lines) — avatar SVG, OTP flow, profile, nudge
│   │   ├── markers.js     # MarkerSystem class — ad-spot markers (ES module)
│   │   └── navigation.js  # NavigationController — Valhalla routing + glow trail (ES module)
│   ├── css/style.css      # All styles
│   ├── styles/maplibre-style.json  # Map tile styling
│   └── data/ad-spots.json # Ad spot GeoJSON (served via /api/ad-spots)
├── gtfs.zip               # GTFS static data (Victoria, ~400k trips) — not in git
├── melbourne.pmtiles      # Vector tile archive for map — not in git
├── .env                   # API keys (gitignored)
├── .env.example           # Key template
├── inspectors.json        # Runtime — Myki inspector reports (auto-created)
├── users.json             # Runtime — authenticated user accounts (auto-created)
└── package.json
```

---

## RAPTOR Journey Planner (`gtfs.js`)

The journey planner uses the **RAPTOR algorithm** (Round-Based Public Transit Optimized Router) — the same algorithm family used by Google Maps and Citymapper.

### How it works

1. **Startup:** Loads GTFS zip (~60s), builds spatial grid index for stops, then builds RAPTOR pattern index (~5s)
2. **Pattern index:** Groups 423k trips into ~3,300 route patterns (unique stop sequences). Each pattern has a sorted timetable.
3. **Query (3 rounds):**
   - Round 1: Direct routes — board at nearby stops, ride to destination stops
   - Round 2: 1-transfer routes — ride + walk to nearby stop + ride again
   - Round 3: 2-transfer routes
4. **Binary search** finds the earliest departing trip at each stop — no brute-force scanning
5. **Walking transfers** use grid-accelerated proximity search (400m radius)
6. **Results:** Up to 5 Pareto-optimal routes with mode variety (prefers train > tram > bus)

### Performance

- Query time: 700ms–3.7s depending on distance (vs 1.8–5.3s old brute-force planner)
- Pattern index build: ~5s one-time at startup
- Still slower than ideal (<100ms) — further optimisation possible by pre-sorting timetables per stop position

### Key functions

- `buildRaptorIndex()` — builds pattern + stopPatterns indexes (called once after GTFS load)
- `planJourney(fromLat, fromLng, toLat, toLng, fromName, toName)` — main query, returns journey array
- `nearestStops(lat, lng, n, maxKm)` — grid-accelerated stop lookup
- `loadShape(shapeId, mode)` — lazy shape geometry loader (cached)
- `clipShape(shape, fromStop, toStop)` — clips route geometry to a segment

### Route data flow

GTFS-RT `route_id` (e.g. `vic-15-BEL`) → normalised code (`BEL`) → looked up in `gtfsRouteLookup` Map → returns `{name, color, mode}` from GTFS `routes.txt`. No hardcoded line names or colors.

---

## Vehicle System

### Loading
- **On-demand:** Vehicles do NOT load at startup. Map starts clean.
- **Filter-triggered:** User opens filter panel, toggles a mode (train/tram/bus/vline) → triggers live feed
- **Auto-refresh:** Every 15s while any mode is active. Stops when all modes toggled off.
- **Payload:** ~400KB for ~2,000 vehicles. Acceptable bandwidth.

### Rendering
- **All vehicles render as colored dots** — 6-10px circles based on zoom level
- **Color:** From GTFS route_color, falling back to mode color (train blue, tram green, bus orange, vline purple)
- **Delayed vehicles:** Red dot instead of mode color
- **SVG face markers:** Exist in code (`makeFaceSVG`) but currently unused — reserved for future "follow vehicle" mode where user's avatar rides the vehicle

### Animation
- Smooth GPS interpolation between 15s updates
- Follow mode: `map.panTo` on every animation frame
- Route path snapping when journey is active

---

## Journey UI Flow

1. User types in search bar → debounced Nominatim geocode via `/api/journey/autocomplete`
2. User picks suggestion → destination pin placed, bottom sheet shows "Loading..."
3. If user location available: `POST /api/journey` with origin + destination
4. Server runs RAPTOR → enriches walk legs with Valhalla geometry → returns journey array
5. Frontend draws route polyline (colored segments per leg), shows bottom sheet with:
   - Route option tabs (if multiple routes returned)
   - Summary: mode emoji, duration, route name, departure time
   - Step-by-step legs with walk/transit breakdown
6. "Let's Go" button — placeholder for navigation mode (future: switch to isometric view + GPS follow)

### Walk paths
- Valhalla pedestrian routing via `/api/route` proxy (public OSM instance, 3s timeout)
- Returns real road geometry so walking segments follow actual paths, not straight lines

---

## Environment Variables

### Required
```
TRANSIT_API_KEY=<key>   # Transport Victoria Open Data — GTFS-R subscription required
JWT_SECRET=<random>     # CHANGE from default in production
PORT=3000               # Optional, defaults to 3000
```

### Optional — Email Auth
```
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```
Without these, OTP codes appear in console (dev mode).

### Optional
```
PTV_DEV_ID=<id>         # PTV Timetable API (unused now — RAPTOR replaced PTV routing)
PTV_API_KEY=<key>
VALHALLA_URL=<url>      # Custom Valhalla instance (defaults to valhalla1.openstreetmap.de)
```

---

## Backend API Endpoints

### Vehicles & Map
| Route | Method | Description |
|-------|--------|-------------|
| `/api/vehicles` | GET | Live vehicles, all 4 modes. Route names/colors from GTFS lookup. |
| `/api/alerts` | GET | GTFS-RT service alerts. Cached 60s. |
| `/api/gtfs/shapes` | GET | Route polylines (train + tram) from GTFS shapes.txt |
| `/api/gtfs/stations` | GET | Train stations with lat/lng from GTFS stops.txt |
| `/api/ad-spots` | GET | Ad/marketing spots from `public/data/ad-spots.json` |
| `/api/stops/nearby` | GET | `?lat=&lng=` — real GTFS stops within 1km via `gtfs.nearestStops()` |
| `/api/health` | GET | Server status, key presence, cache age |

### Journey Planning
| Route | Method | Description |
|-------|--------|-------------|
| `/api/journey` | POST | RAPTOR planner. Body: `{fromLat, fromLng, toLat, toLng}`. Returns up to 5 routes with walk paths. |
| `/api/journey/autocomplete` | GET | `?q=...` Nominatim geocode, scoped to Melbourne VIC |
| `/api/departures` | GET | `?stopName=...` — PTV departures or cached vehicle fallback |
| `/api/route` | POST | Valhalla routing proxy (pedestrian/bicycle/auto) |

### Community & Auth
| Route | Method | Description |
|-------|--------|-------------|
| `/api/inspectors` | GET/POST | Myki inspector reports (2hr expiry, still/gone voting) |
| `/api/inspectors/:id/vote` | POST | Vote on report |
| `/api/leaderboard` | GET | Top 10 users by karma |
| `/auth/send-otp` | POST | Send 6-digit OTP to email |
| `/auth/verify-otp` | POST | Verify OTP, return JWT (30 day expiry) |
| `/auth/me` | GET | Current user profile (Bearer JWT) |
| `/auth/dev-login` | GET | Dev-only instant login (only works with default JWT_SECRET) |

---

## Frontend Modules

### `app.js` — Core (~1800 lines)
Map init, vehicle markers, interpolation/animation, filters, journey UI, search, sheets, status bar, onboarding. All functions on global scope for HTML onclick interop.

### `auth.js` — Auth System (~470 lines)
Avatar SVG renderer (`renderAvatarSVG`), OTP email flow, JWT token management, profile sheet, avatar creator (first-run onboarding + in-sheet editor), auth nudge. Exposes functions on `window.*`. `currentUser` exposed as getter/setter property.

### `markers.js` — Ad Spot Markers (ES module)
`MarkerSystem` class with Zelda shrine + Animal Crossing leaf SVG styles. Loads GeoJSON from `/api/ad-spots`. Not yet wired into app.js.

### `navigation.js` — Valhalla Navigation (ES module)
`NavigationController` with 4-layer glow trail (outer blur, mid glow, gradient core, animated dashes). Imported in index.html, wired to `bindJourneySheet()`. Ready for "Let's Go" navigation mode.

---

## Known Issues & Next Steps

### Speed
- RAPTOR queries take 700ms–3.7s — good but not great. Further optimisation: pre-sort timetables per stop position, limit search depth for short trips.
- Valhalla walk enrichment adds 1–3s — could cache common walk paths or use a closer Valhalla instance.
- GTFS load takes ~60s at startup — acceptable for server but blocks journey planning until complete.

### Search
- Nominatim is slow (1–2s per query) and returns no place categories
- Consider: Photon geocoder, or local-first hybrid (cache top 500 Melbourne locations for instant results)

### Routing
- No walking-only or cycling-only routes yet — Valhalla supports these via NavigationController
- Route lines are flat colored segments — NavigationController has gorgeous glow trails ready to swap in
- No "From" field in search — defaults to geolocation only

### UI
- Bottom sheet journey card could be cleaner — leg display has some redundant info
- "Let's Go" button is a placeholder — should trigger isometric view + GPS follow mode
- Route line aesthetics: switch from flat lines to NavigationController's 4-layer glow trail

### Future Features (not for now)
- User avatar rides on vehicle during follow mode (head bobbing on tram)
- Pro-Melbourne news/events/ads feed
- PWA manifest for "Add to Home Screen"
- Real-time departures board per stop

---

## Running Locally

```bash
npm install
cp .env.example .env
# Edit .env — set TRANSIT_API_KEY
# Place gtfs.zip in project root (from data.vic.gov.au GTFS bundle)
# Place melbourne.pmtiles in project root
node server.js
# Wait ~70s for GTFS + RAPTOR index to build
# Open http://localhost:3000
```

**Dev auth tip:** Leave `EMAIL_USER`/`EMAIL_PASS` blank. OTP codes appear in console and API response as `dev_code`.
