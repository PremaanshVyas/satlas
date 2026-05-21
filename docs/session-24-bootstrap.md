# Session 24 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 24 complete.** V1 polish backlog fully cleared — all three items shipped in one session:

- **Pulsing green dot** — SatInfoCard header shows a `animate-ping` green dot left of the NORAD ID when `opsStatus` is `+` or `tracked`. Same condition that was already colouring the Status text green.
- **Compass rose SVG** — PassPanel pass rows replaced the plain "NW" direction text with a 34px SVG dial. `CompassRose` component maps 16 compass points (N, NNE, NE … NNW) to rotation angles; blue triangle needle + text label below. No external library — pure SVG + Tailwind.
- **ApiDocs footer** — `/docs` page now has a footer with ← Globe link, GitHub repo link, and "Satlas · open-source space situational awareness" tagline.

75/75 Vitest tests passing, tsc clean, pushed to main, Vercel auto-deployed.

**Env vars state on Vercel (unchanged):**
- `ORBITAL_SERVICE_URL = https://api.satlas.app` ✅
- `VITE_CATALOG_URL` — NOT set (hardcoded CloudFront fallback, fine)
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

## Session 25 direction

V1 is fully shipped and polished. Next session: discuss which V2 track to start.

Options (in rough portfolio-impact order):
1. **Vision pipeline** — Sentinel-2 bushfire scar detection. PyTorch + Hugging Face, S3 imagery cache. Highest narrative impact ("Australian-relevant, ML demo").
2. **Orbit history / TimescaleDB** — store satellite positions over time, plot ground tracks. Extends the orbital service.
3. **Go API gateway** — thin proxy in front of the Vercel functions. Adds language breadth; lower narrative value.
4. **More agent tools** — conjunction warnings, re-entry predictions, launch schedule feed.

Mickey decides direction at session start.

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
- **NORAD ID comparisons: use integer equality** — string equality fails on leading-zero format differences.

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.
