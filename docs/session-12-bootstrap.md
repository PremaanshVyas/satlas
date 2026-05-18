# Session 12 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Satlas — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 11 + all post-session fixes):

WHAT'S LIVE at https://satlas.vercel.app:
- Full-screen 3D globe (Three.js, NASA 8K day + 3.6K night textures, GLSL day/night shader)
- Atmospheric rim glow, 8,000-star background
- ~9,000–10,000 live satellites from CelesTrak/space-track (30-min catalog cache + stale fallback)
- ISS: yellow dot + orbital ring (ECI+GMST) + pulse on agent highlight. Separate 5-min TLE cache.
- Catalog satellites as blue InstancedMesh at actual orbital altitude (LEO/MEO/GEO shells distinct)
- Hover tooltip: cursor near any dot → floating label with satellite name + altitude km (40ms throttle)
- Category filter pills (bottom-center): STARLINK / GPS / IRIDIUM / DEBRIS / OTHER — toggles a
  Uint8Array mask in SatelliteField.update(); hidden satellites also excluded from click/hover loops
- Click-to-select: shows top-left info card (name + NORAD ID + "Ask AI" button); also draws a
  sky-blue ECI+GMST orbit arc (LineLoop) for the selected satellite; clears on empty-space click
- ISS click/hover fix: Globe checks ISS dot position FIRST before catalog buffer
- Collapsible AI chat: floating chat button (bottom-right) opens a 320px right-side overlay panel
- Agent-controlled category filter: "show Starlink" → Starlink pill activates, dots colour violet.
  "Show Starlink and GPS" → both on, each coloured. "Also show GPS" → additive (adds to current).
  "Only show debris" → exclusive replace. Manual pill toggle clears agent colours (back to blue).
  Current filter state sent with every chat request so agent knows what's already showing.
- Category counts: "how many GPS satellites?" → calls live /satellite-categories endpoint
- AI agent chat (Claude API, tool use, multi-turn history)
- 6 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info,
  set_category_filter, get_category_counts
- UTC clock + satellite count overlays (top-left / top-right)
- localStorage catalog cache: key `satlas-catalog-v1`, 30-min TTL. Repeat visits load instantly
  from cache; background refresh fires for next-visit freshness. First-time visitors wait on cold start.
- Globe renders immediately on first animation frame (ISS-only) without waiting for catalog
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 87 pytest + 39 Vitest — all green; tsc clean

KEY TECHNICAL STATE:
- SatelliteField.setCategoryColors(catMap: string[], catColors: Record<string, THREE.Color> | null):
  catColors=null → mat=DEFAULT_COLOR, all instanceColor=WHITE (back to blue).
  catColors set → mat=white, each instance gets its category colour.
  instanceColor pre-inited to WHITE in constructor (buffer always live — no VAO rebinding bugs).
- Globe.applyAgentFilter(categories: SatCategory[]): sets activeCategories + category colours.
  Stores agentFilterCategories for re-apply after catalog refresh.
- Globe.setActiveCategories(cats): manual path — clears agentFilterCategories, clears colours.
- shownCategories passed in POST body to /api/chat; system prompt includes currently shown list.
  Agent rules: "show X" (no "only") = ADD to current; "only show X" = REPLACE; always call tool.
- __SET_FILTER__:{"categories":[...]} wire directive, parsed by useChat.ts into SetFilterDirective.
  Applied in GlobeView via applyAgentFilter (not setActiveCategories — that would clear colours).
  onCategoriesChange callback keeps App.tsx shownCategories in sync for next chat message.
- GROUP_HIGHLIGHT_COLORS: STARLINK=0xa78bfa, GPS=0x34d399, IRIDIUM=0x38bdf8,
  DEBRIS=0xf87171, OTHER=0xfbbf24.
- celestrak.ts fetchCatalogFromNetwork: NO AbortController timeout — Railway cold starts can take
  40-60s; a 35s timeout was silently aborting fetches → zero satellites. Browser handles the
  connection lifecycle. Cache (localStorage) handles the performance case.
- Globe.mount() calls onReady via requestAnimationFrame so the globe canvas is visible on the
  first frame — the catalog load runs in parallel and does not block the initial render.

ARCHITECTURE RULE — ENFORCE STRICTLY:
The AI chatbot is a PRESENTER, not an info generator.
Claude must not compute, infer, or guess any data value. Every value must come from a tool result
or pre-computed server-side value. This is enforced at three layers:
  1. System prompt: explicit rules forbidding self-computed values, mandatory tool calls.
  2. UI: satellite info card shows name + NORAD ID from local data — no AI call on click.
     "Ask AI" button prefills the chat so the backend does an exact NORAD ID lookup.
  3. Wire format: presenter-only means Claude formats tool output, never originates data.

SESSION 12 GOALS (priority order):
1. CI/CD: GitHub Actions workflow — lint + type-check + vitest on PR; pytest on PR; Docker build
   for orbital service. This makes the project look production-ready to interviewers.
2. Deployment health check: confirm Vercel + Railway are healthy after latest deploy.
3. tsc check on api/: `cd api && npx tsc --noEmit` — make sure chat.ts is clean.
4. Stretch: Restrict CORS in the orbital service to the Vercel production domain now that MVP is live.
5. Stretch: README and README engineering notes update to reflect the final set_category_filter design.
```
