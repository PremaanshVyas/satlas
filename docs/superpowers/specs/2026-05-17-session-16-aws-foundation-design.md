# Session 16 — AWS Foundation Design Spec

**Date:** 2026-05-17  
**Author:** Premaansh ("mickey") + Claude  
**Status:** Approved

---

## Goal

Eliminate all remaining reliability issues. Move the Python orbital service from Railway (cold-starting free tier) to AWS ECS Fargate (always-warm, static IP). Serve the satellite catalog from S3 + CloudFront (<1s anywhere, no rate limiting). Raise satellite count from ~15k to 30k+. Add RDS PostgreSQL for future subscriber features. Add Sentry for error visibility.

---

## What ships this session

- AWS CLI + IAM user + OIDC provider for GitHub Actions
- Terraform: ECR, ECS Fargate + ALB, S3 + CloudFront, RDS, Secrets Manager
- GitHub Actions: `ecr-push` job after `orbital-docker`
- Python service: Space-Track auth + S3 catalog write (every 2h background task)
- Frontend: CloudFront as primary catalog source; CelesTrak as fallback
- RDS PostgreSQL: subscribers schema + pgvector (empty, ready for Session 17+)
- Sentry in Python service
- Railway decommissioned
- CLAUDE.md + docs updated

## What is NOT in scope

- Alert email sending (deferred to a later session)
- POST /subscribe endpoint and subscribe UI (deferred)
- Go API gateway (deferred to V1+)
- Vision pipeline / bushfire detection (V2)

---

## Architecture after this session

```
[ React + Three.js Frontend ]           ← Vercel CDN
         |
[ Claude API Agent (api/chat.ts) ]      ← Vercel serverless (unchanged)
         |
[ Python FastAPI Orbital Service ]      ← AWS ECS Fargate (ap-southeast-2)
    /health
    /satellite-info
    /predict-passes
    /satellites-overhead
    /satellite-categories
         |
[ PostgreSQL RDS ]                      ← AWS RDS db.t3.micro (private subnet)
    subscribers table (empty, future)
    pgvector extension
         |
[ S3 + CloudFront ]                     ← TLE catalog cache
    Browser fetches catalog.tle from CloudFront
    ECS refreshes S3 every 2h from Space-Track
```

---

## Section 1 — AWS CLI + IAM Setup

**IAM user:** `aussie-sky-deploy` with programmatic access only (no console login). Attach an inline policy covering:
- ECR: `ecr:*` on `arn:aws:ecr:ap-southeast-2:*:repository/aussie-sky-orbital`
- ECS: `ecs:*`
- EC2: VPC, subnets, security groups, ALB
- S3: `s3:*` on `arn:aws:s3:::aussie-sky-*`
- CloudFront: `cloudfront:*`
- RDS: `rds:*`
- Secrets Manager: `secretsmanager:*`
- IAM: create roles, attach policies (for ECS task execution role + OIDC)

Configure locally:
```
aws configure
  AWS Access Key ID: <aussie-sky-deploy key>
  AWS Secret Access Key: <aussie-sky-deploy secret>
  Default region name: ap-southeast-2
  Default output format: json
```

**GitHub OIDC:** Create OIDC identity provider for `token.actions.githubusercontent.com` once at account level. Create IAM role `aussie-sky-ci` with trust policy limited to `repo:PremaanshVyas/aussie-sky:ref:refs/heads/main`. Attach ECR push permissions. This role is assumed by GitHub Actions — no long-lived secrets stored in GitHub.

---

## Section 2 — Terraform Structure

Three-wave incremental apply. Each wave has a verification step before moving on.

```
infra/terraform/
  main.tf          — provider (aws, ap-southeast-2), S3 backend for tfstate
  variables.tf     — region, account_id, app_name, environment
  iam.tf           — OIDC provider, aussie-sky-ci role, ECS task execution role
  ecr.tf           — ECR repository aussie-sky-orbital
  secrets.tf       — Secrets Manager: SPACE_TRACK_USER, SPACE_TRACK_PASS,
                     ANTHROPIC_API_KEY, SENTRY_DSN, DATABASE_URL
  vpc.tf           — VPC (10.0.0.0/16), public subnets ×2, private subnets ×2,
                     IGW, NAT gateway, route tables, security groups
  ecs.tf           — ECS cluster, task definition (256 CPU / 512MB),
                     Fargate service (desired=1), CloudWatch log group
  alb.tf           — ALB, HTTPS listener (443), HTTP→HTTPS redirect,
                     target group, security group
  s3.tf            — S3 bucket aussie-sky-catalog, bucket policy (public read)
  cloudfront.tf    — CloudFront distribution → S3 bucket,
                     Cache-Control: public, max-age=7200
  rds.tf           — RDS db.t3.micro, PostgreSQL 15, single-AZ,
                     private subnet group, security group (ECS SG → RDS SG)
```

**S3 backend bucket:** `aussie-sky-tfstate` (create manually before first `terraform init`).

**Wave 1:** `ecr.tf` + `secrets.tf` + `iam.tf` (OIDC + CI role only)  
**Wave 2:** `vpc.tf` + `ecs.tf` + `alb.tf`  
**Wave 3:** `s3.tf` + `cloudfront.tf` + `rds.tf`

---

## Section 3 — ECS + Space-Track Catalog Pipeline

### Python service changes (`apps/orbital/satellites.py`)

Add a `_s3_refresh()` async function:
1. POST to `https://www.space-track.org/ajaxauth/login` with `identity`/`password` credentials from env vars.
2. GET `https://www.space-track.org/basicspacedata/query/class/gp/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID/format/3le` — returns all catalog objects with a recent epoch (~25-30k). Single query; no deduplication needed.
3. Write TLE text to S3 key `catalog.tle` with `ContentType=text/plain`, `CacheControl=public, max-age=7200`.
4. Store the parsed TLE list in the in-memory `_cache['tles']` so all endpoints use the same freshly-fetched data.

`asyncio.create_task(refresh_loop())` at FastAPI startup — `refresh_loop()` calls `_s3_refresh()` then sleeps 2h.

The existing `/satellites` HTTP endpoint is removed (catalog is now served by CloudFront directly). All other endpoints (`/satellite-info`, `/predict-passes`, `/satellites-overhead`, `/satellite-categories`) call `get_satellites()` internally, which now reads from `_cache['tles']` (populated by the S3 refresh). If `_cache['tles']` is empty at startup (first run before S3 refresh completes), endpoints return 503.

### Frontend changes (`apps/web/src/lib/celestrak.ts`)

Replace the hardcoded CelesTrak primary URL with `import.meta.env.VITE_CATALOG_URL`. Keep CelesTrak as fallback in `Promise.any()`. Add `VITE_CATALOG_URL` to `.env.example` and set it in Vercel env vars to the CloudFront distribution URL.

### ALB

HTTP listener on port 80 only (no custom domain yet, so no ACM cert needed). Target group health check: `GET /health` → 200. ECS security group: port 8000 from ALB SG only. `VITE_ORBITAL_SERVICE_URL` in Vercel env vars set to `http://<ALB_DNS>`. HTTPS via ACM can be added when a custom domain is registered.

---

## Section 4 — RDS PostgreSQL

**Instance:** `db.t3.micro`, PostgreSQL 15, ap-southeast-2a, single-AZ. Username/password stored in Secrets Manager as `DATABASE_URL` (connection string format). 20GB gp2 storage. Private subnet — no public access.

**Security group:** allow port 5432 from ECS task security group only.

**Migration** (`apps/orbital/migrations/001_initial.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  latitude   FLOAT NOT NULL,
  longitude  FLOAT NOT NULL,
  norad_id   TEXT NOT NULL DEFAULT '25544',
  min_elev   INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Migration runs at ECS startup via a Python script using `psycopg2`. If `DATABASE_URL` is not set, migration is skipped silently (local dev compatibility).

---

## Section 5 — Sentry

```
pip install sentry-sdk[fastapi]
```

In `main.py`:
```python
import sentry_sdk
sentry_sdk.init(
    dsn=os.environ.get("SENTRY_DSN", ""),
    traces_sample_rate=0.2,
)
```

`SENTRY_DSN` stored in Secrets Manager. Free Sentry org handles 5k errors/month. Verification: hit `/nonexistent` route on ECS → confirm 404 appears in Sentry dashboard.

---

## Section 6 — GitHub Actions CI (ecr-push job)

Add to `.github/workflows/ci.yml` after `orbital-docker` job:

```yaml
ecr-push:
  needs: orbital-docker
  runs-on: ubuntu-latest
  permissions:
    id-token: write
    contents: read
  steps:
    - uses: actions/checkout@v4
    - uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/aussie-sky-ci
        aws-region: ap-southeast-2
    - uses: aws-actions/amazon-ecr-login@v2
    - name: Build and push
      run: |
        IMAGE_URI=${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.ap-southeast-2.amazonaws.com/aussie-sky-orbital:latest
        docker build -t $IMAGE_URI apps/orbital/
        docker push $IMAGE_URI
```

`AWS_ACCOUNT_ID` set as a GitHub Actions variable (not secret — it's not sensitive).

---

## Verification checklist

- [ ] `aws ecr list-images --repository-name aussie-sky-orbital` shows an image
- [ ] `curl https://<ALB_DNS>/health` returns `{"status":"ok"}`
- [ ] `curl https://<CF_URL>/catalog.tle | head -3` returns 3LE data in <1s
- [ ] Globe shows 30k+ satellite count
- [ ] `psql $DATABASE_URL -c '\dt'` shows subscribers table
- [ ] `psql $DATABASE_URL -c '\dx'` shows vector extension
- [ ] CI: push to main triggers ecr-push job green
- [ ] Sentry: 404 on nonexistent route appears in dashboard
- [ ] Railway service deleted
- [ ] `VITE_ORBITAL_SERVICE_URL` in Vercel updated to ALB DNS

---

## Constraints (unchanged from CLAUDE.md)

- CelesTrak `GROUP=active`: browser-only. Never call it server-side (cloud IPs get 403).
- Claude is the presenter, never the calculator. Tool errors → "service unavailable".
- Every agent tool needs a test.
- Secrets: AWS Secrets Manager or env vars. `.env.example` checked in. Never commit real keys.
- Conventional Commits.
- Document everything including failures — ADR entry for every infra decision.
