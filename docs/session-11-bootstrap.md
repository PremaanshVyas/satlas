# Session 11 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Satlas — a real-time 3D satellite tracker with an AI agent chat interface.
Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 10 + ISS hotfix):

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
- ISS click/hover fix: Globe checks ISS dot position FIRST before the catalog buffer — docked
  modules (Unity/Destiny/etc.) no longer hijack the pick; always resolves to ISS (ZARYA) / 25544
- Collapsible AI chat: floating chat button (bottom-right) opens a 320px right-side overlay panel;
  shows reply-count badge when closed
- AI agent chat (Claude API, tool use, multi-turn history)
- 4 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info
- UTC clock + satellite count overlays (top-left / top-right)
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 77 pytest + 33 Vitest — all green

KEY TECHNICAL STATE:
- Globe.ts: full-screen canvas (absolute inset-0). Click handler checks ISS first (radius 0.008),
  then iterates catalog buffer with dynamic dot-radius threshold. Hover handler same order, sentinel
  hoveredIdx=-2 for ISS to avoid re-firing. issName captured from catalog (NORAD 25544 name field),
  falls back to 'ISS (ZARYA)'.
- Category classification: classifySatellite(name) → STARLINK/GPS/IRIDIUM/DEBRIS/OTHER. Mask
  rebuilt on Globe.setActiveCategories(). SatelliteField.update(buffer, mask) hides via scale(0).
- Ground track: showGroundTrack(idx) — satellite.js on main thread, 180-pt ECI arc rotated by GMST,
  sky-blue LineLoop. Recomputes every 60s. Clears on empty-space click or catalog refresh.
- App.tsx layout: `relative w-screen h-screen`. GlobeView fills it. AgentPanel is absolute right-0,
  w-80, h-full — only rendered when chatOpen=true. Satellite info card: absolute top-10 left-3.
- useGlobe returns: { isLoading, satelliteCount, hoverInfo, setActiveCategories }
- Coordinate system (unchanged): prime meridian → +X, north → +Y, 90°E → −Z

ARCHITECTURE RULE — ENFORCE STRICTLY:
The AI chatbot is a PRESENTER, not an info generator.
- It NEVER computes, infers, or guesses any data value (positions, altitudes, pass times, offsets).
- It ONLY presents values that come from backend tool results or pre-computed server-side values.
- The satellite info card (shown on globe click) provides name + NORAD ID from local data — no AI.
- The "Ask AI" button then opens the chat and prefills "Tell me about NORAD <id> (<name>)" so the
  backend does an exact get_satellite_info lookup. Claude formats the tool result, nothing more.
- If data is missing from the tool result, Claude says "unavailable" — never fills it in.
- Violation example: letting Claude compute a timezone offset or infer a pass time. Always wrong.
  Fix pattern: compute server-side, pass the answer to Claude to format.

SESSION 11 GOALS (priority order):
1. Agent group-highlight tool: highlight_catalog_group(category) — Claude says "show all Starlink
   satellites" and all Starlink dots change colour. Requires: new Python tool in orbital service +
   frontend Globe.setGroupHighlight(category, color) that writes an instanceColor buffer to the
   InstancedMesh (THREE.InstancedMesh supports per-instance colour via instanceColor attribute).
2. CHANGELOG + README polish: update public-facing docs to reflect the full Session 10 UI.
3. Deployment health check: confirm Vercel and Railway are healthy post-session.
4. Stretch: agent tool for listing satellites by category count ("how many Starlink satellites are
   tracked?") — can be answered from the frontend classifySatellite data without a backend call,
   but if routed through the agent it needs a tool so Claude doesn't guess.
```
