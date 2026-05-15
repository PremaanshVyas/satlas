# Session 16 Bootstrap — Aussie Sky

Read `CLAUDE.md` fully before doing anything else. That is the source of truth.

---

## Who you're working with

Premaansh ("mickey") — CS student at RMIT Melbourne, building this for Australian SWE internship applications. Every decision serves that goal. Communicates concisely; redirects rather than elaborates.

---

## Current state (end of Session 15)

- Frontend live at [aussie-sky.vercel.app](https://aussie-sky.vercel.app)
- AI chat: Vercel serverless function (`api/chat.ts`) using satellite.js directly — no Railway dependency
- Railway: hosts the Python FastAPI service (`apps/orbital/`), but nothing calls it; it's idle
- 53 Vitest tests green; tsc clean; lint clean
- Features complete: 3D globe, ~15k satellites, hover/click/search, ISS tracking, AI chat with 4 tools, orbital arcs, category filters

---

## Session 16 mission: AWS + PostgreSQL

Per `docs/roadmap-v1-to-aws.md`, this session moves the Python orbital service from Railway to AWS ECS Fargate and adds a PostgreSQL database for alert subscriptions. This turns the README's "Planned: AWS" and "Planned: PostgreSQL" into real, verifiable infrastructure.

**Why this matters for internship applications:** Australian SWE postings list AWS, PostgreSQL, Docker, and Terraform as required/preferred. After Session 16, all four are live and demonstrable.

---

## Step 1 — ECR + CI push

1. Create ECR repository `aussie-sky-orbital` in `ap-southeast-2` (Sydney — Australian region)
2. Add an `ecr-push` job to `.github/workflows/ci.yml`:
   - Runs after `orbital-docker` succeeds
   - Uses OIDC-based auth (no long-lived AWS keys stored in GitHub secrets)
   - `docker tag aussie-sky-orbital:latest <account>.dkr.ecr.ap-southeast-2.amazonaws.com/aussie-sky-orbital:latest`
   - `docker push <ECR_URI>:latest`
3. Write IAM OIDC trust policy — document in `infra/terraform/iam.tf` even before Terraform step

---

## Step 2 — ECS Fargate + ALB

Write `infra/terraform/`:
- `main.tf` — provider (AWS ap-southeast-2), S3 backend for tfstate
- `vpc.tf` — VPC, public/private subnets, security groups (ALB public, ECS task private)
- `ecs.tf` — cluster, task definition (CPU 256, memory 512, image from ECR), Fargate service
- `alb.tf` — Application Load Balancer, HTTPS listener (ACM cert), target group
- `secrets.tf` — Secrets Manager secrets for ANTHROPIC_API_KEY, DATABASE_URL

Set `ORBITAL_SERVICE_URL` in Vercel env vars to the ALB DNS name.

---

## Step 3 — RDS PostgreSQL + subscribers feature

1. Write `infra/terraform/rds.tf`: db.t3.micro, PostgreSQL 15, free-tier 12 months
2. Write `apps/orbital/migrations/001_initial.sql`:
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
3. Add `POST /subscribe` and `POST /unsubscribe` FastAPI endpoints in `apps/orbital/main.py`
4. Add subscribe form UI in the AI chat panel (small, below the input)

This is the feature that justifies PostgreSQL — without it, the DB is just infrastructure theatre.

---

## Step 4 — Terraform apply + Sentry

1. `terraform init && terraform plan && terraform apply` — document the output in an ADR
2. `pip install sentry-sdk[fastapi]` in `apps/orbital/`
3. `sentry_sdk.init(dsn=os.environ['SENTRY_DSN'], traces_sample_rate=0.2)` at FastAPI startup
4. Set `SENTRY_DSN` in Secrets Manager

---

## Architecture constraints — unchanged

- CelesTrak GROUP=active: browser-only, cloud IPs get 403
- CelesTrak CATNR: works from all IPs — use for server-side single-satellite lookups
- Claude is the presenter, not the calculator: tool errors → "service unavailable", never guessed answers
- Commit style: Conventional Commits (feat:, fix:, chore:, docs:, refactor:, test:)
- Document everything, including failures — every wrong turn gets an ADR entry

---

## Verification before ending session

- ECR: `aws ecr list-images --repository-name aussie-sky-orbital` shows an image
- ECS: `curl https://<ALB>/health` returns 200
- RDS: `psql $DATABASE_URL -c '\dt'` shows subscribers table
- CI: push to main triggers the ecr-push job (green badge)
- Sentry: trigger a 500, verify it appears in the dashboard

---

## End of session

Update CLAUDE.md: active scope section, new ADR entries for every infra decision.
Update `docs/roadmap-v1-to-aws.md`: mark Sessions 15 and 16 complete.
Create `docs/session-17-bootstrap.md`.
