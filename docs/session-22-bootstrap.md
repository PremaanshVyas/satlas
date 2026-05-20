# Session 22 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 21 complete.** One goal shipped:

1. **Public API docs page** — `getsatlas.vercel.app/docs`. Documents three public endpoints (GET /api/catalog, GET /api/pass, POST /api/chat) with parameter tables, curl examples, and response samples. Dark glass aesthetic matching the globe. React Router added (`react-router-dom` v7); `main.tsx` wraps app in `<BrowserRouter>` with `/` → App and `/docs` → ApiDocs routes. Vercel SPA rewrite (`/((?!api/).*)` → `/index.html`) so hard-refresh on `/docs` works. "API" pill button sits to the right of the search bar in GlobeView, styled as a matching glass pill. Global `overflow: hidden` moved off `html, body, #root` and scoped to App's root div so `/docs` can scroll.

**Bug caught by code review before ship:** first pass documented `/api/pass` with `norad/lat/lon/hours` — actual handler uses `norad_id/latitude/longitude/hours_ahead`. Fixed before push.

**Test counts:** 75 frontend Vitest tests, 87 Python pytest tests. tsc clean. lint clean.

---

## Live stack

| Layer | URL / resource |
|-------|---------------|
| Frontend | `https://getsatlas.vercel.app` |
| API docs | `https://getsatlas.vercel.app/docs` |
| ALB (orbital API) | `http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com` |
| CloudFront catalog | `https://dgsll6twimcwl.cloudfront.net/catalog.tle` |
| CloudFront satcat | `https://dgsll6twimcwl.cloudfront.net/satcat.json` |

---

## Session 22 priorities

1. **Domain registration + HTTPS on ALB** — register `satlas.app` (or a viable alternative), provision an ACM certificate in `ap-southeast-2`, add an HTTPS listener to the ALB, update CORS origins in the orbital service, and update `VITE_ORBITAL_SERVICE_URL` on Vercel to point at the new HTTPS domain.

2. **Polish backlog (lower priority):**
   - Pulsing green dot for active satellites in SatInfoCard
   - Compass rose SVG for pass direction in PassPanel
   - `/docs` page: link in the footer or nav so it's discoverable without knowing the search-bar pill

---

## Key files changed in Session 21

| File | What changed |
|------|-------------|
| `apps/web/src/pages/ApiDocs.tsx` | New — full API docs page component |
| `apps/web/src/pages/ApiDocs.test.tsx` | New — 7 tests covering heading, endpoints, badges, base URL label |
| `apps/web/src/main.tsx` | Added BrowserRouter + Routes wrapping |
| `apps/web/src/components/GlobeView.tsx` | Added Link import + "API" pill to the right of SearchBar |
| `apps/web/src/App.tsx` | Changed `overflow-x-hidden` → `overflow-hidden` on root div |
| `apps/web/src/index.css` | Removed `overflow: hidden` from `html, body, #root` global rule |
| `vercel.json` | Added SPA rewrite: `/((?!api/).*)` → `/index.html` |

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
```

The AI agent (`/api/chat`) is still the primary interface. Tool calls: `get_satellite_info`, `predict_passes`, `find_satellites_overhead`, `highlight_on_globe`, `set_category_filter`.

---

## Important rules (don't violate)

- **Claude is the presenter, never the calculator.** Every data value shown to the user must come from a backend tool result.
- **Never call CelesTrak from server/cloud context.** Always route through the ALB or the CloudFront catalog.
- **Docker for ECS: always `--platform linux/amd64`.**
- **Haiku for tool-detection, Sonnet for streaming answer** (Vercel Hobby 10s cap).
- **`overflow: hidden` on App's root div, not globally** — the docs page needs to scroll.
- **Any `<Link>` in the render tree requires `MemoryRouter` in tests.**

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.

For full project context and all ADR entries, see `CLAUDE.md` (auto-read by Claude Code) and `docs/decisions-archive.md`.
