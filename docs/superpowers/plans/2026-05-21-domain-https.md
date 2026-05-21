# Domain Registration + HTTPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register `satlas.app`, serve the frontend at `satlas.app`, serve the orbital API at `https://api.satlas.app` with a valid ACM cert, and retire the plain HTTP ALB URL.

**Architecture:** Route 53 DNS + ACM wildcard cert on the ALB in `ap-southeast-2`. TLS terminates at the ALB; ECS container stays HTTP internally. Apex domain `satlas.app` points to Vercel frontend; `api.satlas.app` is an ALB alias record.

**Tech Stack:** Terraform (AWS provider ~5.0), AWS ACM, AWS Route 53, AWS ALB, FastAPI (CORS middleware), Vercel dashboard.

---

## Manual Steps — Do These First

> These three steps cannot be automated. Complete them before running `terraform apply`.

### MANUAL STEP A — Register `satlas.app` in Route 53

1. Open [AWS Console → Route 53 → Registered domains](https://us-east-1.console.aws.amazon.com/route53/domains/home)
2. Click **Register domains**, search for `satlas.app`
3. If available: add to cart, complete purchase (~$14 USD/yr). Route 53 auto-creates a hosted zone.
4. After registration completes, go to **Hosted zones** and note the **Hosted zone ID** (format: `Z1234567ABCDEFG`). You'll need this for Task 3.
5. If `satlas.app` is taken: use `getsatlas.app` or `satlas.dev` instead — the rest of the plan is identical, just substitute the domain name everywhere.

### MANUAL STEP B — Add `satlas.app` to Vercel

1. Open [Vercel dashboard → satlas project → Settings → Domains](https://vercel.com/dashboard)
2. Add `satlas.app` as a custom domain
3. Vercel will show a DNS record to add. For an apex domain it's typically: `A  satlas.app  76.76.21.21`. Note the exact record type and value — you'll add it in Task 3.

### MANUAL STEP C — Update Vercel env var (do AFTER terraform apply)

1. After `terraform apply` completes and `https://api.satlas.app/health` returns 200:
2. Open Vercel → satlas project → Settings → Environment Variables
3. Update `VITE_ORBITAL_SERVICE_URL` from `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com` to `https://api.satlas.app`
4. Click **Save**, then trigger a redeploy (Deployments → … → Redeploy)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `infra/terraform/vpc.tf` | Modify | Add port 443 ingress rule to `aws_security_group.alb` |
| `infra/terraform/alb.tf` | Modify | Add HTTPS listener (443); change HTTP listener to redirect → HTTPS |
| `infra/terraform/dns.tf` | Create | Route 53 data source, ACM cert, cert validation, DNS records |
| `apps/orbital/main.py` | Modify | Add `https://satlas.app` to `_ALLOWED_ORIGINS` |
| `apps/orbital/tests/test_cors.py` | Create | CORS preflight tests for both origins |

---

## Task 1: Add port 443 ingress to ALB security group

**Files:**
- Modify: `infra/terraform/vpc.tf:71-86`

- [ ] **Step 1: Add the ingress rule**

In `vpc.tf`, find `aws_security_group.alb`. After the existing port 80 `ingress` block, add:

```hcl
resource "aws_security_group" "alb" {
  name   = "${var.app_name}-alb"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

- [ ] **Step 2: Validate**

```bash
cd infra/terraform
terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/vpc.tf
git commit -m "feat: open port 443 on ALB security group"
```

---

## Task 2: Update ALB listeners

**Files:**
- Modify: `infra/terraform/alb.tf`

- [ ] **Step 1: Replace alb.tf with the updated version**

Replace the full contents of `infra/terraform/alb.tf`:

```hcl
resource "aws_lb" "main" {
  name               = var.app_name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "orbital" {
  name        = "${var.app_name}-orbital"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.orbital.arn
  }
}

output "alb_dns" {
  value = aws_lb.main.dns_name
}
```

- [ ] **Step 2: Validate**

```bash
cd infra/terraform
terraform validate
```
Expected: `Success! The configuration is valid.`

Note: `aws_acm_certificate_validation.main` doesn't exist yet — validate will succeed because Terraform only checks syntax and references at this stage (the resource will be defined in Task 3).

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/alb.tf
git commit -m "feat: add HTTPS listener and HTTP->HTTPS redirect on ALB"
```

---

## Task 3: Create dns.tf

**Files:**
- Create: `infra/terraform/dns.tf`

> Before this step: complete Manual Steps A and B. You need the hosted zone ID and the Vercel DNS record value.

- [ ] **Step 1: Create dns.tf**

Create `infra/terraform/dns.tf`. Replace `<HOSTED_ZONE_ID>` with the zone ID from Manual Step A, and fill in the Vercel record from Manual Step B.

If Vercel requires an **A record** for the apex (most common):

```hcl
data "aws_route53_zone" "main" {
  zone_id = "<HOSTED_ZONE_ID>"
}

# ACM wildcard cert — covers api.satlas.app and any future subdomain
resource "aws_acm_certificate" "main" {
  domain_name       = "*.satlas.app"
  validation_method = "DNS"

  subject_alternative_names = ["satlas.app"]

  lifecycle {
    create_before_destroy = true
  }
}

# Route 53 CNAME records for ACM DNS validation
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# Wait for cert validation before the HTTPS listener can use it
resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# api.satlas.app → ALB
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.satlas.app"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# satlas.app → Vercel (A record — value from Vercel dashboard)
resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "satlas.app"
  type    = "A"
  ttl     = 300
  records = ["76.76.21.21"]  # replace with the exact value Vercel gave you
}
```

If Vercel requires a **CNAME** for the apex instead, replace the `apex` record block with:

```hcl
resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "satlas.app"
  type    = "CNAME"
  ttl     = 300
  records = ["cname.vercel-dns.com"]  # replace with value Vercel gave you
}
```

- [ ] **Step 2: Validate**

```bash
cd infra/terraform
terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

```bash
git add infra/terraform/dns.tf
git commit -m "feat: add Route 53 records, ACM cert, and cert validation"
```

---

## Task 4: Update CORS origins in orbital service

**Files:**
- Modify: `apps/orbital/main.py:39-43`
- Create: `apps/orbital/tests/test_cors.py`

- [ ] **Step 1: Write the failing test**

Create `apps/orbital/tests/test_cors.py`:

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_cors_allows_satlas_app():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://satlas.app',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') == 'https://satlas.app'


def test_cors_allows_vercel_origin():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://getsatlas.vercel.app',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') == 'https://getsatlas.vercel.app'


def test_cors_blocks_unknown_origin():
    resp = client.options(
        '/health',
        headers={
            'Origin': 'https://evil.com',
            'Access-Control-Request-Method': 'GET',
        },
    )
    assert resp.headers.get('access-control-allow-origin') != 'https://evil.com'
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/orbital
python -m pytest tests/test_cors.py -v
```
Expected: `test_cors_allows_satlas_app` FAILS; the other two PASS (vercel origin already allowed, evil origin already blocked).

- [ ] **Step 3: Add `https://satlas.app` to CORS allowlist**

In `apps/orbital/main.py`, update `_ALLOWED_ORIGINS`:

```python
_ALLOWED_ORIGINS = [
    'https://satlas.app',
    'https://getsatlas.vercel.app',  # keep during transition
    'http://localhost:5173',
    'http://localhost:4173',
]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/orbital
python -m pytest tests/test_cors.py -v
```
Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/orbital
python -m pytest -v
```
Expected: 90 tests pass (87 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add apps/orbital/tests/test_cors.py apps/orbital/main.py
git commit -m "feat: allow satlas.app origin in orbital CORS config"
```

---

## Task 5: terraform apply

> Prerequisite: Manual Steps A and B complete, `dns.tf` has the correct hosted zone ID and Vercel DNS record value.

- [ ] **Step 1: Review the plan**

```bash
cd infra/terraform
terraform plan
```
Review output. Expected new resources: `aws_acm_certificate.main`, `aws_acm_certificate_validation.main`, `aws_route53_record.cert_validation` (2 records — one for `*.satlas.app`, one for `satlas.app`), `aws_route53_record.api`, `aws_route53_record.apex`, `aws_lb_listener.https`. Expected changed resources: `aws_lb_listener.http` (redirect action), `aws_security_group.alb` (new 443 ingress).

- [ ] **Step 2: Apply**

```bash
terraform apply
```
Type `yes` when prompted. The apply will pause for ~2 minutes while ACM validates the cert via DNS — this is expected. Total apply time: ~3–5 minutes.

- [ ] **Step 3: Verify cert and HTTPS listener**

```bash
curl -I https://api.satlas.app/health
```
Expected: `HTTP/2 200` with a `strict-transport-security` header.

- [ ] **Step 4: Verify HTTP redirect**

```bash
curl -I http://api.satlas.app/health
```
Expected: `HTTP/1.1 301 Moved Permanently` with `Location: https://api.satlas.app/health`.

---

## Task 6: Rebuild and redeploy ECS image

> The CORS change in `main.py` requires a new Docker image to take effect in ECS.

- [ ] **Step 1: Get AWS account ID**

```bash
aws sts get-caller-identity --query Account --output text
```
Note the value — you'll use it as `<ACCOUNT_ID>` below.

- [ ] **Step 2: Build the image**

```bash
cd apps/orbital
docker build --platform linux/amd64 -t satlas-orbital .
```

- [ ] **Step 3: Tag and push to ECR**

```bash
aws ecr get-login-password --region ap-southeast-2 | \
  docker login --username AWS --password-stdin \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com

docker tag satlas-orbital:latest \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital:latest

docker push \
  <ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital:latest
```

- [ ] **Step 4: Force a new ECS deployment**

```bash
aws ecs update-service \
  --cluster satlas \
  --service satlas-orbital \
  --force-new-deployment \
  --region ap-southeast-2
```

- [ ] **Step 5: Wait for deployment to stabilise**

```bash
aws ecs wait services-stable \
  --cluster satlas \
  --services satlas-orbital \
  --region ap-southeast-2
```
Expected: command returns (exit 0) once the new task is running and healthy. Takes ~2 minutes.

- [ ] **Step 6: Verify CORS header from the new deployment**

```bash
curl -sI -H "Origin: https://satlas.app" \
  -H "Access-Control-Request-Method: GET" \
  -X OPTIONS \
  https://api.satlas.app/health | grep -i access-control
```
Expected: `access-control-allow-origin: https://satlas.app`

---

## Task 7: Complete Vercel steps (Manual Step C)

> Follow Manual Step C at the top of this document — update `VITE_ORBITAL_SERVICE_URL` to `https://api.satlas.app` in Vercel and trigger a redeploy.

- [ ] **Step 1: Update env var** — follow Manual Step C
- [ ] **Step 2: Verify frontend loads at `https://satlas.app`** — open in a browser, confirm the globe loads
- [ ] **Step 3: Send a chat message** that triggers a satellite lookup (e.g. "where is the ISS?") — confirms CORS + the new env var are both working end-to-end

---

## Task 8: Update CLAUDE.md + session docs

- [ ] **Step 1: Update CLAUDE.md active scope**

In `CLAUDE.md`, update the **Active scope** section:

- Change `**Current phase:**` to: `Session 22 complete — domain registration + HTTPS on ALB (satlas.app live).`
- Change `**Next milestone:**` to: `Session 23 — polish backlog: pulsing dot in SatInfoCard, compass rose in PassPanel, /docs discoverability.`
- Update **Live endpoints** table — replace ALB URL with `https://api.satlas.app` and add `satlas.app` as the frontend URL.

- [ ] **Step 2: Add ADR entry to CLAUDE.md**

Append to the Decisions log:

```
- **2026-05-21 — Session 22: `data "aws_route53_zone"` avoids duplicate hosted zone on Route 53-registered domains.**
  Route 53 auto-creates a hosted zone when a domain is registered. Using `resource "aws_route53_zone"` in Terraform
  alongside the auto-created zone produces two zones with split DNS — half the records in each, lookups fail
  intermittently. Fix: use `data "aws_route53_zone" { zone_id = "<id>" }` to reference the existing zone.
  Rule: for domains registered in Route 53, always use a data source for the zone, never a resource.
```

- [ ] **Step 3: Create session-23-bootstrap.md**

Copy `docs/session-22-bootstrap.md` to `docs/session-23-bootstrap.md`. Update it to reflect Session 22 completion: new live URLs, completed tasks, and Session 23 priorities (polish backlog).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/session-23-bootstrap.md
git commit -m "docs: session-22 complete, add session-23 bootstrap"
```
