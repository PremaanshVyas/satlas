# Session 16 — AWS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Python orbital service from Railway to AWS ECS Fargate, serve the TLE catalog from S3+CloudFront (30k+ satellites), add RDS PostgreSQL, and add Sentry error monitoring.

**Architecture:** Terraform in three waves (ECR→ECS+ALB→S3+CF+RDS). Python service rewrites `satellites.py` to fetch from Space-Track in 3LE format and write to S3 on startup and every 2h. Frontend replaces `/api/catalog` primary URL with CloudFront via `VITE_CATALOG_URL`.

**Tech Stack:** AWS (ECS Fargate, ECR, ALB, S3, CloudFront, RDS PostgreSQL 15, Secrets Manager), Terraform ≥1.5, boto3, sentry-sdk[fastapi], psycopg2-binary, GitHub Actions OIDC.

---

## File map

**New files:**
- `infra/terraform/main.tf` — provider, S3 backend
- `infra/terraform/variables.tf` — region, account_id, app_name
- `infra/terraform/iam.tf` — OIDC provider, CI role, ECS task roles
- `infra/terraform/ecr.tf` — ECR repository
- `infra/terraform/secrets.tf` — Secrets Manager secrets (no values)
- `infra/terraform/vpc.tf` — VPC, subnets, IGW, NAT, security groups
- `infra/terraform/ecs.tf` — ECS cluster, task definition, Fargate service
- `infra/terraform/alb.tf` — ALB, HTTP listener, target group
- `infra/terraform/s3.tf` — S3 bucket with public read + CORS
- `infra/terraform/cloudfront.tf` — CloudFront distribution → S3
- `infra/terraform/rds.tf` — RDS db.t3.micro + random password + DATABASE_URL secret version
- `infra/terraform/terraform.tfvars.example` — example vars file
- `apps/orbital/migrations/001_initial.sql` — pgvector + subscribers schema
- `apps/orbital/db.py` — migration runner

**Modified files:**
- `apps/orbital/satellites.py` — replace CelesTrak/SpaceTrack JSON with Space-Track 3LE + S3 write
- `apps/orbital/requirements.txt` — add boto3, sentry-sdk[fastapi], psycopg2-binary
- `apps/orbital/main.py` — remove /satellites endpoint, add Sentry init, add startup event
- `apps/orbital/tests/test_satellites.py` — remove obsolete tests, add tests for new functions
- `.github/workflows/ci.yml` — add ecr-push job
- `apps/web/src/lib/celestrak.ts` — use VITE_CATALOG_URL when set
- `.env.example` — document VITE_CATALOG_URL

---

## Task 0: AWS account prerequisites (manual steps, no code)

- [ ] **Step 1: Create IAM user**

In AWS Console → IAM → Users → Create user `satlas-deploy`. Attach this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:*", "ecs:*", "ec2:*", "elasticloadbalancing:*",
        "s3:*", "cloudfront:*", "rds:*", "secretsmanager:*",
        "iam:CreateRole", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
        "iam:PutRolePolicy", "iam:GetRole", "iam:PassRole",
        "iam:CreateOpenIDConnectProvider", "iam:GetOpenIDConnectProvider",
        "iam:DeleteOpenIDConnectProvider",
        "logs:*", "application-autoscaling:*"
      ],
      "Resource": "*"
    }
  ]
}
```

Generate access key. Copy Access Key ID and Secret Access Key.

- [ ] **Step 2: Configure AWS CLI**

```bash
brew install awscli terraform  # if not installed
aws configure
# AWS Access Key ID: <paste key>
# AWS Secret Access Key: <paste secret>
# Default region name: ap-southeast-2
# Default output format: json
aws sts get-caller-identity
```

Expected output: JSON with your account ID (note this — needed as Terraform variable).

- [ ] **Step 3: Create Terraform state bucket**

```bash
aws s3 mb s3://satlas-tfstate --region ap-southeast-2
aws s3api put-bucket-versioning \
  --bucket satlas-tfstate \
  --versioning-configuration Status=Enabled
```

Expected: no output (success).

---

## Task 1: Terraform Wave 1 — ECR + IAM + Secrets Manager

- [ ] **Step 1: Create Terraform foundation**

```bash
mkdir -p infra/terraform
```

Create `infra/terraform/main.tf`:

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  backend "s3" {
    bucket = "satlas-tfstate"
    key    = "terraform.tfstate"
    region = "ap-southeast-2"
  }
}

provider "aws" {
  region = var.region
}
```

Create `infra/terraform/variables.tf`:

```hcl
variable "region" {
  default = "ap-southeast-2"
}

variable "account_id" {
  description = "AWS account ID (12 digits, no dashes)"
}

variable "app_name" {
  default = "satlas"
}
```

Create `infra/terraform/terraform.tfvars.example`:

```hcl
account_id = "123456789012"
```

- [ ] **Step 2: Write IAM Terraform**

Create `infra/terraform/iam.tf`:

```hcl
# GitHub OIDC provider — allows GitHub Actions to assume AWS roles without stored secrets
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# CI role — assumed by GitHub Actions ecr-push job
resource "aws_iam_role" "ci" {
  name = "${var.app_name}-ci"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike  = { "token.actions.githubusercontent.com:sub" = "repo:PremaanshVyas/satlas:*" }
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "ci_ecr" {
  name = "ecr-push"
  role = aws_iam_role.ci.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
                  "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
                  "ecr:CompleteLayerUpload", "ecr:PutImage",
                  "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
      Resource = "*"
    }]
  })
}

# ECS task execution role — lets ECS pull images and read secrets
resource "aws_iam_role" "ecs_exec" {
  name = "${var.app_name}-ecs-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_exec" {
  role       = aws_iam_role.ecs_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_exec_secrets" {
  name = "read-secrets"
  role = aws_iam_role.ecs_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${var.app_name}/*"
    }]
  })
}

# ECS task role — runtime permissions (S3 write for catalog)
resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-catalog-write"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "arn:aws:s3:::${var.app_name}-catalog/*"
    }]
  })
}
```

- [ ] **Step 3: Write ECR Terraform**

Create `infra/terraform/ecr.tf`:

```hcl
resource "aws_ecr_repository" "orbital" {
  name                 = "${var.app_name}-orbital"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

output "ecr_url" {
  value = aws_ecr_repository.orbital.repository_url
}
```

- [ ] **Step 4: Write Secrets Manager Terraform**

Create `infra/terraform/secrets.tf`:

```hcl
locals {
  secret_names = ["SPACE_TRACK_USER", "SPACE_TRACK_PASS", "ANTHROPIC_API_KEY", "SENTRY_DSN", "DATABASE_URL"]
}

resource "aws_secretsmanager_secret" "app" {
  for_each = toset(local.secret_names)
  name     = "${var.app_name}/${each.key}"
}

output "secret_arns" {
  value = { for k, v in aws_secretsmanager_secret.app : k => v.arn }
}
```

- [ ] **Step 5: Init and validate**

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and set your account_id
terraform init
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Plan and apply Wave 1**

```bash
terraform plan -out=wave1.tfplan
terraform apply wave1.tfplan
```

Expected: ~7 resources created (OIDC provider, 2 IAM roles, 3 IAM policies, ECR repo, 5 secrets).

- [ ] **Step 7: Verify ECR exists**

```bash
aws ecr describe-repositories --repository-names satlas-orbital --query 'repositories[0].repositoryUri' --output text
```

Expected: `<account_id>.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital`

- [ ] **Step 8: Populate secret values**

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
APP=satlas

# Set your real Space-Track credentials
aws secretsmanager put-secret-value \
  --secret-id $APP/SPACE_TRACK_USER \
  --secret-string "your-spacetrack-email@example.com"

aws secretsmanager put-secret-value \
  --secret-id $APP/SPACE_TRACK_PASS \
  --secret-string "your-spacetrack-password"

# Set your Anthropic key
aws secretsmanager put-secret-value \
  --secret-id $APP/ANTHROPIC_API_KEY \
  --secret-string "sk-ant-..."

# Sentry DSN placeholder — update after Task 9 sets up Sentry
aws secretsmanager put-secret-value \
  --secret-id $APP/SENTRY_DSN \
  --secret-string ""

# DATABASE_URL placeholder — Terraform Wave 3 overwrites this with real value
aws secretsmanager put-secret-value \
  --secret-id $APP/DATABASE_URL \
  --secret-string ""
```

- [ ] **Step 9: Commit Wave 1 Terraform**

```bash
cd ../..  # back to repo root
git add infra/terraform/
git commit -m "feat(infra): Terraform Wave 1 — ECR, IAM OIDC, Secrets Manager"
```

---

## Task 2: CI ecr-push job

- [ ] **Step 1: Add ecr-push job to CI workflow**

Append to `.github/workflows/ci.yml` after the `orbital-docker` job:

```yaml
  ecr-push:
    name: Orbital — ECR push
    needs: orbital-docker
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ vars.AWS_ACCOUNT_ID }}:role/satlas-ci
          aws-region: ap-southeast-2
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push
        run: |
          IMAGE_URI=${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital:latest
          docker build -t $IMAGE_URI apps/orbital/
          docker push $IMAGE_URI
```

- [ ] **Step 2: Add GitHub Actions variable**

In GitHub repo → Settings → Actions → Variables → New repository variable:
- Name: `AWS_ACCOUNT_ID`
- Value: your 12-digit AWS account ID (from `aws sts get-caller-identity --query Account --output text`)

- [ ] **Step 3: Commit and verify CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add ECR image push job on main branch"
git push
```

Expected: CI runs, `ecr-push` job passes, image appears in ECR.

Verify: `aws ecr describe-images --repository-name satlas-orbital --query 'imageDetails[0].imageTags'`

---

## Task 3: Python service — rewrite satellites.py (TDD)

- [ ] **Step 1: Add new dependencies**

Edit `apps/orbital/requirements.txt`:

```
fastapi==0.111.0
uvicorn[standard]==0.30.0
skyfield==1.49
httpx==0.27.0
boto3==1.34.0
sentry-sdk[fastapi]==2.3.1
psycopg2-binary==2.9.9
```

- [ ] **Step 2: Write failing tests for new functions**

Replace the content of `apps/orbital/tests/test_satellites.py` with:

```python
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import satellites
from main import app

ENV_VARS = {'SPACETRACK_USER': 'user@example.com', 'SPACETRACK_PASS': 'secret'}

# ── 3LE text fixtures ──────────────────────────────────────────────────────────

SPACETRACK_3LE = (
    '0 ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
    '0 STARLINK-1\n'
    '1 44713U 19074A   24087.54791667  .00001000  00000-0  10000-3 0  9990\n'
    '2 44713  53.0000 100.0000 0001000  50.0000 310.0000 15.06000000000001\n'
)

CELESTRAK_3LE = (
    'ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
)

ISS_TLE_TEXT = (
    'ISS (ZARYA)\n'
    '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993\n'
    '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522\n'
)


def _mock_httpx(text: str):
    """Return a patched httpx.AsyncClient that returns `text` from GET."""
    mock_resp = MagicMock()
    mock_resp.text = text
    mock_resp.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=MagicMock(raise_for_status=MagicMock()))
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


# ── _parse_tle_text ────────────────────────────────────────────────────────────

class TestParseTleText:
    def test_parses_two_satellites_from_celestrak(self):
        result = satellites._parse_tle_text(CELESTRAK_3LE)
        assert len(result) == 1
        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_strips_space_track_zero_prefix(self):
        result = satellites._parse_tle_text(SPACETRACK_3LE)
        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'   # not '0 ISS (ZARYA)'
        assert result[1]['name'] == 'STARLINK-1'

    def test_norad_id_extracted(self):
        result = satellites._parse_tle_text(SPACETRACK_3LE)
        assert result[0]['norad_id'] == '25544'

    def test_skips_malformed_lines(self):
        bad = 'GOOD SAT\n1 12345U ...\n2 12345 ...\nJUNK\n'
        assert len(satellites._parse_tle_text(bad)) == 1

    def test_empty_returns_empty(self):
        assert satellites._parse_tle_text('') == []


# ── _fetch_space_track_tles ────────────────────────────────────────────────────

class TestFetchSpaceTrackTles:
    def test_returns_parsed_list(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_space_track_tles())
        assert len(result) == 2
        assert result[0]['name'] == 'ISS (ZARYA)'

    def test_strips_zero_prefix_in_names(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_space_track_tles())
        assert not any(r['name'].startswith('0 ') for r in result)

    def test_raises_if_credentials_missing(self):
        with patch.dict('os.environ', {}, clear=True):
            with pytest.raises(ValueError, match='SPACETRACK_USER'):
                asyncio.run(satellites._fetch_space_track_tles())

    def test_posts_to_login_url(self):
        mock_client = _mock_httpx(SPACETRACK_3LE)
        with patch('satellites.httpx.AsyncClient') as MC, patch.dict('os.environ', ENV_VARS):
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            asyncio.run(satellites._fetch_space_track_tles())
        mock_client.post.assert_called_once_with(
            satellites.SPACETRACK_LOGIN_URL,
            data={'identity': ENV_VARS['SPACETRACK_USER'], 'password': ENV_VARS['SPACETRACK_PASS']},
        )


# ── _s3_refresh ────────────────────────────────────────────────────────────────

SAMPLE_TLES = [
    {'name': 'ISS (ZARYA)', 'norad_id': '25544',
     'tle1': '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993',
     'tle2': '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'},
]


class TestS3Refresh:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_updates_in_memory_cache(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        assert satellites._cache['tles'] == SAMPLE_TLES

    def test_writes_catalog_to_s3(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        mock_s3.put_object.assert_called_once()
        kwargs = mock_s3.put_object.call_args.kwargs
        assert kwargs['Bucket'] == 'satlas-catalog'
        assert kwargs['Key'] == 'catalog.tle'
        assert kwargs['ContentType'] == 'text/plain'

    def test_s3_object_contains_tle_data(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {'CATALOG_BUCKET': 'satlas-catalog'}):
            asyncio.run(satellites._s3_refresh())
        body = mock_s3.put_object.call_args.kwargs['Body']
        assert '25544' in body

    def test_skips_s3_write_without_bucket_env(self):
        mock_s3 = MagicMock()
        with patch('satellites._fetch_space_track_tles', AsyncMock(return_value=SAMPLE_TLES)), \
             patch('satellites.boto3.client', return_value=mock_s3), \
             patch.dict('os.environ', {}, clear=True):
            asyncio.run(satellites._s3_refresh())
        mock_s3.put_object.assert_not_called()
        assert satellites._cache['tles'] == SAMPLE_TLES  # cache still updated


# ── get_satellites (simplified — reads from cache only) ───────────────────────

class TestGetSatellites:
    def setup_method(self):
        satellites._cache['tles'] = []
        satellites._cache['fetched_at'] = 0.0

    def test_returns_cached_tles(self):
        satellites._cache['tles'] = SAMPLE_TLES
        result = asyncio.run(satellites.get_satellites())
        assert result == SAMPLE_TLES

    def test_raises_when_cache_empty(self):
        with pytest.raises(RuntimeError, match='not yet loaded'):
            asyncio.run(satellites.get_satellites())


# ── _fetch_iss_tle (unchanged) ────────────────────────────────────────────────

class TestFetchIssTle:
    def test_returns_iss_record(self):
        mock_client = _mock_httpx(ISS_TLE_TEXT)
        with patch('satellites.httpx.AsyncClient') as MC:
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites._fetch_iss_tle())
        assert result['norad_id'] == '25544'
        assert result['tle1'].startswith('1 25544')


# ── get_iss_tle cache ─────────────────────────────────────────────────────────

class TestGetIssTle:
    def setup_method(self):
        satellites._iss_cache['tle'] = None
        satellites._iss_cache['fetched_at'] = 0.0

    def test_returns_tle_lines(self):
        mock_client = _mock_httpx(ISS_TLE_TEXT)
        with patch('satellites.httpx.AsyncClient') as MC:
            MC.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MC.return_value.__aexit__ = AsyncMock(return_value=None)
            result = asyncio.run(satellites.get_iss_tle())
        assert 'tle1' in result and 'tle2' in result

    def test_uses_cache_within_ttl(self):
        cached = {'tle1': '1 25544U ...', 'tle2': '2 25544 ...'}
        satellites._iss_cache['tle'] = cached
        satellites._iss_cache['fetched_at'] = time.time()
        with patch('satellites.httpx.AsyncClient') as MC:
            asyncio.run(satellites.get_iss_tle())
            MC.assert_not_called()


# ── health endpoint ───────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_returns_200(self):
        # Mock startup side-effects so tests don't need real AWS/DB credentials
        with patch('main.run_migrations', return_value=None), \
             patch('main.refresh_loop', AsyncMock(return_value=None)):
            client = TestClient(app)
            assert client.get('/health').status_code == 200


# ── cache TTL ─────────────────────────────────────────────────────────────────

class TestCacheTTL:
    def test_iss_cache_ttl_is_five_minutes(self):
        assert satellites.ISS_TLE_TTL_SECONDS == 300
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd apps/orbital
python -m pip install -r requirements.txt pytest
python -m pytest tests/test_satellites.py -v 2>&1 | head -40
```

Expected: failures on `TestFetchSpaceTrackTles`, `TestS3Refresh`, `TestGetSatellites` (functions don't exist yet). `TestParseTleText::test_strips_space_track_zero_prefix` also fails.

- [ ] **Step 4: Rewrite satellites.py**

Replace the entire content of `apps/orbital/satellites.py`:

```python
import asyncio
import os
import time

import boto3
import httpx

CELESTRAK_ISS_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'
CELESTRAK_HEADERS = {'User-Agent': 'satlas/1.0 (portfolio project; https://getsatlas.vercel.app)'}

SPACETRACK_LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
SPACETRACK_CATALOG_URL = (
    'https://www.space-track.org/basicspacedata/query/class/gp'
    '/EPOCH/%3Enow-30/orderby/NORAD_CAT_ID/format/3le'
)

ISS_TLE_TTL_SECONDS = 300   # 5 min — ISS moves 7.66 km/s
CATALOG_REFRESH_SECONDS = 2 * 60 * 60  # 2 h

ISS_NORAD = '25544'

_cache: dict = {'tles': [], 'fetched_at': 0.0}
_iss_cache: dict = {'tle': None, 'fetched_at': 0.0}


def _parse_tle_text(text: str) -> list:
    """Parse 3LE text into TLE record dicts. Strips Space-Track '0 ' name prefix."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    result = []
    i = 0
    while i + 2 < len(lines):
        name, tle1, tle2 = lines[i], lines[i + 1], lines[i + 2]
        if tle1.startswith('1 ') and tle2.startswith('2 '):
            clean_name = name[2:] if name.startswith('0 ') else name
            result.append({
                'name': clean_name,
                'norad_id': tle1[2:7].strip(),
                'tle1': tle1,
                'tle2': tle2,
            })
            i += 3
        else:
            i += 1
    return result


async def _fetch_space_track_tles() -> list:
    """Authenticate to Space-Track and fetch full catalog as 3LE text."""
    user = os.environ.get('SPACETRACK_USER')
    password = os.environ.get('SPACETRACK_PASS')
    if not user or not password:
        raise ValueError('SPACETRACK_USER and SPACETRACK_PASS environment variables must be set')

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        await client.post(SPACETRACK_LOGIN_URL, data={'identity': user, 'password': password})
        resp = await client.get(SPACETRACK_CATALOG_URL)
        resp.raise_for_status()
        return _parse_tle_text(resp.text)


def _s3_put(tle_records: list) -> None:
    """Write TLE records as 3LE text to S3. No-op if CATALOG_BUCKET is not set."""
    bucket = os.environ.get('CATALOG_BUCKET')
    if not bucket:
        return

    lines = []
    for r in tle_records:
        lines.append(r['name'])
        lines.append(r['tle1'])
        lines.append(r['tle2'])
    body = '\n'.join(lines) + '\n'

    s3 = boto3.client('s3')
    s3.put_object(
        Bucket=bucket,
        Key='catalog.tle',
        Body=body,
        ContentType='text/plain',
        CacheControl='public, max-age=7200',
    )


async def _s3_refresh() -> None:
    """Fetch full catalog from Space-Track, update in-memory cache, write to S3."""
    tles = await _fetch_space_track_tles()
    _cache['tles'] = tles
    _cache['fetched_at'] = time.time()
    _s3_put(tles)


async def refresh_loop() -> None:
    """Background task: refresh catalog every 2h."""
    while True:
        try:
            await _s3_refresh()
        except Exception as exc:
            # Keep running even if a refresh fails — next attempt in 2h
            import logging
            logging.getLogger(__name__).error('Catalog refresh failed: %s', exc)
        await asyncio.sleep(CATALOG_REFRESH_SECONDS)


async def get_satellites() -> list:
    """Return cached TLE list. Raises if catalog not yet loaded."""
    if _cache['tles']:
        return _cache['tles']
    raise RuntimeError('Catalog not yet loaded — refresh in progress')


async def _fetch_iss_tle() -> dict:
    """Fetch ISS TLE from CelesTrak CATNR — works from cloud IPs (no IP block on CATNR)."""
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(CELESTRAK_ISS_URL, headers=CELESTRAK_HEADERS)
        resp.raise_for_status()
        lines = resp.text.strip().splitlines()
        if len(lines) < 3:
            raise ValueError(f'Unexpected ISS TLE response: {resp.text[:100]}')
        tle1, tle2 = lines[1].strip(), lines[2].strip()
        norad_id = tle1[2:7].strip()
        return {'name': lines[0].strip(), 'norad_id': norad_id, 'tle1': tle1, 'tle2': tle2}


async def get_iss_tle() -> dict:
    """Return fresh ISS TLE, cached for ISS_TLE_TTL_SECONDS."""
    now = time.time()
    if _iss_cache['tle'] and now - _iss_cache['fetched_at'] < ISS_TLE_TTL_SECONDS:
        return _iss_cache['tle']
    tle = await _fetch_iss_tle()
    _iss_cache['tle'] = {'tle1': tle['tle1'], 'tle2': tle['tle2']}
    _iss_cache['fetched_at'] = now
    return _iss_cache['tle']
```

- [ ] **Step 5: Run tests — expect pass**

```bash
python -m pytest tests/test_satellites.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/orbital/satellites.py apps/orbital/requirements.txt apps/orbital/tests/test_satellites.py
git commit -m "feat(orbital): Space-Track 3LE fetch + S3 catalog write, replace CelesTrak primary"
```

---

## Task 4: Update main.py — Sentry, remove /satellites, add startup

- [ ] **Step 1: Rewrite main.py**

Replace `apps/orbital/main.py`:

```python
import asyncio
import os

import sentry_sdk
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import run_migrations
from overhead import satellites_overhead
from passes import predict_passes
from satellites import get_satellites, get_iss_tle, refresh_loop
from satinfo import satellite_info

sentry_sdk.init(
    dsn=os.environ.get('SENTRY_DSN', ''),
    traces_sample_rate=0.2,
)

app = FastAPI(title='Satlas Orbital Service')

ISS_NORAD_ID = '25544'
_CATEGORY_KEYS = ('STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER')


def _classify_satellite(name: str) -> str:
    """Mirror of Globe.ts classifySatellite() — must stay in sync."""
    n = name.upper()
    if n.startswith('STARLINK'):
        return 'STARLINK'
    if n.startswith('GPS') or 'NAVSTAR' in n or n.startswith('BIIF') or n.startswith('BIII'):
        return 'GPS'
    if n.startswith('IRIDIUM'):
        return 'IRIDIUM'
    if ' DEB' in n or n.endswith(' DEB') or 'DEBRIS' in n or 'R/B' in n or 'ROCKET BODY' in n:
        return 'DEBRIS'
    return 'OTHER'


_ALLOWED_ORIGINS = [
    'https://getsatlas.vercel.app',
    'http://localhost:5173',
    'http://localhost:4173',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.on_event('startup')
async def startup_event() -> None:
    run_migrations()
    asyncio.create_task(refresh_loop())


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    hours_ahead: int = Query(24, ge=1, le=168),
) -> dict[str, list[dict]]:
    try:
        return {'passes': predict_passes(latitude, longitude, hours_ahead)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/satellite-categories')
async def get_satellite_categories() -> dict[str, int]:
    try:
        catalog = await get_satellites()
        counts: dict[str, int] = {k: 0 for k in _CATEGORY_KEYS}
        for sat in catalog:
            if sat.get('norad_id') == ISS_NORAD_ID:
                continue
            counts[_classify_satellite(sat.get('name', ''))] += 1
        return counts
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Category count failed: {e}')


@app.get('/tle/iss')
async def get_iss_tle_endpoint() -> dict[str, str]:
    try:
        return await get_iss_tle()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'ISS TLE fetch failed: {e}')


@app.get('/satellites-overhead')
async def get_satellites_overhead(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(2000.0, ge=0, le=20000),
) -> list[dict]:
    try:
        catalog = await get_satellites()
        return satellites_overhead(catalog, latitude, longitude, radius_km)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Overhead query failed: {e}')


@app.get('/satellite-info')
async def get_satellite_info(
    query: str = Query(..., description='Satellite name (substring) or NORAD catalog ID'),
) -> dict:
    try:
        catalog_result, iss_tle_result = await asyncio.gather(
            get_satellites(), get_iss_tle(), return_exceptions=True
        )
        if isinstance(catalog_result, Exception):
            raise catalog_result
        fresh_tles = {}
        if not isinstance(iss_tle_result, Exception):
            fresh_tles[ISS_NORAD_ID] = iss_tle_result
        result = satellite_info(catalog_result, query, fresh_tles if fresh_tles else None)
        if result is None:
            raise HTTPException(status_code=404, detail=f'Satellite not found: {query}')
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Satellite info query failed: {e}')
```

- [ ] **Step 2: Run all orbital tests**

```bash
cd apps/orbital
python -m pytest -v
```

Expected: all tests pass (health endpoint test still works; /satellites endpoint tests removed from test file in Task 3).

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/orbital/main.py
git commit -m "feat(orbital): add Sentry, startup catalog refresh, remove /satellites endpoint"
```

---

## Task 5: DB migration files

- [ ] **Step 1: Create migration SQL**

```bash
mkdir -p apps/orbital/migrations
```

Create `apps/orbital/migrations/001_initial.sql`:

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

- [ ] **Step 2: Create db.py**

Create `apps/orbital/db.py`:

```python
import logging
import os

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    """Run SQL migrations. Silently skips if DATABASE_URL is not set (local dev)."""
    url = os.environ.get('DATABASE_URL')
    if not url:
        return

    try:
        import psycopg2
        migration_path = os.path.join(os.path.dirname(__file__), 'migrations', '001_initial.sql')
        with open(migration_path) as f:
            sql = f.read()
        conn = psycopg2.connect(url)
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            logger.info('Migrations applied.')
        finally:
            conn.close()
    except Exception as exc:
        logger.error('Migration failed: %s', exc)
```

- [ ] **Step 3: Run tests**

```bash
cd apps/orbital
python -m pytest -v
```

Expected: all pass (db.py is tested indirectly via startup; no DATABASE_URL in test env → migration skipped silently).

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/orbital/migrations/ apps/orbital/db.py
git commit -m "feat(orbital): DB migration runner + subscribers schema"
```

---

## Task 6: Terraform Wave 2 — VPC + ECS + ALB

- [ ] **Step 1: Write vpc.tf**

Create `infra/terraform/vpc.tf`:

```hcl
data "aws_availability_zones" "available" { state = "available" }

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "${var.app_name}-vpc" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${var.app_name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${var.app_name}-private-${count.index}" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.app_name}-igw" }
}

resource "aws_eip" "nat" { domain = "vpc" }

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
  tags          = { Name = "${var.app_name}-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; gateway_id = aws_internet_gateway.main.id }
  tags = { Name = "${var.app_name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route { cidr_block = "0.0.0.0/0"; nat_gateway_id = aws_nat_gateway.main.id }
  tags = { Name = "${var.app_name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "alb" {
  name   = "${var.app_name}-alb"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 80; to_port = 80; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0;  to_port = 0;  protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "ecs" {
  name   = "${var.app_name}-ecs"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 8000; to_port = 8000; protocol = "tcp"; security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "rds" {
  name   = "${var.app_name}-rds"
  vpc_id = aws_vpc.main.id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.ecs.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}
```

- [ ] **Step 2: Write ecs.tf**

Create `infra/terraform/ecs.tf`:

```hcl
resource "aws_ecs_cluster" "main" {
  name = var.app_name
}

resource "aws_cloudwatch_log_group" "orbital" {
  name              = "/ecs/${var.app_name}-orbital"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "orbital" {
  family                   = "${var.app_name}-orbital"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_exec.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "orbital"
    image     = "${aws_ecr_repository.orbital.repository_url}:latest"
    essential = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment = [
      { name = "CATALOG_BUCKET", value = "${var.app_name}-catalog" }
    ]
    secrets = [
      { name = "SPACETRACK_USER", valueFrom = aws_secretsmanager_secret.app["SPACE_TRACK_USER"].arn },
      { name = "SPACETRACK_PASS", valueFrom = aws_secretsmanager_secret.app["SPACE_TRACK_PASS"].arn },
      { name = "SENTRY_DSN",      valueFrom = aws_secretsmanager_secret.app["SENTRY_DSN"].arn },
      { name = "DATABASE_URL",    valueFrom = aws_secretsmanager_secret.app["DATABASE_URL"].arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.orbital.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "orbital"
      }
    }
  }])
}

resource "aws_ecs_service" "orbital" {
  name            = "${var.app_name}-orbital"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.orbital.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.orbital.arn
    container_name   = "orbital"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}
```

- [ ] **Step 3: Write alb.tf**

Create `infra/terraform/alb.tf`:

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
    type             = "forward"
    target_group_arn = aws_lb_target_group.orbital.arn
  }
}

output "alb_dns" {
  value = aws_lb.main.dns_name
}
```

- [ ] **Step 4: Validate + plan**

```bash
cd infra/terraform
terraform validate
terraform plan -out=wave2.tfplan
```

Expected: plan shows ~20 new resources (VPC, subnets, IGW, NAT, route tables, SGs, ECS cluster, task def, service, ALB, target group, listener, log group).

- [ ] **Step 5: Push Docker image first (ECS needs it to start)**

```bash
cd ../..  # repo root
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI=$ACCOUNT_ID.dkr.ecr.ap-southeast-2.amazonaws.com/satlas-orbital

aws ecr get-login-password --region ap-southeast-2 | \
  docker login --username AWS --password-stdin $ECR_URI

docker build -t $ECR_URI:latest apps/orbital/
docker push $ECR_URI:latest
```

Expected: `latest: digest: sha256:... size: ...`

- [ ] **Step 6: Apply Wave 2**

```bash
cd infra/terraform
terraform apply wave2.tfplan
```

Expected: ~20 resources created. Note the `alb_dns` output value.

- [ ] **Step 7: Verify /health**

```bash
ALB_DNS=$(terraform output -raw alb_dns)
# Wait ~2 min for ECS task to start and pass health checks
sleep 120
curl http://$ALB_DNS/health
```

Expected: `{"status":"ok"}`

If 502: ECS task hasn't started yet. Check CloudWatch logs:
```bash
aws logs tail /ecs/satlas-orbital --follow
```

- [ ] **Step 8: Commit Wave 2**

```bash
cd ../..
git add infra/terraform/vpc.tf infra/terraform/ecs.tf infra/terraform/alb.tf
git commit -m "feat(infra): Terraform Wave 2 — VPC, ECS Fargate, ALB"
```

---

## Task 7: Terraform Wave 3 — S3 + CloudFront + RDS

- [ ] **Step 1: Write s3.tf**

Create `infra/terraform/s3.tf`:

```hcl
resource "aws_s3_bucket" "catalog" {
  bucket = "${var.app_name}-catalog"
}

resource "aws_s3_bucket_public_access_block" "catalog" {
  bucket                  = aws_s3_bucket.catalog.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_cors_configuration" "catalog" {
  bucket = aws_s3_bucket.catalog.id
  cors_rule {
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
  }
}

resource "aws_s3_bucket_policy" "catalog" {
  bucket     = aws_s3_bucket.catalog.id
  depends_on = [aws_s3_bucket_public_access_block.catalog]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.catalog.arn}/*"
    }]
  })
}
```

- [ ] **Step 2: Write cloudfront.tf**

Create `infra/terraform/cloudfront.tf`:

```hcl
resource "aws_cloudfront_distribution" "catalog" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Satlas TLE catalog"

  origin {
    domain_name = aws_s3_bucket.catalog.bucket_regional_domain_name
    origin_id   = "s3-catalog"
    s3_origin_config { origin_access_identity = "" }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-catalog"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 7200
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.catalog.domain_name
}
```

- [ ] **Step 3: Write rds.tf**

Create `infra/terraform/rds.tf`:

```hcl
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = var.app_name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier             = var.app_name
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp2"
  db_name                = "aussiesky"
  username               = "aussiesky"
  password               = random_password.db.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  publicly_accessible    = false
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.app["DATABASE_URL"].id
  secret_string = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
}
```

- [ ] **Step 4: Validate + plan**

```bash
cd infra/terraform
terraform validate
terraform plan -out=wave3.tfplan
```

Expected: plan shows S3 bucket + policy + CORS, CloudFront distribution, RDS instance, subnet group, secret version.

- [ ] **Step 5: Apply Wave 3** (RDS takes ~10 min)

```bash
terraform apply wave3.tfplan
```

Expected: resources created. Note `cloudfront_domain` output.

- [ ] **Step 6: Force ECS redeploy to pick up DATABASE_URL**

```bash
aws ecs update-service \
  --cluster satlas \
  --service satlas-orbital \
  --force-new-deployment \
  --region ap-southeast-2
```

Wait ~3 min for new task to start.

- [ ] **Step 7: Verify catalog on CloudFront**

```bash
CF_DOMAIN=$(terraform output -raw cloudfront_domain)
# ECS startup writes catalog.tle — wait a couple minutes after ECS restart
curl -s "https://$CF_DOMAIN/catalog.tle" | head -3
```

Expected: three lines of 3LE data (name, TLE line 1, TLE line 2).

- [ ] **Step 8: Verify RDS**

```bash
DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id satlas/DATABASE_URL \
  --query SecretString --output text)
psql "$DB_URL" -c '\dt'
psql "$DB_URL" -c '\dx'
```

Expected: `subscribers` table listed; `vector` extension listed.

- [ ] **Step 9: Commit Wave 3**

```bash
cd ../..
git add infra/terraform/s3.tf infra/terraform/cloudfront.tf infra/terraform/rds.tf
git commit -m "feat(infra): Terraform Wave 3 — S3 catalog bucket, CloudFront, RDS PostgreSQL"
```

---

## Task 8: Frontend — use CloudFront as primary catalog source

- [ ] **Step 1: Update celestrak.ts**

In `apps/web/src/lib/celestrak.ts`, change line 19:

```typescript
// Before:
const CATALOG_API_URL = '/api/catalog'

// After:
const CATALOG_API_URL = import.meta.env.VITE_CATALOG_URL || '/api/catalog'
```

That's the only code change. `fetchFromApi()` already uses `CATALOG_API_URL`.

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:

```bash
# CloudFront distribution URL for satellite TLE catalog (set in Vercel env vars for production)
# Leave blank for local dev (falls back to /api/catalog Vercel function)
VITE_CATALOG_URL=
```

- [ ] **Step 3: Run frontend tests**

```bash
cd apps/web
npm run test:run
```

Expected: all tests pass (VITE_CATALOG_URL not set in test env → falls back to `/api/catalog` → existing test mocks still work).

- [ ] **Step 4: Set VITE_CATALOG_URL in Vercel**

In Vercel dashboard → satlas project → Settings → Environment Variables:
- Name: `VITE_CATALOG_URL`
- Value: `https://<cloudfront_domain_from_step_7_above>/catalog.tle`
- Environment: Production

Trigger a Vercel redeploy (push a commit or manually redeploy).

- [ ] **Step 5: Verify globe shows 30k+ satellites**

Open `https://getsatlas.vercel.app` and check the satellite count badge. Expected: 25,000–30,000 satellites.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add apps/web/src/lib/celestrak.ts .env.example
git commit -m "feat(web): use VITE_CATALOG_URL for CloudFront catalog, fallback to /api/catalog"
```

---

## Task 9: Sentry setup + verify

- [ ] **Step 1: Create Sentry project**

Go to sentry.io → Create Project → Python → name it `satlas-orbital`.  
Copy the DSN (looks like `https://abc123@o123456.ingest.sentry.io/789012`).

- [ ] **Step 2: Update SENTRY_DSN secret**

```bash
aws secretsmanager put-secret-value \
  --secret-id satlas/SENTRY_DSN \
  --secret-string "https://abc123@o123456.ingest.sentry.io/789012"
```

Force ECS redeploy to pick up the new secret:
```bash
aws ecs update-service \
  --cluster satlas \
  --service satlas-orbital \
  --force-new-deployment \
  --region ap-southeast-2
```

- [ ] **Step 3: Verify Sentry receives an error**

```bash
ALB_DNS=$(cd infra/terraform && terraform output -raw alb_dns)
curl http://$ALB_DNS/nonexistent-route-that-does-not-exist
```

Expected: 404 JSON response from FastAPI. Check Sentry dashboard — a `404 Not Found` event should appear within ~1 min.

---

## Task 10: Railway decommission + update VITE_ORBITAL_SERVICE_URL + docs

- [ ] **Step 1: Update VITE_ORBITAL_SERVICE_URL in Vercel**

In Vercel dashboard → Settings → Environment Variables:
- Update `VITE_ORBITAL_SERVICE_URL` value from Railway URL to: `http://<alb_dns_name>`

Trigger redeploy.

- [ ] **Step 2: Verify AI chat still works**

Open getsatlas.vercel.app → click the chat button → ask "Where is ISS right now?".
Expected: agent calls the satellite info tool and returns a real position.

- [ ] **Step 3: Delete Railway service**

In Railway dashboard: select `apps/orbital` service → Settings → Delete Service.

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run  # from apps/web
cd apps/orbital && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 5: Update CLAUDE.md active scope + add ADR entries**

In `CLAUDE.md`, update the Active scope section:

```markdown
**Current phase:** Session 16 complete — AWS Foundation. ECS Fargate serving orbital API, 
Space-Track 30k+ TLEs cached in S3+CloudFront, RDS PostgreSQL ready for subscribers, 
Sentry error monitoring live, Railway decommissioned.

**Next milestone:** Session 17 — Visual Overhaul (cloud layer, NASA star map, Astronomia sun, satellite trails).
```

Add ADR entries for: OIDC-based CI auth, Space-Track 3LE format choice, S3+CloudFront catalog architecture, HTTP-only ALB (no custom domain yet), DATABASE_URL from Terraform random_password.

- [ ] **Step 6: Create session-17-bootstrap.md**

Create `docs/session-17-bootstrap.md` with the Session 17 goal (Visual Overhaul) from `docs/superpowers/specs/2026-05-15-v1-platform-upgrade-design.md` Section "Session 17".

- [ ] **Step 7: Final commit**

```bash
git add CLAUDE.md docs/session-17-bootstrap.md
git commit -m "docs: session 16 complete — update CLAUDE.md scope, add ADRs, session-17 bootstrap"
```

---

## Verification checklist (final)

- [ ] `aws ecr list-images --repository-name satlas-orbital` shows an image
- [ ] `curl http://<ALB_DNS>/health` returns `{"status":"ok"}`
- [ ] `curl https://<CF_DOMAIN>/catalog.tle | head -3` returns 3LE data in <1s
- [ ] Globe shows 25k+ satellite count
- [ ] `psql $DATABASE_URL -c '\dt'` shows subscribers table
- [ ] `psql $DATABASE_URL -c '\dx'` shows vector extension
- [ ] CI: push to main triggers ecr-push job (green)
- [ ] Sentry: 404 on nonexistent route appears in dashboard
- [ ] Railway service deleted
- [ ] AI chat responds correctly (calls ECS orbital service via ALB)
