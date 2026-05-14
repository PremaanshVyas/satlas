# Session 12 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Aussie Sky — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 11):

WHAT'S LIVE at https://aussie-sky.vercel.app:
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
- ISS click/hover fix: Globe checks ISS dot position FIRST before the catalog buffer — docked
  modules (Unity/Destiny/etc.) no longer hijack the pick; always resolves to ISS (ZARYA) / 25544
- Collapsible AI chat: floating chat button (bottom-right) opens a 320px right-side overlay panel;
  shows reply-count badge when closed
- Group highlight — agent says "show all Starlink satellites" and all Starlink dots go violet;
  everything else dims to near-black. Uses SatelliteField.setGroupHighlight() with per-instance
  THREE.InstancedMesh colours. Cleared at the start of each new chat message.
  Robust to category filter toggles: instanceColor buffer stays alive from construction (never null).
- Category counts — agent answers "how many GPS satellites?" via new Python /satellite-categories
  endpoint + get_category_counts tool.
- AI agent chat (Claude API, tool use, multi-turn history)
- 6 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info,
  highlight_catalog_group, get_category_counts
- UTC clock + satellite count overlays (top-left / top-right)
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 87 pytest + 39 Vitest — all green; tsc clean

KEY TECHNICAL STATE (Session 11 additions):
- SatelliteField.setGroupHighlight(mask: Uint8Array | null, highlightColor: THREE.Color):
  CORRECT PATTERN: instanceColor buffer is pre-initialised to WHITE in constructor (never null).
  When mask is set: mat.color=white, setColorAt for all instances (highlighted=color, dimmed=0x1e3a5f).
  When null (clear): mat.color=DEFAULT_COLOR (0x60a5fa), setColorAt all instances to WHITE.
  Final dot colour = mat.color × instanceColor. Default: blue × white = blue. No null/non-null VAO transitions.
  DO NOT set mesh.instanceColor = null — this breaks after category filter toggles (VAO rebinding bug).
- Globe.setGroupHighlight(category: SatCategory | null): builds mask from satCategories, calls
  field.setGroupHighlight(). Re-applies after catalog refresh (activeGroupHighlight stored).
  GROUP_HIGHLIGHT_COLORS: STARLINK=0xa78bfa, GPS=0x34d399, IRIDIUM=0x38bdf8, DEBRIS=0xf87171, OTHER=0xfbbf24
- types/chat.ts: GroupHighlightDirective { category: 'STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER' }
- useChat.ts: parseDirectives() handles __HIGHLIGHT__ and __GROUP_HIGHLIGHT__ in one pass.
  Returns { text, highlight, groupHighlight }. Bad JSON → keeps raw text (don't strip).
  Both directives reset to null at start of each sendMessage().
- useGlobe.ts: groupHighlight?: GroupHighlightDirective | null param. Effect watches it, calls
  globe.setGroupHighlight(groupHighlight?.category ?? null). Guard: skips when groupHighlight===undefined.
- api/chat.ts: HIGHLIGHT_GROUP_TOOL + GET_CATEGORY_COUNTS_TOOL added to TOOLS array.
  pendingGroupHighlight stored during tool execution, emitted as __GROUP_HIGHLIGHT__:{...} after text.
  callCategoryCountsService() hits /satellite-categories on Railway.
- main.py: _classify_satellite(name) + _CATEGORY_KEYS + /satellite-categories endpoint.
  MUST stay in sync with Globe.ts classifySatellite(). Rule: STARLINK prefix wins over DEB suffix.

ARCHITECTURE RULE — ENFORCE STRICTLY:
The AI chatbot is a PRESENTER, not an info generator.
[same as session 11 bootstrap — see CLAUDE.md]

SESSION 12 GOALS (priority order):
1. CI/CD: GitHub Actions workflow — lint + type-check + vitest on PR; pytest on PR; Docker build
   for orbital service. This makes the project look production-ready to interviewers.
2. Deployment health check: confirm Vercel + Railway are healthy after Session 11 deploy.
3. tsc check on api/: `cd api && npx tsc --noEmit` — make sure chat.ts is clean.
4. Stretch: Add a loading indicator or toast when the group highlight is activated by the agent
   (subtle UI feedback that the visual change happened, since the chat panel may be closed).
5. Stretch: Restrict CORS in the orbital service to the Vercel production domain now that MVP is live.
```
