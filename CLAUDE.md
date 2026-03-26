# Transit-Live Melbourne — Project Reference

## What This Project Does

Real-time public transport tracker for Melbourne, Australia. Shows live GPS positions and delay information for Metro Trains, Yarra Trams, Metro Buses, and V/Line regional coaches on an interactive 3D isometric map. Data refreshes every 15 seconds via Transport Victoria's GTFS-Realtime feed.

**Stack:** Node.js + Express backend, single-page HTML/CSS/Vanilla JS frontend with **Mapbox GL JS v3.3.0** (NOT Leaflet — fully migrated).

---

## Map Library — Mapbox GL JS (NOT Leaflet)

The project was migrated from Leaflet to **Mapbox GL JS v3.3.0**. There is no Leaflet anywhere in the codebase.

- **CDN:** `https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js`
- **Custom style:** `mapbox://styles/matt-walton/cmn73f7qw003k01r972eddm5i`
- **Palette enforced on load:** Land `#A8E6CF` (Mint Green), Water `#4DD0E1` (Turquoise), Buildings `#FFF9E1` (Cream)
- **Search:** Mapbox Search JS v1.5.0 (`<mapbox-search-box>` web component, AU/Melbourne bias)
- **Initial view:** Center `[144.9631, -37.8136]`, zoom 13, pitch 45, bearing -15, antialias true

### Mapbox Token

The Mapbox token is stored as `MAPBOX_TOKEN` in `.env` and injected into `index.html` at request time by the Express server (via `__MAPBOX_TOKEN__` placeholder substitution). It is **never committed to source**. `app.js` reads it from `window.MAPBOX_TOKEN` which is set by the injected inline script.

### Key Mapbox API patterns in the code

- Coordinates are always `[lng, lat]` order (GeoJSON standard) — never `[lat, lng]`
- Vehicle markers: `new mapboxgl.Marker({element:el, anchor:'center'}).setLngLat([lng,lat]).addTo(map)`
- Marker visibility tracked via `markersOnMap = new Set()` (no Leaflet `map.hasLayer`)
- Route lines are GeoJSON sources/layers added after `map.once('load', ...)`
- Journey route drawn as `'journey-route'` GeoJSON layer; dashed placeholder is `'journey-placeholder'`
- `mapReady()` helper returns a Promise that resolves when `map.loaded()` is true
- `map.fitBounds(new mapboxgl.LngLatBounds(...), {padding, maxZoom})`
- `map.flyTo({center:[lng,lat], zoom, duration, essential:true})`
- `map.panTo([lng,lat], {duration:0})` for follow mode

---

## File Structure

```
transit-live-app/
├── server.js              # Express backend (~1260 lines) — GTFS-RT, journey, auth, karma
├── public/
│   ├── index.html         # App shell (~420 lines) — all HTML, sheets, overlays
│   ├── js/
│   │   └── app.js         # All frontend logic (~2200+ lines) — map, markers, journey, auth UI
│   └── css/
│       └── style.css      # All styles (~700+ lines)
├── .env                   # API keys (gitignored)
├── .env.example           # Key template
├── inspectors.json        # Runtime — Myki inspector reports (auto-created, gitignored)
├── users.json             # Runtime — authenticated user accounts (auto-created, gitignored)
├── package.json
├── railway.json           # Railway.app deployment config
└── render.yaml            # Render.com deployment config
```

---

## Environment Variables

### Required

```
TRANSIT_API_KEY=<key>   # Transport Victoria Open Data — opendata.transport.vic.gov.au
                        # Account must have GTFS-R product subscription
MAPBOX_TOKEN=pk.<...>   # Mapbox public access token — injected into index.html at request time
JWT_SECRET=<random>     # Secret for signing JWTs — CHANGE from default in production
PORT=3000               # Optional, defaults to 3000
```

### Optional — Email Auth

```
EMAIL_USER=your_gmail@gmail.com     # Gmail address for sending OTP codes
EMAIL_PASS=your_gmail_app_password  # Gmail App Password (not your real password)
```

Without `EMAIL_USER`/`EMAIL_PASS`, the server runs in **dev mode**: OTP codes are returned directly in the API response body and logged to console. Auth still works end-to-end, just without real email delivery.

### Optional — Live Journey Planning

```
PTV_DEV_ID=<id>     # PTV Timetable API developer ID
PTV_API_KEY=<key>   # PTV Timetable API key
```

Without PTV keys, journey planning falls back to 35 hardcoded Melbourne routes with rough time estimates.

**Get GTFS-RT key:** opendata.transport.vic.gov.au (free, request GTFS-R product subscription)

**Get PTV keys:** ptv.vic.gov.au/footer/data-and-reporting/datasets/ptv-timetable-api/

---

## npm Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | HTTP server |
| `cors` | ^2.8.5 | CORS middleware |
| `dotenv` | ^17.3.1 | `.env` file loading |
| `node-fetch` | ^2.7.0 | HTTP client for GTFS-RT and PTV API calls |
| `protobufjs` | ^7.2.5 | GTFS-RT binary protobuf decoding (schema inlined in server.js) |
| `nodemailer` | ^8.0.3 | OTP email delivery via Gmail |
| `jsonwebtoken` | ^9.0.3 | JWT creation and verification for auth sessions |
| `bcryptjs` | ^3.0.3 | Listed but currently unused |

---

## Transport Victoria GTFS-RT Feeds

**Base URL:** `https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/`

| Mode | Vehicle Positions | Trip Updates |
|------|------------------|--------------|
| Train | `metro/vehicle-positions` | `metro/trip-updates` |
| Tram | `tram/vehicle-positions` | `tram/trip-updates` |
| Bus | `bus/vehicle-positions` | `bus/trip-updates` |
| V/Line | `regional-coach/vehicle-positions` | `regional-coach/trip-updates` |
| Alerts | `service-alerts` | — |

**Auth header:** `KeyID: <TRANSIT_API_KEY>` (note: old docs say `Ocp-Apim-Subscription-Key` — the actual header is `KeyID`)

Responses are binary protobuf (GTFS-RT format), decoded with `protobufjs` using an inline proto schema in server.js. Vehicle data is cached 14s, alerts cached 60s.

### PTV Timetable API (journey planning)

**Base:** `https://timetableapi.ptv.vic.gov.au/`

Auth: HMAC-SHA1 signature appended to every request URL — implemented in `ptvSignUrl()` in server.js.

Endpoints used by `/api/journey`:
- `GET /v3/stops/location/{lat},{lng}?route_types=0,1,2,3&max_results=10&max_distance=1000` — find stops near a coordinate
- `GET /v3/departures/route_type/{type}/stop/{id}?max_results=12&expand=run,route` — upcoming departures
- `GET /v3/patterns/run/{run_ref}/route_type/{type}?expand=stop` — full stop sequence for a run (gives real GPS waypoints for the route path)

---

## Backend API Endpoints (server.js)

### Vehicle & Map Data

| Route | Method | Description |
|-------|--------|-------------|
| `/api/vehicles` | GET | Live vehicles for all 4 modes. Returns `[{id, mode, line, label, lat, lng, bearing, speed, color, delay, occupancy}]`. 502 if all metro feeds fail. |
| `/api/alerts` | GET | GTFS-RT service alerts. Cached 60s. Returns `[{id, header, desc, routes[], effect}]` |
| `/api/health` | GET | Returns `{status, keySet, ptvKeys, cacheAge, cached}` |
| `/api/debug` | GET | Protobuf diagnostics for train feed — useful for debugging API key issues |

### Journey Planning

| Route | Method | Description |
|-------|--------|-------------|
| `/api/journey` | POST | Body: `{fromLat, fromLng, toLat, toLng, fromName?, toName?}` or legacy `{from, to}` names. With PTV: resolves real stop IDs → departures → run pattern → returns `routePath` (real stop-sequence GPS coords). Without PTV: uses hardcoded fallback. Returns `{mode:'live'|'fallback', from, to, journeys:[{duration, legs:[...]}]}` |
| `/api/journey/autocomplete` | GET | `?q=...` fuzzy search over 150+ hardcoded Melbourne locations |
| `/api/stops/nearby` | GET | `?lat=&lng=` — stops within 1km from hardcoded list |
| `/api/departures` | GET | `?stopName=...` — live departures via PTV, or nearby vehicles from cache as fallback |

### Community Reports

| Route | Method | Description |
|-------|--------|-------------|
| `/api/inspectors` | GET | Active reports (last 90 min, fewer than 3 "gone" votes) |
| `/api/inspectors` | POST | Submit report. Body: `{transport, route, location, stop, lat?, lng?, userId?}`. Awards 5 karma. |
| `/api/inspectors/:id/vote` | POST | Body: `{userId, vote:'still'|'gone'}`. "still" = +2 karma voter +3 reporter. "gone" = +1. 3 gone votes expires report. |
| `/api/leaderboard` | GET | Top 10 users by karma |
| `/api/user/:userId` | GET | Get or auto-create user profile by anonymous UUID |

### Auth (Email OTP → JWT)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /auth/send-otp` | POST | — | Body: `{email}`. Sends 6-digit code via Gmail. Dev mode returns `{dev_code}` directly. |
| `POST /auth/verify-otp` | POST | — | Body: `{email, code}`. Returns `{ok, token, user}`. JWT expires in 30 days. |
| `GET /auth/me` | GET | Bearer JWT | Returns current user profile |
| `POST /auth/update-avatar` | POST | Bearer JWT | Body: `{avatar:{...}}`. Saves avatar config. |
| `POST /auth/logout` | POST | — | Client deletes token. Server acks. |
| `GET /auth/dev-login` | GET | — | **Dev only** — instant login as `dev@localhost` (999 karma). Blocked if `JWT_SECRET` is not the default value. |

---

## Features Built

### Backend
- GTFS-RT protobuf parsing for all 4 transport modes (inline schema, no `.proto` file needed)
- Delay extraction from trip updates matched by `trip_id`
- Route ID normalisation (`vic-15-BEL` → `Belgrave`)
- Geographic bounding box filter for Victoria
- PTV journey planning: `/v3/stops/location` → departures → `/v3/patterns/run` → real stop-sequence `routePath` array
- Smart from-stop sorting (prefers train stops for trips >3km)
- Fallback journey planning with `clipRoutePath()` for segment extraction from hardcoded waypoints
- 150+ hardcoded Melbourne locations (stations, suburbs, tram stops, universities)
- Myki inspector alert system with 2-hour expiry, "still/gone" voting, stored in `inspectors.json`
- Karma system: report (+5), confirm (+2 voter / +3 reporter), mark-gone (+1)
- Email OTP auth flow with 10-minute code expiry
- JWT sessions (30 days), stored in `users.json`
- Auto-generated transit-themed usernames (e.g. `TramRanger42`)
- Haversine distance calculations

### Frontend
- **Mapbox GL JS v3.3.0** — 3D isometric view, pitch 45°, bearing -15°, custom style
- `applyMapPalette()` runs on map load — iterates all style layers and enforces Mint/Turquoise/Cream via `setPaintProperty`
- **Mapbox Search Box v1.5.0** — `<mapbox-search-box>` web component replaces custom search input; configured with AU country and Melbourne proximity; `retrieve` event triggers journey flow
- Color-coded markers: Trains `#094c8d`, Trams `#f5a800`, Buses `#7b5ea7`, V/Line `#6c3483`
- Custom face SVG markers per mode — expressions, route number labels, delay-red coloring
- **Game-like marker animations:** `vm-bob` applies physics-based `drop-shadow` filter (tight at ground, spread when airborne); `vm-shadow` ground-shadow ellipse animates inversely to the bob; elastic spring hover jump
- Smooth GPS interpolation between 15s updates — linear animation in the render loop
- Route path animation: vehicles snap to PTV stop-sequence coordinates when a journey is active
- Journey flow: Mapbox Search → destination pin (`mapboxgl.Marker`) → dashed placeholder GeoJSON line → fetch `/api/journey` → real polyline GeoJSON (`'journey-route'` layer) → `map.fitBounds`
- Journey Bottom Sheet (`#journey-bottom-sheet`) slides up from bottom — duration, departs, walk time, next stop, report button
- Fuzzy vehicle matching in journey mode: exact `run_ref` → line name → 500m proximity → bearing fallback
- Follow mode — `map.panTo` on every animation frame tick
- Filter panel — toggle by mode, filter by route name
- Vehicle detail sheet — route, delay, occupancy bar, follow button
- Service alerts sheet
- Myki inspector markers with `mapboxgl.Popup` vote UI
- Demo mode — animated fake vehicles on all 4 modes if live API unavailable
- Email OTP sign-in UI — 6-digit code input with auto-focus, stored JWT
- Avatar creator — SVG face with skin/hair/eyes/mouth/accessory/outfit swatches
- Avatar shown in header and as location pin on map when signed in
- Karma display, leaderboard sheet
- 3-step onboarding carousel (stored in localStorage)
- Ghost mode toggle (cosmetic)
- Toast notifications, mobile safe-area support, status bar countdown

---

## Running Locally

```bash
cd transit-live-app
npm install
cp .env.example .env
# Edit .env and set TRANSIT_API_KEY
node server.js
# Open http://localhost:3000
```

**Dev mode tip:** Leave `EMAIL_USER` and `EMAIL_PASS` blank. The OTP code will appear in the server console output and in the API response as `dev_code`. You can also hit `GET /auth/dev-login` for instant sign-in with 999 karma.

## Deployment

- **Railway:** Push to repo, set `TRANSIT_API_KEY` and `JWT_SECRET` env vars in dashboard
- **Render:** Uses `render.yaml`, set env vars in Render dashboard
- Both platforms auto-start with `node server.js`

---

## Known Issues

### Security
- **No input sanitisation** on `POST /api/inspectors` `location` field — XSS risk if rendered as HTML
- **No rate limiting** on any endpoints — `/auth/send-otp` and `/api/inspectors` are especially vulnerable
- **`/auth/dev-login`** gives instant access if `JWT_SECRET` is still the default value — remove or guard in production

### Data / Reliability
- **`inspectors.json` and `users.json` are file-based** — data lost on server restart/redeployment; not suitable for multi-instance hosting
- **Hardcoded route waypoints** (35 routes, 3–6 points each) are very sparse — not actual road/rail geometry
- **PTV `run_ref` ↔ GTFS-RT `trip_id`** may not match directly — vehicle linking in journey mode falls back to proximity/bearing
- **Out-of-bounds vehicles** logged as warnings (can be noisy in production)

### API Error States
- All metro feeds failing → 502 returned
- V/Line failures silently degrade (vehicles just absent)
- PTV keys missing → falls back to hardcoded routes silently
- `MessageBlocked` error (HTTP 200, blocked body) → API key exists but lacks GTFS-R subscription
- PTV returns stops but 0 journeys → logs warning, falls back (common for unusual cross-suburb routes)

### Minor
- `bcryptjs` is in `package.json` but is not used anywhere
- `#journey-bar` and `#journey-cards` HTML is present (`display:none`) — kept for compatibility, superseded by `#journey-bottom-sheet`
- Occupancy status > 6 defaults to 50% display (undefined in GTFS-RT spec)
- Leaderboard returns top 10 only, no pagination
