# Session 13 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Aussie Sky — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 12):

WHAT'S LIVE at https://aussie-sky.vercel.app:
- All Session 11 features remain live (see session-12-bootstrap.md for full list)
- Hover/select dot highlight: hovered and selected catalog satellites turn lime green (0x4ade80). SatelliteField.mat is always white; all colouring via instanceColor. Globe.refreshInstanceColor(idx) applies HIGHLIGHT_COLOR when idx is hovered or selected. Click-when-hovering fix: onCanvasClick short-circuits to hoveredIdx if set — no need to be pixel-perfect on the dot if the tooltip is already showing.
- CI/CD now wired up: GitHub Actions .github/workflows/ci.yml with 4 jobs:
  * web: lint (ESLint) + build (tsc + vite) + test (vitest) on Node 20
  * api-typecheck: npx tsc --noEmit at root (checks api/chat.ts via root tsconfig.json)
  * orbital-test: pytest on Python 3.11
  * orbital-docker: docker build apps/orbital
  * Triggers on push to main AND on pull_request to main
- CORS restricted: allow_origins was ['*'], now ['https://aussie-sky.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
- ESLint clean: 3 errors fixed (onSatelliteClickRef moved into useLayoutEffect; 2 intentional setState-in-effect patterns got eslint-disable-next-line)
- Tests: 87 pytest + 39 Vitest — all green; tsc clean; lint clean; vite build clean

KEY TECHNICAL STATE (unchanged from session 12):
- Same as session-12-bootstrap.md KEY TECHNICAL STATE block

ARCHITECTURE RULE — ENFORCE STRICTLY:
(same as session-12-bootstrap.md)

SESSION 13 GOALS (priority order):
1. README update: update Engineering Notes section to reflect final set_category_filter design and CI/CD workflow. The "Group highlight (Session 11)" entry in the README roadmap is stale — should say "Agent-controlled category filter". Update local dev instructions if they are still placeholders.
2. Verify CI passes on GitHub: after pushing the ci.yml, confirm all 4 jobs are green on the Actions tab.
3. V1 features: discuss and prioritise — candidates are search/filter UI, public API with docs, or rate limiting. See CLAUDE.md roadmap for V1 scope.
```
