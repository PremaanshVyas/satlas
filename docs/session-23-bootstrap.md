# Session 23 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 22 complete.** Domain + HTTPS shipped:

- `satlas.app` registered at Namecheap; NS records delegated to Route 53
- ACM wildcard cert (`*.satlas.app`) issued and attached to ALB HTTPS listener (port 443)
- HTTP port 80 redirects to HTTPS (301)
- `api.satlas.app` → ALB alias; `satlas.app` → Vercel (216.198.79.1); `www.satlas.app` → Vercel CNAME
- CORS updated to allow `https://satlas.app`; 90 Python tests passing
- `https://api.satlas.app/health` → `{"status":"ok"}` ✅; HTTP→HTTPS redirect ✅

**One remaining manual step (do at start of Session 23):**
Update `VITE_ORBITAL_SERVICE_URL` in Vercel env vars from the bare ALB URL to `https://api.satlas.app`, then trigger a redeploy.

---

## Live stack

| Layer | URL / resource |
|-------|---------------|
| Frontend | `https://satlas.app` (also `https://getsatlas.vercel.app`) |
| API docs | `https://satlas.app/docs` |
| ALB (orbital API) | `https://api.satlas.app` |
| CloudFront catalog | `https://dgsll6twimcwl.cloudfront.net/catalog.tle` |
| CloudFront satcat | `https://dgsll6twimcwl.cloudfront.net/satcat.json` |

---

## Session 23 priorities

1. **Manual Step C first** — update `VITE_ORBITAL_SERVICE_URL` to `https://api.satlas.app` in Vercel dashboard + redeploy. Verify chat agent works end-to-end from `satlas.app`.

2. **Polish backlog:**
   - Pulsing green dot for active satellites in SatInfoCard
   - Compass rose SVG for pass direction in PassPanel
   - `/docs` page discoverability — link in footer or nav so it's findable without the search-bar pill

---

## Architecture reminder

```
[ Frontend: React + Three.js + Tailwind ]  →  satlas.app (Vercel)
                |
[ Vercel serverless functions ]            →  /api/chat, /api/catalog, /api/pass
                |
[ ALB → ECS Fargate (orbital service) ]   →  api.satlas.app
                |
[ S3 + CloudFront ]                        →  dgsll6twimcwl.cloudfront.net
```

---

## Important rules (don't violate)

- **Claude is the presenter, never the calculator.**
- **Never call CelesTrak from server/cloud context.**
- **Docker for ECS: always `--platform linux/amd64`.**
- **Haiku for tool-detection, Sonnet for streaming answer** (Vercel Hobby 10s cap).
- **External registrar + Route 53 DNS: use `resource "aws_route53_zone"`, not `data`.**
- **Any `<Link>` in the render tree requires `MemoryRouter` in tests.**

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.
