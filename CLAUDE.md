# Transit-Live Melbourne — Project Reference

## What This Project Does

Real-time public transport tracker for Melbourne, Australia. Shows live GPS positions and delay information for Metro Trains, Yarra Trams, Metro Buses, and V/Line regional coaches on an interactive map. Data refreshes every 15 seconds via Transport Victoria's GTFS-Realtime feed.

**Stack:** Node.js + Express backend, single-page HTML/CSS/Vanilla JS frontend with Leaflet.js maps.

---

## File Structure

```
transit-live-app/
├── server.js          # Express backend (~975 lines) — all API routes, GTFS-RT parsing, caching
├── public/
│   └── index.html     # Entire frontend (~1500+ lines) — map, UI, polling logic
├── .env               # API keys (gitignored)
├── .env.example       # Key template
├── inspectors.json    # Runtime file — Myki inspector reports (auto-created, gitignored)
├── package.json       # Dependencies: express, cors, node-fetch, protobufjs
├── railway.json       # Railway.app deployment config
└── render.yaml        # Render.com deployment config
```

---

## API Keys & Environment Variables

### Required

```
TRANSIT_API_KEY=<key>   # Transport Victoria Open Data — opendata.transport.vic.gov.au
PORT=3000               # Optional, defaults to 3000
```

### Optional (enables live journey planning)

```
PTV_DEV_ID=<id>         # PTV Timetable API developer ID
PTV_API_KEY=<key>       # PTV Timetable API key
```

Without PTV keys, journey planning falls back to 35 hardcoded Melbourne routes.

**Get keys at:** https://opendata.transport.vic.gov.au (free account, request GTFS-R product subscription)

---

## Transport Victoria GTFS-RT Endpoints

**Base URL:** `https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/`

| Mode | Vehicle Positions | Trip Updates |
|------|-------------------|--------------|
| Train | `metro/vehicle-positions` | `metro/trip-updates` |
| Tram | `tram/vehicle-positions` | `tram/trip-updates` |
| Bus | `bus/vehicle-positions` | `bus/trip-updates` |
| V/Line | `regional-coach/vehicle-positions` | `regional-coach/trip-updates` |
| Alerts | `service-alerts` | — |

Responses are protobuf binary (GTFS-RT format), decoded with `protobufjs`.

**Auth:** `Ocp-Apim-Subscription-Key: <TRANSIT_API_KEY>` header.

### PTV Timetable API (optional)

**Base:** `https://timetableapi.ptv.vic.gov.au/`

- `GET /v3/search/{location}?route_types=0,1,2` — Stop/station search
- `GET /v3/departures/route_type/{type}/stop/{id}` — Departures from stop

Auth: HMAC-SHA1 signature appended to URL (implemented in server.js `ptvRequest()`).

---

## Backend API Endpoints (`server.js`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/vehicles` | GET | Live vehicle positions, delays, GPS, bearing, speed |
| `/api/alerts` | GET | Service alerts from GTFS-RT |
| `/api/health` | GET | API key status, cache age, vehicle count |
| `/api/debug` | GET | Protobuf download diagnostics for train feed |
| `/api/journey` | POST | Journey planner `{from, to, time}` |
| `/api/journey/autocomplete` | GET | Location autocomplete `?q=...` |
| `/api/stops/nearby` | GET | Nearby stops by GPS `?lat=&lng=` |
| `/api/departures` | GET | Stop departures `?stopName=...` |
| `/api/inspectors` | GET | Active Myki inspector reports |
| `/api/inspectors` | POST | Submit inspector report |
| `/api/inspectors/:id/vote` | POST | Vote on report `{vote: "still"\|"gone"}` |
| `/api/leaderboard` | GET | Top 10 users by karma |
| `/api/user/:userId` | GET | Get/create user profile |

**Caching:** Vehicle data cached 14s, alerts cached 60s.

---

## Features Built

### Backend
- GTFS-RT protobuf parsing for all 4 transport modes
- Delay extraction from trip updates (matched by vehicle/trip ID)
- Route ID normalization (e.g., `vic-15-BEL` → `Belgrave`)
- Geographic boundary filter (Melbourne region only)
- Myki inspector report system with 2-hour expiry, stored in `inspectors.json`
- Karma/leaderboard system (report = 5pts, confirm = 2-3pts, vote = 1pt)
- 150+ hardcoded Melbourne locations for fallback journey planning
- 35 hardcoded train/tram/bus routes with GPS waypoints
- Auto-generated transit-themed usernames
- Haversine distance calculations for nearby stops

### Frontend
- Leaflet map centered on Melbourne CBD with marker clustering
- Color-coded markers: Trains (blue `#094c8d`), Trams (orange `#f5a800`), Buses (purple `#7b5ea7`), V/Line (dark purple `#6c3483`)
- 15-second auto-refresh with countdown display
- Filter panel — toggle by mode, search/filter by route
- Vehicle detail panel — route, delay, occupancy, follow mode
- Follow mode — smooth map tracking of selected vehicle
- Service alerts panel with route filtering
- Search bar with location autocomplete
- Dark/light theme (persisted to localStorage)
- Mobile-responsive layout with notch/safe-area support
- Demo mode fallback if live API fails

---

## Known Issues

### Security
- **No input sanitization** on POST `/api/inspectors` — location string could be XSS vector in alert display
- **No rate limiting** on any backend endpoints

### Data / Reliability
- **`inspectors.json` is file-based** — data lost on server restart/redeployment; not suitable for multi-instance hosting (Railway/Render)
- **Hardcoded location data** (150+ Melbourne places) not dynamically updated — fallback journey planning can be stale
- **Out-of-bounds vehicles** logged as warnings and filtered — noisy in production logs
- **`MessageBlocked` error** (HTTP 200 but blocked body) means API key exists but lacks GTFS-R product subscription

### API Error States
- All metro feeds failing → 502 error returned
- V/Line feed failures are silently degraded (vehicles just absent)
- PTV keys missing → journey planning silently falls back to hardcoded routes
- Non-protobuf response → throws "Expected protobuf but got text response"

### Minor
- Occupancy status > 6 defaults to 50% (undefined in spec)
- No pagination on leaderboard (returns top 10 only)

---

## Running Locally

```bash
cd transit-live-app
npm install
# Set TRANSIT_API_KEY in .env
node server.js
# Open http://localhost:3000
```

## Deployment

- **Railway:** push to repo, set `TRANSIT_API_KEY` env var in dashboard
- **Render:** uses `render.yaml`, set `TRANSIT_API_KEY` in Render dashboard

Both platforms auto-start with `node server.js`.
