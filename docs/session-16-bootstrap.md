# Session 16 Bootstrap — Satlas V1 Platform Upgrade

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.  
Then read `docs/superpowers/specs/2026-05-15-v1-platform-upgrade-design.md` — this is the approved V1 design that governs Sessions 16–20.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates. Has ~15 hours/week. No fixed deadline, but wants steady momentum.

---

## Why this session matters

Session 15 completed the MVP: 3D globe, ~15k satellites, text search, AI chat, CI/CD. Mickey then discovered satellitemap.space and wants Satlas to match it visually and surpass it through the AI agent — which no satellite tracker currently has.

The approved plan is a 5-session roadmap (Sessions 16–20) to transform Satlas from MVP into a polished, full-featured platform with its own identity. **Session 16 is the AWS foundation that unlocks everything else.**

---

## What inspired this: satellitemap.space credits (verbatim)

These are the exact credits from the platform Mickey wants to match. Every technical decision in the V1 spec traces back to this list.

### Core Libraries & Frameworks
- **TWGL.js** — WebGL helper library (twgljs.org)
- **Astro** — Astro js framework (astro.build)
- **Tailwind CSS** — Utility-first CSS framework (tailwindcss.com)
- **OpenResty** — High-performance web platform based on Nginx and LuaJIT (openresty.org)
- **Web** — Vite build tooling, Node.js runtime, and Express backend API services (vitejs.dev, nodejs.org, expressjs.com)

### Orbital Mechanics & Satellite Data
- **satellite.js** — SGP4/SDP4 implementation for orbital calculations (github.com/shashwatak/satellite-js)
- **Skyfield** — Astronomical library by Brandon Rhodes for high-precision celestial calculations (rhodesmill.org/skyfield)
- **Astronomia** — Astronomical calculations for sun/moon positioning (github.com/commenthol/astronomia)

### Data Sources
- **Space-Track.org** — Official TLE data source (space-track.org)
- **CelesTrak** — Early TLE data (celestrak.org)
- **JPL Horizons** — NASA ephemeris service for ground-truth testing and validation (JPL Horizons)
- **Gunter's Space Page** — Constellation and spacecraft information (space.skyrocket.de)
- **Jonathan McDowell (planet4589)** — JCAT data and comprehensive space tracking (planet4589.org)

### Geographic & Map Data
- **Google My Maps KML Data** — Comprehensive Starlink ground station locations and information (Google Maps)
- **Natural Earth** — Free vector map data (naturalearthdata.com)
- **Radar.com** — Geocoding services (radar.com)
- **Mapbox** — Elevation and topography data (mapbox.com)

### Visual Assets & Textures
- **NASA Blue Marble** — Earth day/night textures from NASA/Goddard Space Flight Center
- **NASA Deep Star Maps 2020** — High-resolution star field (1.7 billion stars from Gaia DR2)
- **Matt Eason's Cloud Service** — Real-time global cloud imagery (clouds.matteason.co.uk)

### Scientific Computing & Analysis
- **Julia** — High-performance scientific computing language (julialang.org)
- **Rust** — Systems programming for network testing servers (rust-lang.org)
- **Julia Satellite Toolbox** — High-precision orbital mechanics and satellite analysis (juliaspace.github.io)

### AI Tools
- **Claude Code** — AI coding assistant by Anthropic (anthropic.com)
- **DeepSeek** — AI coding and reasoning model (deepseek.com)

---

## What Satlas adopts vs skips from those credits

### Adopted — per session

| Credit | How we use it | Session |
|---|---|---|
| Space-Track.org | Primary TLE source via ECS orbital service — 30k+ objects, no cloud IP block | **16** |
| Astronomia | Replace `solar.ts` sun position — more accurate terminator | 17 |
| NASA Deep Star Maps 2020 | Replace procedural star field with Gaia DR2 texture skybox | 17 |
| Matt Eason's Cloud Service | Real-time cloud layer draped over globe | 17 |
| Jonathan McDowell JCAT | Full satellite metadata — mass, mission, operator, country, regime | 18 |
| Gunter's Space Page | Constellation descriptions and spacecraft grouping | 18 |
| JPL Horizons | Validation/testing ground-truth for orbital calculations | 18–19 |
| Radar.com | Geocoding for city-based pass prediction | 19 |
| Natural Earth | 2D map data for ground track projected view | 19 |
| CelesTrak | Browser-direct fallback (already implemented ✓) | — |
| satellite.js | Already in use ✓ | — |
| Skyfield | Already in Python service ✓ | — |
| NASA Blue Marble | Already in use ✓ | — |

### Skipped

| Credit | Why |
|---|---|
| TWGL.js | Locked to Three.js — InstancedMesh handles 30k fine |
| Astro.js | Locked to React + Vite |
| OpenResty | Using Vercel + ECS — Nginx/Lua not in scope |
| Julia / Rust | Python + satellite.js covers all orbital math at this scale |
| Mapbox | Elevation/topography not needed for V1 |
| Google My Maps KML | Starlink ground stations are a V2 feature |

---

## Five-session V1 roadmap summary

| Session | Goal | Key deliverables |
|---|---|---|
| **16** | AWS Foundation | ECS Fargate, Space-Track 30k+, S3+CloudFront catalog cache, RDS PostgreSQL, alert subscriptions, Terraform, Sentry |
| **17** | Visual Overhaul | Real-time cloud layer, NASA star map skybox, Astronomia sun, satellite trails, dot quality by type |
| **18** | Data Depth | JCAT integration, constellation grouping, debris/rocket body icons |
| **19** | Feature Expansion | Visual pass predictor, 24h ground track, coverage footprint, advanced search filters, permalink |
| **20** | AI Elevation | New agent tools, JCAT-enriched system prompt, natural language filters, Australian-first defaults |

---

## Current state (end of Session 15)

- Frontend live at `getsatlas.vercel.app`
- AI chat: Vercel serverless (`api/chat.ts`) using satellite.js directly — no Railway dependency
- Railway: hosts Python FastAPI (`apps/orbital/`) — currently idle, will be replaced by ECS in Session 16
- Catalog: browser fetches CelesTrak `GROUP=active` directly (user IPs not blocked); localStorage v4 cache, 72h stale-serve
- 53 Vitest tests green; tsc clean; lint clean
- Features shipped: 3D globe, ~15k satellites, hover/click/search, ISS tracking, AI chat with 4 tools, orbital arcs, category filters
- Design spec written: `docs/superpowers/specs/2026-05-15-v1-platform-upgrade-design.md`

---

## Session 16 mission: AWS Foundation

**Goal:** eliminate all remaining reliability issues; 30k+ satellites; always-on platform.

### Why ECS + Space-Track fixes the catalog gap permanently

CelesTrak has a 1-download-per-IP-per-2h rate limit (since March 2026). Cloud IPs (Railway, AWS) get 403 for `GROUP=active`. The browser workaround (user IPs aren't blocked) works but is fragile. The real fix: ECS Fargate runs with a static Elastic IP, and fetches from **Space-Track.org** — which has no IP restrictions. ECS writes the TLE file to S3 every 2h. CloudFront serves it to browsers in <1s, forever, with no rate limiting.

### Step 1 — ECR + CI push

1. Create ECR repository `satlas-orbital` in `ap-southeast-2` (Sydney)
2. Add `ecr-push` job to `.github/workflows/ci.yml` after `orbital-docker`:
   - OIDC-based auth (no long-lived AWS keys in GitHub secrets)
   - `docker tag ... && docker push <ECR_URI>:latest`
3. Document IAM OIDC trust policy in `infra/terraform/iam.tf`

### Step 2 — ECS Fargate + ALB (Terraform)

Write `infra/terraform/`:
- `main.tf` — provider (AWS ap-southeast-2), S3 backend for tfstate
- `vpc.tf` — VPC, public/private subnets, security groups
- `ecs.tf` — cluster, task definition (CPU 256, memory 512), Fargate service
- `alb.tf` — Application Load Balancer, HTTPS listener, target group
- `secrets.tf` — Secrets Manager: `SPACE_TRACK_USER`, `SPACE_TRACK_PASS`, `ANTHROPIC_API_KEY`, `DATABASE_URL`

Set `VITE_CATALOG_URL` in Vercel env vars to CloudFront distribution URL.  
Set `VITE_ORBITAL_SERVICE_URL` to ALB DNS.

### Step 3 — Space-Track + S3 catalog

In `apps/orbital/`:
- Add `SPACE_TRACK_USER` / `SPACE_TRACK_PASS` env vars
- ECS startup: authenticate to Space-Track session API, fetch `Group=active` + supplemental debris groups, merge, write as TLE text to S3 bucket `satlas-catalog`
- Schedule refresh every 2h via ECS task or cron-triggered Lambda
- Add CloudFront distribution in front of the S3 bucket

In `apps/web/src/lib/celestrak.ts`:
- Update `fetchActive()`: primary URL = `VITE_CATALOG_URL` (CloudFront), fallback = CelesTrak direct

This raises satellite count from ~15k to 30k+ (active payloads + debris + rocket bodies).

### Step 4 — RDS PostgreSQL + subscribers feature

`infra/terraform/rds.tf`: db.t3.micro, PostgreSQL 15, free-tier.

Migration `apps/orbital/migrations/001_initial.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  latitude   FLOAT NOT NULL,
  longitude  FLOAT NOT NULL,
  norad_id   TEXT NOT NULL DEFAULT '25544',
  min_elev   INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Add `POST /subscribe` and `DELETE /unsubscribe` FastAPI endpoints.  
Add subscribe form UI in the AI chat panel (email + city, small, below input).

### Step 5 — Sentry + docs

- `pip install sentry-sdk[fastapi]` in `apps/orbital/`
- `sentry_sdk.init(dsn=..., traces_sample_rate=0.2)` at FastAPI startup
- Set `SENTRY_DSN` in Secrets Manager
- Decommission Railway (delete service, remove Railway env vars from Vercel)
- Update `CLAUDE.md` active scope + ADR entries for every infra decision
- Create `docs/session-17-bootstrap.md`

---

## Architecture after Session 16

```
[ React + Three.js Frontend ]          ← Vercel CDN
         |
[ Claude API Agent (api/chat.ts) ]     ← Vercel serverless
         |
[ Python FastAPI Orbital Service ]     ← AWS ECS Fargate
    /satellites  → Space-Track.org TLEs (30k+)
    /passes/{norad_id}
    /overhead
    /subscribe, /unsubscribe
         |
[ PostgreSQL RDS ]                     ← AWS RDS t3.micro
    subscribers table + pgvector
         |
[ S3 + CloudFront ]                    ← TLE catalog cache
    Browser fetches from CloudFront (<1s, no rate limit)
```

---

## Architecture constraints — unchanged

- CelesTrak `GROUP=active`: browser-only, cloud IPs get 403. Never call it server-side.
- CelesTrak CATNR: works from all IPs — use for server-side single-satellite lookups.
- **Claude is the presenter, never the calculator.** Tool errors → "service unavailable". Never substitute training knowledge for live tool results.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Document everything including failures.** Every wrong turn gets an ADR entry. This is a portfolio — the journey matters.
- Every agent tool needs a test.
- Secrets: AWS Secrets Manager or env vars. `.env.example` checked in. Never commit real keys.

---

## Verification checklist before ending Session 16

- [ ] ECR: `aws ecr list-images --repository-name satlas-orbital` shows an image
- [ ] ECS: `curl https://<ALB>/health` returns 200
- [ ] S3: catalog TLE file exists and is fresh (< 2h old)
- [ ] CloudFront: `curl https://<CF_URL>/catalog.tle` returns TLE data in < 1s
- [ ] Frontend: globe shows 30k+ satellite count
- [ ] RDS: `psql $DATABASE_URL -c '\dt'` shows subscribers table with vector extension
- [ ] Subscribe form: POST /subscribe stores a row in RDS
- [ ] CI: push to main triggers ecr-push job (green)
- [ ] Sentry: trigger a 500, verify it appears in dashboard
- [ ] Railway: decommissioned (no active service)

---

## What's next after Session 16

Session 17 is the Visual Overhaul:
- Real-time cloud layer (clouds.matteason.co.uk) — second SphereGeometry at radius 1.012
- NASA Deep Star Maps 2020 skybox — replace procedural stars
- Astronomia sun position — replace `solar.ts` GMST calculation
- Satellite trails — last 10min propagated positions as fading THREE.Line on selection
- Dot quality by type: GEO 1.5×, debris 0.6×/dimmer, payloads base
