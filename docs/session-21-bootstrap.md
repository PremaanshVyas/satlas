# Session 21 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 20 complete.** All three Session 20 goals were shipped:

1. **PassPanel** — full satellite pass prediction UI. Geolocation auto-requests on open; falls back to manual search. Reverse geocoding via Nominatim shows the detected city name. Autocomplete dropdown while typing: debounced Nominatim search (300ms), Framer Motion fade/slide, keyboard nav (↑↓ Enter Escape), ARIA roles (`role="listbox"`, `role="option"`), loading spinner.

2. **Satcat metadata fix** — satellite info card now populates owner, launch date, operational status, launch site, international designator. Root cause was CelesTrak's `/pub/satcat.csv` lacking CORS headers (silent browser fetch failure). Fix: ECS writes `satcat.json` to S3 on every catalog refresh cycle; CloudFront serves it; frontend derives URL from `VITE_CATALOG_URL`. Cache key bumped to `satlas-satcat-v3`.

3. **Railway removed** — Railway had a GitHub app integration that auto-deployed on every push. Deleted Railway project in their dashboard; no code changes needed.

**Test counts:** 68 frontend Vitest tests, 87 Python pytest tests. tsc clean. lint clean.

---

## Live stack

| Layer | URL / resource |
|-------|---------------|
| Frontend | `https://getsatlas.vercel.app` |
| ALB (orbital API) | `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com` |
| CloudFront catalog | `https://dgsll6twimcwl.cloudfront.net/catalog.tle` |
| CloudFront satcat | `https://dgsll6twimcwl.cloudfront.net/satcat.json` |

---

## Session 21 priorities

1. **Public API docs page** — a `/api` or `/docs` page on the frontend listing the public endpoints (pass prediction, satellite info, overhead search) with request/response examples. Something recruiters and other developers can find and read.

2. **Domain registration + HTTPS on ALB** — register `satlas.app` (or alternative), add ACM cert, switch ALB listener to HTTPS, update CORS origins and `VITE_ORBITAL_SERVICE_URL` on Vercel.

3. **Polish backlog (lower priority):** ops status colour on info card could show a pulsing green dot for active satellites; pass direction could show a compass rose SVG; the autocomplete could debounce even faster for mobile keyboards.

---

## Key files changed in Session 20

| File | What changed |
|------|-------------|
| `apps/web/src/components/PassPanel.tsx` | Added full autocomplete (Nominatim debounced, Framer Motion dropdown, keyboard nav, ARIA) |
| `apps/web/src/components/PassPanel.test.tsx` | 14 tests total; 4 new for autocomplete (dropdown display, click-to-select, keyboard nav, Escape dismiss) |
| `apps/web/src/lib/satcat.ts` | Rewrote — source switched from CelesTrak CSV to Space-Track JSON via CloudFront; SATCAT_URL derived from VITE_CATALOG_URL; added OWNER_MAP, SITE_MAP, parseSatcatJson |
| `apps/web/src/components/SatInfoCard.tsx` | Updated opsStatus colour logic to handle both legacy codes (+/D) and new 'tracked'/'decayed' values |
| `apps/orbital/satellites.py` | Added `_fetch_space_track_satcat()`, `_s3_put_satcat()`, updated `_s3_refresh()` to write satcat.json alongside catalog.tle |
| `apps/orbital/tests/test_satellites.py` | Added `TestFetchSpaceTrackSatcat` (2 tests) and `TestS3PutSatcat` (3 tests); updated `TestS3Refresh` to patch satcat fetch |

---

## Architecture reminder

```
[ Frontend: React + Three.js + Tailwind ]  →  getsatlas.vercel.app
                |
[ Vercel serverless functions ]            →  /api/chat, /api/catalog, /api/pass
                |
[ ALB → ECS Fargate (orbital service) ]   →  satlas-1659207311.ap-southeast-2.elb.amazonaws.com
                |
[ S3 + CloudFront ]                        →  dgsll6twimcwl.cloudfront.net
                |
[ RDS PostgreSQL (ap-southeast-2) ]        →  not yet used by frontend
```

The AI agent (`/api/chat`) is still the primary interface. Tool calls: `get_satellite_info`, `predict_passes`, `find_satellites_overhead`, `highlight_on_globe`, `get_visible_satellites`.

---

## Important rules (don't violate)

- **Claude is the presenter, never the calculator.** Every data value shown to the user must come from a backend tool result. If data is missing, say unavailable. Never compute positions, offsets, or pass windows from training knowledge.
- **Never call CelesTrak from a server/cloud context.** Their IPs block Vercel functions and ECS. Always route through the ALB or the CloudFront catalog.
- **Haiku for tool-detection, Sonnet for streaming answer.** Vercel Hobby has a 10s hard cap. Tool-detection turn must be fast.
- **Docker images for ECS: always `--platform linux/amd64`.** ECS Fargate is x86_64; M-series Macs build ARM by default.

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.

For full project context and all ADR entries, see `CLAUDE.md` (auto-read by Claude Code) and `docs/decisions-archive.md`.
