# Session 20 Bootstrap — Pass Prediction UI + API Docs

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates. Has ~15 hours/week.

---

## Current state (end of Session 19)

### Live endpoints
- **Frontend:** `https://getsatlas.vercel.app`
- **ALB (orbital service):** `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com`
- **CloudFront catalog:** `https://dgsll6twimcwl.cloudfront.net/catalog.tle`
- **ECR:** `504132672732.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital`
- **AWS account:** `504132672732`, region `ap-southeast-2`

### What's running
- ECS Fargate: 1 task, 0.25 vCPU / 512MB, `satlas-orbital` service
- RDS: PostgreSQL 15.18, `db.t3.micro`, private subnet, `satlas` DB
- CloudFront: MEL51-P2 Melbourne edge, 2h TTL, serving `catalog.tle`
- S3: `satlas-catalog` bucket, ECS writes every 2h via `refresh_loop()`
- Secrets Manager: ANTHROPIC_API_KEY, SPACE_TRACK_USER/PASS, SENTRY_DSN (placeholder), DATABASE_URL

### AI chat tool routing (post session-19 fix)
- `get_satellite_info` → ALB `/satellite-info?query=` (not CelesTrak — cloud IPs blocked)
- `predict_passes` → CloudFront catalog search + local satellite.js computation
- `find_satellites_overhead` → Vercel `/api/catalog` → catalog search
- `highlight_on_globe` → frontend postMessage (no backend)
- `set_globe_filter` → frontend postMessage (no backend)

### Tests / CI
- 54 frontend Vitest, 79 orbital Python pytest — all passing
- CI: lint, typecheck, pytest, Docker build, ECR push (on main, requires `AWS_ACCOUNT_ID` GitHub variable ✓)

---

## Session 20 mission

### Priority 1 — Pass prediction panel in UI
Currently pass predictions only work via AI chat (`predict_passes` tool calls the ALB `/predict-passes`). Add a dedicated UI panel so users can get upcoming passes without typing.

**Suggested design:**
- Floating panel (similar to satellite info card), triggered by a "Pass Prediction" button on the globe overlay
- Inputs: location (lat/lon from browser geolocation or text input), satellite (search or click to pre-fill), hours ahead (default 24)
- Calls `/api/pass` Vercel function → ALB `/predict-passes`
- Shows a list of upcoming passes: time, max elevation, direction, duration

**Vercel function needed:** `api/pass.ts` — proxies to ALB, adds CORS, formats response.

### Priority 2 — Public API docs page
Simple `/api` page listing the public endpoints with parameters and example responses. Portfolio-visible, shows backend depth.

Endpoints to document:
- `GET /health`
- `GET /satellite-info?query=<norad_or_name>`
- `GET /predict-passes?latitude=&longitude=&hours_ahead=`
- `GET /satellites-overhead?latitude=&longitude=&radius_km=`

This can be a static React page at `/api-docs` route (avoid `/api` which Vercel reserves for functions).

### Priority 3 — Domain + HTTPS on ALB
- Register `satlas.app` (or similar) via Route 53 or Namecheap
- Point apex + `www` to Vercel (frontend)
- Create ACM certificate for `api.satlas.app`
- Add HTTPS listener (443) to ALB, attach cert
- Update `ORBITAL_SERVICE_URL` in `api/chat.ts` to `https://api.satlas.app`
- Update CORS allowed origins in `apps/orbital/main.py`

---

## Key files to know

| File | What it does |
|------|-------------|
| `api/chat.ts` | Vercel AI chat function — all tool routing |
| `api/catalog.ts` | Vercel catalog proxy → Space-Track, edge-cached |
| `apps/orbital/main.py` | FastAPI app — all orbital endpoints |
| `apps/orbital/passes.py` | Pass prediction logic (skyfield) |
| `apps/web/src/App.tsx` | Root component — globe + overlay state |
| `apps/web/src/components/AgentPanel.tsx` | AI chat panel |
| `infra/terraform/` | All AWS infra (already applied, idempotent to re-apply) |

---

## If you need to redeploy ECS manually

```bash
# Rebuild and push (from repo root, must be linux/amd64)
docker build --platform linux/amd64 -t satlas-orbital apps/orbital/
docker tag satlas-orbital:latest 504132672732.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital:latest
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 504132672732.dkr.ecr.ap-southeast-2.amazonaws.com
docker push 504132672732.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital:latest

# Force redeploy
aws ecs update-service --cluster satlas --service satlas-orbital --force-new-deployment --region ap-southeast-2 > /dev/null
```

CI handles this automatically on push to main once `AWS_ACCOUNT_ID` is set (it is ✓).
