# Session 25 Bootstrap — Satlas

Paste this at the start of the next session (or rely on CLAUDE.md auto-read in Claude Code).

---

## Where we left off

**Session 25 complete.** Full frontend redesign — Nothing/Terminal aesthetic across all UI surfaces.

9 files changed, 10 commits, 75/75 tests passing throughout:

- **Design tokens** — JetBrains Mono font, `--color-accent: #00d4ff`, secondary/label/danger/warn tokens via Tailwind v4 `@theme`
- **SatInfoCard** — glass panel, full-word labels, cyan pulsing dot, cyan live lat/lon, object-type badges
- **PassPanel** — compass rose needle recoloured cyan, matching glass shell
- **AgentPanel** — user bubbles cyan-tinted, AI bubbles hairline border, streaming dots cyan, terminal input/send
- **SearchBar** — glass panel shell, dim search icon, terminal dropdown
- **GlobeView** — UTC clock and sat count as bare text overlays (no chips), cyan active pills, "API Docs" label
- **App chrome** — glass chat toggle button (not blue filled), "AI · Assistant" header, tray glass panel
- **ApiDocs** — full monospace terminal page, GET=cyan, POST=amber badges
- **Cleanup** — holistic final review caught leftover `bg-gray-*` in App.tsx (desktop card wrappers, Vaul drawers) and GlobeView.tsx (hover tooltip, loading overlay)

All commits on `main`. Vercel auto-deployed.

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

## Session 26 direction

V1 is fully shipped and polished with a premium UI. Next session: decide which V2 track to start.

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

## Design system (locked in)

Glass panel shell: `bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px]`

Section divider: `border-[rgba(255,255,255,0.04)]`

Tokens: `text-accent` (#00d4ff), `text-secondary` (#888888), `text-label` (#2a2a2a), `text-danger` (#ff4444), `text-warn` (#ffaa00), `font-mono` (JetBrains Mono)

All labels must use full words — never abbreviations (Latitude not LAT, Altitude not ALT, etc.).

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
- **Targeted edits to large files need a final grep** for old-palette classes after the fact.

---

## Repo

`github.com/PremaanshVyas/satlas` — main branch, trunk-based, squash merges.
