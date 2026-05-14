# Roadmap: V1 Polish → AWS Production

> Strategic plan for turning Aussie Sky from a Railway/Vercel MVP into a genuinely AWS-deployed
> product with PostgreSQL. Written for Australian SWE internship job applications.
>
> **Why this document exists:** Australian employer job postings list AWS, PostgreSQL, Docker,
> Terraform as required/preferred skills. The README currently claims these technologies but none
> are actually built. This plan gets them built for real — feature-first, not infrastructure-for-show.

---

## Current honest state (end of Session 12)

| What | Tech | Where |
|------|------|--------|
| Frontend | React + Three.js + Vite + Tailwind | Vercel (auto-deploy from main) |
| Orbital service | Python 3.11 + FastAPI + skyfield | Railway (free tier, cold starts) |
| AI agent | Claude API via Vercel serverless function | Vercel (api/chat.ts) |
| Database | **None** | — |
| Infra-as-code | **None** | — |
| Observability | **None** | — |

The README describes AWS/Postgres/Terraform/Sentry as the stack. None of those are real yet.
Making the repo public before fixing this risks looking misleading to a technical interviewer.

---

## The rule: tech must serve a feature

Don't add AWS or Postgres as empty infrastructure. Every technology addition needs a real
feature that justifies it. Interviewers ask "why did you use RDS here?" — the answer must be
"because the alert subscription feature needs durable user storage" not "to put it on my resume."

---

## Session 13 — V1 polish (immediate next session)

Before touching infrastructure, close out the MVP gaps:

1. **README local dev setup** — step-by-step instructions so anyone cloning the repo can run it.
   Currently a placeholder. This is a hard blocker for going public.
2. **README honest split** — separate "what's running now" from "target architecture / planned."
   Remove claims about Postgres/AWS/Terraform from the "current stack" section; move them to a
   clearly labelled "planned infrastructure" section.
3. **FastAPI /docs** — Swagger UI is free with FastAPI. Verify it's accessible on Railway and link
   it in the README as a live API explorer.
4. **General pass predictor** — `/passes/{norad_id}` endpoint (not just ISS). New agent tool:
   `predict_passes(norad_id, latitude, longitude, hours_ahead)`.
5. **Text search on globe** — type a satellite name, matching dot highlights. Frontend-only.
6. **UptimeRobot** — free external ping every 5 min keeps Railway warm. Zero code, fixes chatbot
   cold-start problem without paying for a plan upgrade. Set up at uptimerobot.com.

**After session 13:** repo can go public. Everything claimed is real.

---

## Session 14 — PostgreSQL with a real feature

**The feature: ISS (and any satellite) pass alert subscriptions.**

User enters their email + city/coordinates → gets an email when the ISS (or a chosen satellite)
passes over them at > 30° elevation. This genuinely needs a database. No database = no feature.

### What gets built

**Schema (simple to start):**
```sql
CREATE TABLE subscribers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    latitude    FLOAT NOT NULL,
    longitude   FLOAT NOT NULL,
    norad_id    TEXT NOT NULL DEFAULT '25544',  -- ISS by default
    min_elev    INT  NOT NULL DEFAULT 30,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

**Backend additions:**
- `POST /subscribe` — validates email + coords, inserts to DB
- `POST /unsubscribe` — removes row by email token
- Cron job (Railway cron or GitHub Actions scheduled workflow) — every hour, query subscribers,
  run pass predictions, send emails via SendGrid or AWS SES (free tier: 100 emails/day)

**Frontend addition:**
- Small subscribe form in the AI chat panel or as a standalone overlay

### What this unlocks on the resume
- PostgreSQL — real schema, real queries, not just "used Postgres"
- Can add `pgvector` extension in one line at this point — enables V2 RAG features later
- Email delivery pipeline (SES or SendGrid) — backend engineers deal with this constantly

### Where to run Postgres in session 14
Railway offers managed PostgreSQL free tier (500MB). Use that for session 14 — same infra,
zero new complexity. Just add `DATABASE_URL` env var. Migrate to RDS in session 15 when doing
the full AWS move.

---

## Session 15 — AWS migration

**Move the orbital service from Railway to AWS ECS Fargate.**
Docker already exists. CI already builds it. This is mostly configuration, not new code.

### Step by step

1. **ECR** — Create an ECR repository. Update CI to push the Docker image to ECR after a
   successful build (add one job to ci.yml: `docker tag` + `docker push` with OIDC auth).

2. **ECS Fargate** — Write a task definition (JSON) for the orbital service container.
   Create a Fargate service in a VPC. No EC2 instances to manage — Fargate is serverless containers.

3. **ALB** — Application Load Balancer in front of the ECS service. This gives you a stable
   DNS name + HTTPS termination. Update `ORBITAL_SERVICE_URL` in Vercel env vars to point here.

4. **RDS PostgreSQL** — Provision a `db.t3.micro` RDS instance (free tier eligible for 12 months).
   Migrate the subscribers table from Railway Postgres to RDS. Update `DATABASE_URL`.

5. **Secrets Manager** — Store `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SENDGRID_API_KEY` in AWS
   Secrets Manager. Reference from ECS task definition. No secrets in env vars or code.

6. **Frontend stays on Vercel** — This is correct architecture. CDN + edge functions is the right
   tool for a static React app with serverless API routes. Don't move it to AWS.

### What this gives you on the resume
- "Containerised FastAPI service deployed on AWS ECS Fargate"
- "CI/CD pipeline pushes Docker images to ECR on merge to main"
- "PostgreSQL on RDS with AWS Secrets Manager for credential rotation"
- "Application Load Balancer with HTTPS termination"
- All of these are specific, verifiable, and match what Australian job postings ask for

### Cost estimate
- ECS Fargate: ~$0 on free tier for 12 months (750 vCPU-hours/month), ~$5-15/month after
- RDS t3.micro: free tier for 12 months, ~$15/month after
- ALB: ~$16/month (not free tier) — if cost is a concern, use API Gateway + VPC Link instead
- Total ongoing: ~$0 for 12 months, then ~$30-40/month

**Practical advice:** run it for the internship application period, then tear it down or move the
service back to Railway if you get a job and don't need the portfolio running.

---

## Session 16 — Terraform + Sentry

**Convert the AWS resources you manually created in session 15 into Terraform.**

This matters because:
- "Infrastructure as code" appears in almost every Australian SWE/DevOps listing
- It makes the work code-reviewable — an interviewer can read your Terraform and understand exactly
  what you deployed, which is more impressive than "I clicked around in the AWS console"
- It documents the architecture permanently

### What to Terraform
```
infra/terraform/
├── main.tf          # provider, backend (S3 state)
├── vpc.tf           # VPC, subnets, security groups
├── ecs.tf           # cluster, task definition, service
├── rds.tf           # RDS instance, subnet group, parameter group
├── ecr.tf           # ECR repository + lifecycle policy
├── alb.tf           # ALB, listener, target group
└── secrets.tf       # Secrets Manager secrets (values injected, not hardcoded)
```

**Sentry** — add in the same session. Free tier, 5-minute integration:
- `pip install sentry-sdk` in the orbital service
- `sentry_sdk.init(dsn=..., traces_sample_rate=0.2)` at FastAPI startup
- One error in production now shows up in a dashboard with a full stack trace

### What this gives you
- "Terraform-managed AWS infrastructure (ECS, RDS, ECR, ALB, VPC)"
- "Application monitoring with Sentry"
- The `infra/terraform/` directory in the repo is tangible proof

---

## What the stack looks like after session 16

```
[ React + Three.js ] ──── Vercel CDN (stays here, correct tool)
         |
[ api/chat.ts ] ───────── Vercel serverless (stays here)
         |
[ FastAPI orbital ] ────── AWS ECS Fargate ← ECR image ← GitHub Actions CI
         |
[ PostgreSQL ] ─────────── AWS RDS (t3.micro)
         |
[ Secrets ] ────────────── AWS Secrets Manager
         |
[ Infra ] ──────────────── Terraform (infra/terraform/)
         |
[ Errors ] ─────────────── Sentry
```

---

## pgvector — when to add it

Add pgvector in session 14 at the same time as the initial Postgres setup. It costs nothing
(one line: `CREATE EXTENSION vector`) and you don't need to use it immediately. Having it
installed means you can add a RAG feature (V2) — semantic search over satellite mission docs —
without a schema migration.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- Add later when building RAG:
ALTER TABLE satellite_docs ADD COLUMN embedding vector(1536);
```

---

## V2 features (post-AWS, post-internship applications)

These are the "differentiator" items — impressive but not blocking the job search:

- **Bushfire scar detection** — PyTorch + Sentinel-2 imagery, the ML pipeline
- **Vector RAG** — pgvector + satellite mission documentation, semantic search
- **Conjunction analysis** — which objects are on close-approach trajectories
- **TimescaleDB** — orbit history as time-series (add as RDS extension or separate instance)
- **Space weather overlay** — NOAA SWPC data, geomagnetic storm alerts

---

## Resume talking points (after session 16)

These are the specific things you can say to an interviewer:

> "The frontend fetches TLE data directly from the CelesTrak CDN in the browser — I looked at
> how production satellite trackers handle this and realised the cloud-IP block on CelesTrak only
> affects server-side fetches. Moving it to the browser eliminated all Railway cold-start latency
> from the critical rendering path."

> "The orbital service runs on AWS ECS Fargate — I containerised it with Docker, CI pushes images
> to ECR on merge, and ECS pulls the new image automatically. Infrastructure is managed with
> Terraform so the full deployment is reproducible from a single `terraform apply`."

> "The database is RDS PostgreSQL with the pgvector extension. Currently it stores alert
> subscriptions; the vector extension is ready for the RAG feature I'm building next."

> "I use Sentry for error monitoring. The first time a production error surfaced in the Sentry
> dashboard with a full stack trace instead of a Railway log line, it saved about an hour of
> debugging."

---

## The bottom line for job applications

| Skill on job posting | Evidence after session 16 |
|---|---|
| AWS | ECS Fargate + RDS + ECR + ALB + Secrets Manager, all live |
| PostgreSQL | Real schema, real queries, live on RDS |
| Docker | Dockerfile + ECR push in CI |
| Terraform | `infra/terraform/` in the repo |
| CI/CD | GitHub Actions, 4 jobs, green badge |
| Python | FastAPI + skyfield + pytest, 87 tests |
| TypeScript/React | Full frontend, 45 Vitest tests |
| AI/ML | Claude API tool use, working agent with 6 tools |
