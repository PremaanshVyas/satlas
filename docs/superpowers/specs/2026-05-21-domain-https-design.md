# Domain Registration + HTTPS — Design Spec
**Date:** 2026-05-21  
**Session:** 22  
**Status:** Approved

---

## Goal

Register `satlas.app`, wire `satlas.app` to the Vercel frontend, and put `api.satlas.app` on the ALB with a valid ACM certificate and HTTPS listener. Replace the plain HTTP ALB URL in all config.

---

## Approach

Direct ALB HTTPS. ACM cert on the ALB in `ap-southeast-2`. Route 53 handles DNS. No CloudFront, no proxy layer. Domain registered manually in the AWS console; everything after that is Terraform.

---

## Components

### 1. Domain Registration (manual, one-time)

Register `satlas.app` in the Route 53 console. Cost: ~$14 USD/yr. This is done outside Terraform so the charge is confirmed before it occurs. Route 53 auto-creates a hosted zone on registration — Terraform imports or references it.

### 2. Terraform: Route 53 DNS Records

New file: `infra/terraform/dns.tf`

Route 53 auto-creates a hosted zone when a domain is registered. Terraform references it via a `data "aws_route53_zone"` lookup (by name) — no `resource "aws_route53_zone"` block, no import step, no risk of creating a duplicate zone.

Records created by Terraform:
- Alias A record: `api.satlas.app` → `aws_lb.main.dns_name`
- CNAME record for ACM DNS validation (managed by `aws_acm_certificate_validation`)
- CNAME or A record for `satlas.app` → Vercel (value provided by Vercel dashboard after adding the domain there)

### 3. Terraform: ACM Certificate

Added to `dns.tf`:

- `aws_acm_certificate` — wildcard `*.satlas.app`, DNS validation, region `ap-southeast-2`
- `aws_acm_certificate_validation` — blocks `terraform apply` until validation completes (~2 min); references the Route 53 CNAME record

Wildcard cert covers `api.satlas.app` now and any future subdomain (e.g. `www.satlas.app`) without reprovisioning.

### 4. Terraform: ALB Changes (`alb.tf`)

- New `aws_lb_listener` on port 443, protocol HTTPS, certificate ARN from the validated cert, default action `forward` to `aws_lb_target_group.orbital`
- Existing port 80 listener: change default action from `forward` to `redirect` — HTTP 301 to HTTPS, preserving `#{path}` and `#{query}`

### 5. Terraform: Security Group Change (`vpc.tf`)

Add a port 443 ingress rule to `aws_security_group.alb`:

```hcl
ingress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
}
```

The ECS and RDS security groups are unchanged — TLS terminates at the ALB; internal traffic stays HTTP on port 8000.

### 6. Application: CORS Update (`apps/orbital/main.py`)

Add `https://satlas.app` to `_ALLOWED_ORIGINS`. Keep `https://getsatlas.vercel.app` during transition:

```python
_ALLOWED_ORIGINS = [
    'https://satlas.app',
    'https://getsatlas.vercel.app',  # remove once satlas.app is confirmed stable
    'http://localhost:5173',
    'http://localhost:4173',
]
```

ECS image must be rebuilt and redeployed after this change.

### 7. Vercel: Frontend Custom Domain (manual)

In the Vercel dashboard: Settings → Domains → add `satlas.app`. Vercel provides a DNS record value (either a CNAME or an A record). Add that record to the Route 53 hosted zone in Terraform. Trigger a redeploy.

### 8. Vercel: Environment Variable Update (manual)

Update `VITE_ORBITAL_SERVICE_URL` from `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com` to `https://api.satlas.app`. Trigger a redeploy.

---

## Sequencing

Manual steps must happen before certain Terraform resources can be created:

1. Register `satlas.app` in Route 53 console → note the hosted zone ID
2. Add `satlas.app` in Vercel dashboard → note the DNS record Vercel requires
3. Write `dns.tf`, update `alb.tf`, update `vpc.tf`
4. Update `main.py` CORS list
5. `terraform apply` — creates hosted zone records, provisions cert, waits for validation, adds HTTPS listener
6. Rebuild + redeploy ECS image (CORS change)
7. Update Vercel env var + redeploy

---

## Error Handling

- If `satlas.app` is already taken: fall back to `getsatlas.app` or `satlas.dev`. Same design, just a different domain name.
- If ACM cert validation times out: most likely the CNAME record wasn't created correctly. Check `aws_route53_record` in Terraform state.
- If Vercel domain verification fails: Vercel requires the CNAME/A record to propagate (up to 48h, usually minutes via Route 53).

---

## Testing

- `curl -I https://api.satlas.app/health` → 200 OK, `strict-transport-security` header present
- `curl -I http://api.satlas.app/health` → 301 redirect to HTTPS
- `https://satlas.app` loads the globe in the browser
- Chat agent still resolves satellite queries (confirms CORS + `VITE_ORBITAL_SERVICE_URL` are correct)
- Existing 75 frontend + 87 Python tests must stay green

---

## Out of Scope

- Removing `getsatlas.vercel.app` as a Vercel URL (keep it as an alias indefinitely)
- `www.satlas.app` redirect (trivial to add later, not needed for portfolio)
- WAF or rate limiting on the ALB (V2)
