# Aussie Sky

> Real-time space situational awareness, with an AI agent at the front door.

A live, open platform that lets anyone explore what's happening in Earth orbit — every tracked satellite, rocket body, and piece of debris, visualised in 3D and queryable in plain English.

**Live demo:** [aussie-sky.vercel.app](https://aussie-sky.vercel.app)  
Open the site — ~20,000 tracked objects orbit Earth in real time across their actual altitudes (LEO, MEO, GEO shells visually distinct), fetched from the US Space Force catalog and propagated in a web worker. A real-time cloud layer drapes the globe; a star field from NASA's Gaia DR2 catalog fills the background.  
Ask: _"When does the ISS pass over Melbourne tonight?"_ — it does real orbital mechanics to answer.  
Ask: _"Show me where the ISS is right now"_ — it answers **and** flies the 3D globe camera to the ISS, pulsing it three times.  
Ask: _"Show all Starlink satellites"_ — it highlights every Starlink dot in violet while dimming everything else.  
Ask: _"How many GPS satellites are tracked?"_ — reads the live count from the globe, no tool call needed.  
Ask: _"What satellites are overhead right now from Sydney?"_ — it queries the catalog and tells you.  
Hover any dot for name + altitude. Click to select (multiple selections supported) — see the info card with live lat/lon/altitude/velocity; hit "Ask AI" to query it. Click a satellite's trail to see where it's been.  
Category filter pills toggle entire groups on/off. Cloud layer toggle in the top-right corner.  
The agent remembers conversation context — follow-up questions work.  
**Status:** MVP+ — full-screen globe with cloud layer + star field, multi-satellite selection tray, floating AI chat, satellite trails, 6 agent tools, AWS infrastructure code-complete

---

## The pitch

Existing space situational awareness (SSA) tools are either expensive enterprise systems sold to defence and large operators, or fragmented amateur sites that show one slice of the picture. Most students, amateur astronomers, journalists, and curious people don't have a unified, modern view of what's overhead.

Aussie Sky changes that. You open the site and see Earth, with every tracked object orbiting in real time. You ask: _"What's that bright thing crossing Melbourne tonight?"_ The AI agent reasons over orbital data, satellite imagery, and a knowledge base, and tells you — while highlighting the object on the globe.

That's the front door. Behind it sits a stack of services that any developer can also call directly:

- **Orbital compute** — pass predictions, conjunction analysis, position propagation
- **Vision pipeline** — Earth observation imagery (Sentinel-2) with computer vision overlays (fire scars, urban change)
- **Knowledge RAG** — semantic search across mission docs, satellite catalogs, public space data

Everything is open source. Public API. Free for non-commercial use.

---

## Why this exists

**Most people don't realise how busy orbit is.** There are over 30,000 tracked objects and hundreds of thousands of pieces of untracked debris. Showing this is a public good.

**Australia has growing space infrastructure but limited public-facing tools.** Tidbinbilla, the Australian Space Agency, university CubeSat programs — there's no single place a student in Melbourne can see what's overhead and when.

**AI agents over real data is the interesting frontier.** Most "AI" products are chat wrappers around an LLM. This is a working example of an agent that orchestrates real scientific computation, image analysis, and knowledge retrieval to answer questions a single API call can't.

---

## Architecture

```
                    [ Frontend (React + Three.js) ]
                                  |
                         [ AI Agent (Claude API) ]
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
[ Orbital compute ]      [ Vision pipeline ]      [ Knowledge RAG ]
 FastAPI + skyfield       PyTorch + Sentinel-2      pgvector + Postgres
```

The AI agent doesn't generate orbital math. It calls tools that do. Every user query becomes one or more typed tool calls, and the agent composes the results.

Full architecture doc: [`docs/architecture.md`](docs/architecture.md) _(coming soon)_

---

## Tech stack

| Layer | Tech | Status |
|---|---|---|
| Frontend | TypeScript, React, Three.js, Tailwind, Vite | Live |
| Agent | Anthropic Claude API (Haiku + Sonnet) with tool use | Live |
| Orbital compute | satellite.js in Vercel Node.js function and browser Web Worker | Live |
| CI/CD | GitHub Actions — lint + typecheck + vitest + pytest + Docker build + ECR push | Live |
| Infra (code) | Terraform: ECS Fargate, RDS PostgreSQL, S3+CloudFront, ALB, ECR, Secrets Manager | Code-complete |
| Frontend hosting | Vercel — frontend + AI agent function | Live |
| Database | PostgreSQL 15 + pgvector + PostGIS (RDS) — schema migrated, pending first apply | Code-complete |

---

## Data sources (all public)

- **TLE catalogs** — [CelesTrak](https://celestrak.org/), Space-Track.org (free with registration)
- **Satellite imagery** — Sentinel-2 via [Sentinel Hub](https://www.sentinel-hub.com/) and Copernicus
- **Space weather** — [NOAA SWPC](https://www.swpc.noaa.gov/)
- **Ground station coordinates** — public ephemerides
- **Knowledge corpus** — NASA/ESA mission documentation, public CubeSat datasheets

---

## Roadmap

### What's working now
- [x] 3D Earth with real-time cloud layer (clouds.matteason.co.uk, updates ~3h, AdditiveBlending)
- [x] NASA Gaia DR2 star field skybox — denser and higher quality than procedural stars
- [x] ~20,000 tracked objects at actual orbital altitudes (LEO/MEO/GEO shells visually distinct)
- [x] ISS rendered separately with yellow dot; catalog satellites colour-coded by type
- [x] Dot sizing by type: GEO satellites 1.5× base size, debris 0.6× and dimmer
- [x] Satellite trails — last 10 minutes of ECEF path on selected satellite, lime→transparent fade
- [x] Multi-satellite selection tray — click multiple satellites; each gets its own orbit ring; tray chip ✕ removes; card ✕ closes info only
- [x] Satellite info card — live lat/lon/altitude/velocity + orbital parameters + metadata (country, launch date, status)
- [x] Text search — type to find any satellite by name or NORAD ID; keyboard-navigable results
- [x] Hover tooltip — satellite name + altitude; hovered/selected satellites highlight lime green
- [x] Category filter pills — Starlink / GPS / Iridium / Debris / Other with instant Uint8Array mask
- [x] Cloud layer toggle — show/hide real-time cloud layer from the globe overlay
- [x] AI agent answers questions with real orbital mechanics (skyfield pass prediction, satellite lookup)
- [x] Agent-driven globe interaction — "show me the ISS" flies the camera and pulses it
- [x] Agent-controlled category filter — "show only Starlink" applies filter + colours; pill state stays in sync
- [x] AI category counts — "how many GPS satellites?" reads live counts from globe (no tool call)
- [x] Multi-turn conversation history — follow-up questions work
- [x] Find satellites overhead from any location ("what's visible from Sydney right now?")
- [x] Look up any satellite by name or NORAD ID — live orbital snapshot + globe highlight
- [x] Melbourne-accurate timestamps (computed server-side, never guessed by the AI)
- [x] Mobile-friendly layout — 100dvh + safe-area insets so overlays clear browser chrome on iOS/Android
- [x] Auto-deploying at [aussie-sky.vercel.app](https://aussie-sky.vercel.app)

### MVP (complete)
- [x] Project scaffolding, monorepo, CI/CD
- [x] Live TLE catalog (~20,000 objects, InstancedMesh + web worker)
- [x] Agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info, set_category_filter
- [x] Click satellite → details; multi-satellite selection tray; orbital arc + trail
- [x] Hover tooltip; category filter pills; text search
- [x] Cloud layer, star field, dot sizing by type
- [x] Mobile-responsive layout (100dvh + safe-area insets)
- [x] AWS infra: Terraform code-complete (ECS Fargate, RDS, S3+CloudFront, ALB, ECR)

### V1 — next up
- [ ] AWS infra first apply (`terraform apply` — blocked on AWS card verification)
- [ ] Pass predictor for any user location (exposed in UI)
- [ ] Public API with docs
- [ ] Rate limiting
- [ ] Custom domain + HTTPS on ALB

### V2 (weeks 9–14) — the differentiator
- [ ] Conjunction analysis service
- [ ] Alert subscriptions (email/SMS for ISS pass, debris near asset, etc.)
- [ ] Vision pipeline integration — Sentinel-2 imagery on demand
- [ ] First CV use case: bushfire scar detection in Australian regions
- [ ] Vector RAG over space documentation
- [ ] Blog post explaining how it all works

### V3 — stretch
- [ ] Space weather overlay (geomagnetic storms, aurora prediction)
- [ ] ML-based orbital prediction error correction
- [ ] Mobile app

---

## Engineering Notes

Full debugging history is in [`CHANGELOG.md`](CHANGELOG.md). A few highlights:

**Vercel Edge Runtime vs Node.js** — Deployed the AI agent endpoint with `runtime: 'edge'` for lower latency. Every request returned 500. Root cause: the Anthropic SDK references `node:fs` and `node:path` internally, which don't exist in V8 edge isolates. Fix was removing the edge config and running as a standard Node.js function. Lesson: edge runtimes are not Node.js — check SDK compatibility before choosing a runtime.

**The CelesTrak double-bug** — The satellite catalog went through three data source changes in two days. First, CelesTrak's `GROUP=active` endpoint blocks Railway's cloud IP range (403). Switched to space-track.org, which worked but its orbital parameter filters (`MEAN_MOTION > 11.25`) intermittently excluded the ISS at certain orbital epochs. Added a dedicated per-satellite CATNR fetch as a guarantee — but the CATNR JSON endpoint returns GP orbital elements, not TLE lines, causing a silent `KeyError` swallowed by a `except: pass`. Final fix: `FORMAT=TLE` for the CATNR endpoint, which returns parseable three-line plain text. Three separate bugs, same symptom ("ISS not in catalog").

**TLE age and position accuracy** — The ISS was visually rendering at the wrong position because the prototype used a hardcoded March 2024 TLE baked into source code. The live catalog was fetched for the 1000-satellite field but never applied to the dedicated ISS mesh. Added `SatelliteMesh.updateTle()` to reinitialise the SGP4 propagator from the live catalog on startup. Position now matches major tracking sites within visual margin.

**Globe not flying to satellite after agent response** — The camera highlight worked once, then stopped. Root cause: the second Claude call (answer-streaming turn) had `tools` included in the request. Haiku chose to call `highlight_on_globe` as a tool call in the streaming turn instead of generating text, but the streaming loop only captures `text_delta` events — tool calls are silently dropped. Fix: removed `tools` from the answer-streaming turn (forces text-only output), updated the system prompt to say call `highlight_on_globe` in the same turn as `get_satellite_info` (not after), and increased the first-turn `max_tokens` from 512 to 1024. Lesson: never include tools in a streaming turn unless you're prepared to handle tool_use stop reasons.

**Chatbot reliability — Vercel 10s timeout + Railway cold starts** — The agent chat panel was intermittently returning "No response" even for simple questions. Two causes: (1) Vercel Hobby silently ignores `maxDuration: 60` — the hard cap is always 10s. Using Sonnet for the tool-detection turn consumed 3–5s, leaving no headroom for Railway. Fix: tool-detection turn uses `claude-haiku-4-5-20251001` (~1s), streaming answer keeps Sonnet for quality. (2) Railway free-tier sleeps after ~5 minutes; cold start takes 20–30s. Fix: the Globe component now pings `/health` on mount and every 4 minutes, keeping the backend warm for the duration of a user session.

**Coordinate system bug — every satellite over the wrong continent** — The 3D globe was rendering all satellites roughly 90° off in longitude, making ISS over East Africa appear over South America. Root cause: `THREE.SphereGeometry` UV mapping places the prime meridian (lon=0°) at the +X axis in world space. Both the satellite propagation formula and the solar lighting formula independently placed it at +Z — an internally-consistent 90° shift that made satellites coherent with day/night but wrong against geography. Fix was changing both formulas to `(r·cos(lat)·cos(lon), r·sin(lat), -r·cos(lat)·sin(lon))` and `(xECEF, zECEF, -yECEF)`. Lesson: write coordinate tests (lon=0° → +X, 90°E → −Z, north pole → +Y) before writing any rendering code, and verify against a known external tracker before shipping.

**CelesTrak FORMAT=json — a mock-divergence bug that hid for three sessions** — The catalog was silently broken since Session 6. `FORMAT=json` returns GP orbital elements but never includes `TLE_LINE1`/`TLE_LINE2`. Our parser accessed those keys → `KeyError` on every real call. Tests passed because fixtures had fabricated those keys. Production fell silently to the SpaceTrack fallback; when SpaceTrack had a transient failure both sources failed and the globe ran ISS-only with no error shown. Fix: switch to `FORMAT=TLE` (standard three-line text), add a `_parse_tle_text()` function, and update fixtures from the actual API response. Lesson: never fabricate fixture data with keys that differ from the real response schema.

**Click-to-select false positives — fixed pixel threshold is wrong for 10k satellites** — A 20px hit zone sounds small, but with 10,000 satellites there is nearly always one within 20px of any click position. The correct approach: compute the actual pixel radius of the rendered dot using `dotRadiusPx = (SPHERE_RADIUS / depth) * fovFactor`, then only accept a hit if `screenDist <= dotRadiusPx + 1`. This matches the visual dot size exactly at any zoom level. Bonus: the prefill includes the NORAD ID so the backend does an exact catalog match instead of fuzzy name search.

---

## Local development

### Prerequisites

- Node.js 20+
- npm 10+
- Git
- An Anthropic API key (free tier works) — get one at [console.anthropic.com](https://console.anthropic.com)

### Install

```bash
git clone https://github.com/PremaanshVyas/aussie-sky.git
cd aussie-sky
npm install                  # root deps (Anthropic SDK, satellite.js)
cd apps/web && npm install   # frontend deps
```

### Run the frontend

```bash
cd apps/web
npm run dev                  # Vite dev server → http://localhost:5173
```

The globe loads immediately. Satellite data fetches from CelesTrak directly in the browser — no backend needed to see the globe.

### Run the AI chat locally

The AI chat endpoint is a Vercel serverless function at `api/chat.ts`. To run it locally:

```bash
# Install Vercel CLI (one-time)
npm install -g vercel

# Add your Anthropic key at the repo root
echo 'ANTHROPIC_API_KEY=sk-ant-your-key-here' > .env

# Run the Vercel dev server (from repo root)
npx vercel dev               # API available at http://localhost:3000/api/chat
```

Then add `VITE_CHAT_URL=http://localhost:3000/api/chat` to `apps/web/.env.local` to point the frontend at your local API.

### Run tests

```bash
cd apps/web
npx vitest run               # 54 unit tests
npx tsc -b --noEmit          # TypeScript type check
npx eslint .                 # lint
```

---

## Contributing

Solo project for now. Designed to be open. Once MVP is live, see `CONTRIBUTING.md` (to be written).

---

## Author

Built by Premaansh ("mickey"), software engineering student at RMIT in Melbourne.

If you're hiring software engineering interns in Australia and what you've just read interests you — get in touch.

LinkedIn: [LinkedIn](https://www.linkedin.com/in/premaansh-vyas-30b3b2221/) 
Email: premaanshvyas04@gmail.com

---

## License

MIT
