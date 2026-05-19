# Session 18 Bootstrap — Satlas AWS Deploy

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates. Has ~15 hours/week.

---

## Current state (end of Session 18, AWS still pending)

- **Frontend:** live at `getsatlas.vercel.app` (Vercel project renamed to `satlas`)
  - Real-time cloud layer (clouds.matteason.co.uk)
  - NASA Gaia DR2 star field skybox
  - ~20,000 tracked objects at actual orbital altitudes
  - Satellite trails (10-min ECEF fade on selection)
  - Dot sizing by type (GEO 1.5×, debris 0.6×)
  - Multi-satellite selection tray (NORAD ID keyed Maps)
  - Cloud toggle, AI category counts, mobile-safe layout (100dvh + safe-area)
  - **NEW:** Framer Motion animations throughout — tray slide-up, card fade-scale, chat panel easeOut slide, chat button spring scale
  - **NEW:** Vaul bottom sheet for satellite info on mobile (<640px); `SatInfoCard` shared component
  - **NEW:** Geist font (Google Fonts CDN), Tailwind v4 `@theme` declaration
  - **NEW:** NASA MODIS cloud-free Earth texture (`land_ocean_ice_8192`); specular + normal maps preloaded
  - **NEW:** `find_satellites_overhead` AI tool live — propagates ~5-8k payloads, top 25 by elevation with compass direction
  - **NEW:** Rate limiting on `/api/chat` — 15 req/min per IP, 500-char message cap, 429/400 responses
- **Platform rename done:** GitHub repo is `PremaanshVyas/satlas`, all code/docs updated. `satlas.app` domain not yet registered — using `getsatlas.vercel.app` until then.
- **Vercel env vars set:** `ANTHROPIC_API_KEY`, `SPACE_TRACK_USER`, `SPACE_TRACK_PASS` — all active. `VITE_CATALOG_URL` not yet set (added after terraform apply).
- **Python orbital service:** code ready in `apps/orbital/` — NOT yet running on ECS (pending `terraform apply`)
- **Catalog:** browser races `/api/catalog` (Vercel function, Space-Track backed) and CelesTrak direct via `Promise.any()`
- **AWS infra (Terraform code-complete, never applied):**
  - Wave 1: ECR (`satlas`), IAM OIDC role (`satlas-ci`)
  - Wave 2: VPC (2 public + 2 private subnets), ECS Fargate cluster/service/task (256 CPU/512MB), ALB (HTTP :80)
  - Wave 3: S3 catalog bucket (public read), CloudFront (2h TTL, HTTPS), RDS PostgreSQL 15.7 (db.t3.micro, private subnet, random password in Secrets Manager)
- **CI:** `ecr-push` job in `.github/workflows/ci.yml` — OIDC-based, pushes Docker image to ECR on main branch push
- **Railway:** decommissioned ✓
- **Tests:** 54 frontend Vitest, 79 orbital Python pytest — all passing

---

## Session 18 mission: AWS infra first apply

**Goal:** get the AWS stack actually running so the portfolio has a real backend URL.

### Step 1 — AWS account + CLI setup

Mickey needs an AWS account (or has one pending card verification). Once available:

```bash
aws configure  # or use aws sso login if SSO configured
```

Confirm identity: `aws sts get-caller-identity`

### Step 2 — Terraform first apply

```bash
cd infra/terraform
terraform init   # initialises backend (creates satlas-tfstate S3 bucket first if it doesn't exist)
terraform plan   # review what will be created
terraform apply  # Terraform resolves dependency order automatically
```

The Terraform uses flat files (no modules), so `-target=module.*` flags don't apply. If the first apply fails partway, re-running `terraform apply` is safe — Terraform is idempotent.

**Before running:** create the S3 state bucket manually if it doesn't exist yet:
```bash
aws s3 mb s3://satlas-tfstate --region ap-southeast-2
```

**Outputs to capture:**
- `alb_dns_name` — the ALB HTTP URL for the Python service
- `cloudfront_domain_name` — the CDN URL for the satellite catalog
- `rds_endpoint` — database host (internal to VPC)

### Step 3 — Update Vercel env vars

In the Vercel dashboard for `satlas`:
- `VITE_CATALOG_URL` → `https://<cloudfront_domain_name>/catalog.tle`
  - Trigger a fresh Vercel deploy after setting this (it's a build-time var)

The frontend will then use CloudFront as the first catalog source (ECS writes to S3 → CloudFront).

### Step 4 — GitHub secrets for CI

The `ecr-push` workflow uses OIDC, so no long-lived keys needed. But it needs the AWS account ID:
- In GitHub repo → Settings → Secrets and variables → Variables (not Secrets):
  - `AWS_ACCOUNT_ID` = your 12-digit AWS account ID

(The workflow skips the ECR push if this var is unset — so CI passes without it, but images won't push.)

### Step 5 — Sentry setup (optional but portfolio-worthy)

1. Create a project at sentry.io (free tier)
2. Get the DSN (`https://xxx@xxx.ingest.sentry.io/xxx`)
3. In Secrets Manager: update `satlas/SENTRY_DSN` with the real DSN
4. Redeploy ECS task (or let the CI pipeline do it)

### Step 6 — Smoke test

```bash
# Check ALB health
curl http://<alb_dns_name>/health  # should return {"status": "ok"}

# Check CloudFront catalog
curl -I https://<cloudfront_domain_name>/catalog.tle  # check x-cache header
```

The ECS task's startup event (`main.py`) calls `run_migrations()` + `refresh_loop()`. First refresh fetches Space-Track → writes `catalog.tle` to S3. Give it ~2 minutes.

---

## Architecture after Session 18

```
[ Browser ]
    ├── races: /api/catalog (Vercel CDN) ↔ CelesTrak direct
    ├── AI chat → /api/chat (Vercel function) → Claude API
    └── (optional) → ALB → ECS Fargate (pass predictions, satellite lookup)

[ ECS Fargate → Space-Track → S3 → CloudFront ]
    └── Background refresh every 2h

[ RDS PostgreSQL ]
    └── subscribers table (ready for alert subscription V1)
```

---

## ✅ Send button clip — FIXED (3-attempt journey)

The bug was horizontal (right-side) clipping of "nd" in "Send", not vertical. Required 3 attempts to isolate.

**Attempt 1** (wrong): Changed panel `absolute` → `fixed`, AgentPanel `h-full flex flex-col`. Safari: `h-full` resolves to `auto` when parent has no explicit height (CSS 2.1 §10.5). Still broken.

**Attempt 2** (wrong): `relative` wrapper, AgentPanel `absolute inset-0 flex flex-col`. Chrome: mostly OK. Safari: AgentPanel height 0 — same spec issue. User reported "I can't see it in Safari."

**Attempt 3** (correct, final):
1. Panel: `position: fixed` with `style={{ top: 0, bottom: 0 }}` (inline, not Tailwind class)
2. AgentPanel renders `<>` fragment — message list + input bar are direct flex children of the fixed panel, no height inheritance across component boundaries
3. `min-w-0` on both the flex row `<div>` AND the `<input>` — browser-default input `min-width` (based on placeholder text) was pushing Send past the `overflow-hidden` edge
4. Root div: `overflow-x-hidden` (not `overflow-hidden`)

54 tests passing. Deployed. No open layout bugs.

## V1 after AWS deploy

Once the backend URL is confirmed working:
- Expose pass prediction in the UI (currently only via AI chat)
- Public API endpoints with basic docs
- Consider registering a domain + HTTPS on ALB
- `docs/architecture.md` (not yet written — overview diagram + service boundaries)

---

## Verification checklist before ending Session 18

- [ ] `terraform apply` completed without errors
- [ ] ALB health check passes (`/health` returns 200)
- [ ] ECS task running, catalog refreshed (S3 `catalog.tle` exists, non-empty)
- [ ] CloudFront serving catalog (sub-100ms from Sydney after first cache warm)
- [ ] Vercel `VITE_CATALOG_URL` updated, fresh deploy triggered
- [ ] Globe loads with 20k+ satellites using CloudFront as source
- [ ] GitHub `AWS_ACCOUNT_ID` variable set; CI ECR push succeeds on next push to main
