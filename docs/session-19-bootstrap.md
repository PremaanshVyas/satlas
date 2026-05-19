# Session 19 Bootstrap — AWS First Apply

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates. Has ~15 hours/week.

---

## Current state (end of Session 18)

- **Frontend:** live at `getsatlas.vercel.app` — fully complete for V1 (no open bugs)
  - Real-time cloud layer, NASA Gaia DR2 star field skybox
  - ~20,000 tracked objects at actual orbital altitudes
  - Satellite trails (10-min ECEF fade), dot sizing by type
  - Multi-satellite selection tray, Vaul mobile bottom sheet
  - Framer Motion animations throughout, Geist font
  - NASA MODIS cloud-free Earth texture
  - `find_satellites_overhead` AI tool (top 25 by elevation with compass direction)
  - Rate limiting on `/api/chat` (15 req/min per IP, 500-char cap)
  - Responsive layout: `position: fixed` chat panel, AgentPanel fragment pattern, `min-w-0` on inputs
- **Tests:** 54 frontend Vitest, 79 orbital Python pytest — all passing
- **CI:** 4 GitHub Actions jobs — lint, typecheck, pytest, Docker build
- **Python orbital service:** code complete in `apps/orbital/` — NOT yet running (pending `terraform apply`)
- **Catalog:** browser races `/api/catalog` (Vercel → Space-Track, edge-cached 2h) and CelesTrak direct via `Promise.any()`
- **Vercel env vars set:** `ANTHROPIC_API_KEY`, `SPACE_TRACK_USER`, `SPACE_TRACK_PASS`. `VITE_CATALOG_URL` not yet set — added after terraform apply.
- **AWS infra (Terraform code-complete, never applied):**
  - Wave 1: ECR (`satlas`), IAM OIDC role (`satlas-ci`)
  - Wave 2: VPC (2 public + 2 private subnets), ECS Fargate cluster/service/task (256 CPU/512MB), ALB (HTTP :80)
  - Wave 3: S3 catalog bucket (public read), CloudFront (2h TTL, HTTPS), RDS PostgreSQL 15.7 (db.t3.micro, private subnet, random password in Secrets Manager)
- **CI ECR push:** `ecr-push` job in `.github/workflows/ci.yml` — OIDC-based, skips if `AWS_ACCOUNT_ID` GitHub variable not set
- **Railway:** decommissioned ✓

---

## Session 19 mission: AWS first apply

**Goal:** get the AWS stack actually running so the portfolio has a real backend URL.

### Step 1 — AWS account + CLI

```bash
aws configure           # or aws sso login if SSO configured
aws sts get-caller-identity   # confirm identity
```

### Step 2 — Terraform first apply

Create the S3 state bucket first if it doesn't exist:
```bash
aws s3 mb s3://satlas-tfstate --region ap-southeast-2
```

Then apply:
```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

Terraform uses flat files (no modules), so `-target=module.*` doesn't apply. Re-running `terraform apply` is safe — it's idempotent.

**Capture these outputs:**
- `alb_dns_name` — ALB HTTP URL for the Python service
- `cloudfront_domain_name` — CDN URL for the satellite catalog
- `rds_endpoint` — database host (internal to VPC only)

### Step 3 — Update Vercel env vars

In the Vercel dashboard for `satlas`:
- `VITE_CATALOG_URL` → `https://<cloudfront_domain_name>/catalog.tle`
  - Trigger a fresh Vercel deploy after setting (build-time var)

### Step 4 — GitHub variable for CI

In GitHub repo → Settings → Secrets and variables → Variables:
- `AWS_ACCOUNT_ID` = your 12-digit AWS account ID

### Step 5 — Sentry (optional but portfolio-worthy)

1. Create a project at sentry.io (free tier)
2. Get the DSN
3. In Secrets Manager: update `satlas/SENTRY_DSN` with real DSN
4. Redeploy ECS task (CI handles this on next push to main)

### Step 6 — Smoke test

```bash
curl http://<alb_dns_name>/health               # → {"status": "ok"}
curl -I https://<cloudfront_domain_name>/catalog.tle   # check x-cache header
```

ECS task startup calls `run_migrations()` + `refresh_loop()`. First refresh fetches Space-Track → writes `catalog.tle` to S3. Give it ~2 minutes.

---

## V1 checklist after AWS

- [ ] `terraform apply` completed without errors
- [ ] ALB health check passes
- [ ] ECS task running; S3 `catalog.tle` exists and non-empty
- [ ] CloudFront serving catalog (sub-100ms from Sydney after first cache warm)
- [ ] Vercel `VITE_CATALOG_URL` set; fresh deploy triggered
- [ ] Globe loads 20k+ satellites with CloudFront as source
- [ ] GitHub `AWS_ACCOUNT_ID` set; CI ECR push succeeds on next push

---

## V1 roadmap (after AWS is live)

1. **Pass prediction in UI** — currently only accessible via AI chat (`find_pass_predictions` tool calls the Python service). Add a dedicated panel so users can see upcoming passes without typing a question.
2. **Public API docs page** — simple `/api` page listing endpoints, parameters, example responses. Portfolio-visible.
3. **Domain + HTTPS on ALB** — register `satlas.app` (or similar), point to Vercel + ALB. ACM cert for ALB HTTPS. Vercel handles frontend HTTPS automatically.
4. **`docs/architecture.md`** — overview diagram + service boundaries. One page, for the README and portfolio write-up.

---

## Architecture after Session 19

```
[ Browser ]
    ├── races: /api/catalog (Vercel CDN) ↔ CelesTrak direct
    ├── AI chat → /api/chat (Vercel function) → Claude API
    └── pass prediction → /api/pass → ALB → ECS Fargate

[ ECS Fargate → Space-Track → S3 → CloudFront ]
    └── Background refresh every 2h

[ RDS PostgreSQL ]
    └── subscribers table (ready for alert subscription V1)
```
