# Session 23 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 23 complete.** NORAD ID normalization fix + all session-22 hotfixes shipped:

- `satlas.app` live; `api.satlas.app` → ALB with HTTPS; HTTP→HTTPS redirect
- Pass prediction boundary fix (boundary passes were silently dropped by skyfield edge case)
- SatInfoCard metadata fixed (hardcoded CloudFront fallback — `VITE_CATALOG_URL` was never set in Vercel)
- AI no longer contradicts tool data on satellite tracking status (Cosmos 574 issue)
- Location search shows "City, Country" after selection for disambiguation
- Pass list scroll fixed (`max-h-[50dvh] overflow-y-auto`)
- **NORAD ID leading-zero fix**: `satinfo.py` now uses integer comparison so `query=6707` finds NORAD `06707` (COSMOS 574) instead of falling through to substring name search and matching `STARLINK-36707`. `satcat.ts` pads map keys to 5 digits so `get('06707')` works. Cache bumped to v5.

**Env vars state on Vercel (as of end of session 23):**
- `ORBITAL_SERVICE_URL = https://api.satlas.app` ✅
- `VITE_CATALOG_URL` — NOT set (code has hardcoded CloudFront fallback, fine)
- No manual steps needed at session start.

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

## Session 24 priorities

1. **Polish backlog:**
   - Pulsing green dot for active satellites in SatInfoCard
   - Compass rose SVG for pass direction in PassPanel
   - `/docs` page discoverability — link in footer or nav

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
- **`VITE_CATALOG_URL` not needed in Vercel** — satcat.ts has hardcoded CloudFront fallback.
- **NORAD ID comparisons: use integer equality**, never string equality — leading-zero format differs between TLE catalog and Space-Track.

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.
