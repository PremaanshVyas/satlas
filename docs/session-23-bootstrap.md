# Session 23 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 22 complete + hotfixes shipped.** Domain + HTTPS + several pass/info-card fixes:

- `satlas.app` live; `api.satlas.app` → ALB with HTTPS; HTTP→HTTPS redirect
- Pass prediction boundary fix (boundary passes were silently dropped by skyfield edge case)
- SatInfoCard metadata fixed (hardcoded CloudFront fallback — `VITE_CATALOG_URL` was never set in Vercel)
- AI no longer contradicts tool data on satellite tracking status (Cosmos 574 issue)
- Location search shows "City, Country" after selection for disambiguation
- Pass list scroll fixed (`max-h-[50dvh] overflow-y-auto`)

**Env vars state on Vercel (as of end of session 22):**
- `ORBITAL_SERVICE_URL = https://api.satlas.app` ✅ (renamed from old `VITE_ORBITAL_URL`)
- `VITE_CATALOG_URL` — NOT set (code now has hardcoded CloudFront fallback, so this is fine)
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

## Session 23 priorities

1. **Pass prediction — investigate "missing" passes before first upcoming pass.**
   Mickey reports only seeing passes at 3am+ and expects earlier ones. Investigation needed:
   - The ISS had passes at 10:34am and 12:13pm AEST today — both already past when he checked.
     The prediction correctly shows upcoming passes only (starts from `_ts.now()`).
   - However, he insists passes are missing. Possible root causes to investigate:
     a. He's comparing to another tracker (Heavens Above, NASA) that shows lower-elevation passes
        (< 10°). Consider lowering `altitude_degrees` from 10° to 0° in `passes.py`.
     b. He opened the panel AFTER the last pass of the day and the "gap" (12pm → 3am next day)
        looks wrong — may want to show "Next pass in X hours" prominently.
     c. Scroll still not working on his device and he only sees 1 pass.
   - **Don't change TLE logic** — the current fresh TLE is correct.

2. **Polish backlog:**
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

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.
