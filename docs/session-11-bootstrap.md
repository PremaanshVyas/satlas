# Session 11 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Aussie Sky — a real-time 3D satellite tracker with an AI agent chat interface. Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 10):

WHAT'S LIVE at https://aussie-sky.vercel.app:
- Full-screen 3D globe (Three.js, NASA 8K day + 3.6K night textures, GLSL day/night shader)
- Atmospheric rim glow, 8,000-star background
- ~9,000–10,000 live satellites from CelesTrak/space-track (30-min catalog cache + stale fallback)
- ISS: separate 5-min TLE cache, rendered as yellow dot + orbital ring (ECI+GMST) + pulse on highlight
- Catalog satellites as blue InstancedMesh at actual orbital altitude (LEO/MEO/GEO shells visually distinct)
- Hover tooltip: mousemove over any dot shows satellite name + altitude km in floating tooltip
- Category filter pills (bottom-center): STARLINK / GPS / IRIDIUM / DEBRIS / OTHER — toggling hides/shows subsets via Uint8Array mask in SatelliteField.update()
- Click-to-select: shows top-left info card (name + NORAD ID + "Ask AI" button); also draws orbit arc (ECI+GMST LineLoop, sky-blue) for selected satellite
- Collapsible AI chat: floating button bottom-right opens/closes a 320px right-side overlay panel
- AI agent chat (Claude API, tool use, multi-turn history)
- 4 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info
- UTC clock + satellite count overlays
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 77 pytest + 33 Vitest — all green

KEY TECHNICAL STATE:
- Globe.ts: absolute-positioned full-screen canvas. onSatelliteClick fires → App.tsx sets selectedSat state → info card shown. onSatelliteHover fires (40ms throttle) → useGlobe sets hoverInfo → GlobeView renders tooltip.
- Category classification: classifySatellite(name) in Globe.ts. STARLINK/GPS/IRIDIUM/DEBRIS/OTHER. Mask rebuilt on setActiveCategories() call from GlobeView.
- Ground track: showGroundTrack(idx) computes 180-point ECI arc via satellite.js (main thread, ~2ms), rotates by GMST, renders as sky-blue LineLoop. Clears on empty-space click or catalog refresh. Recomputes every 60s.
- SatelliteField.update(buffer, activeMask?): mask=0 → scale(0,0,0) → hidden instance.
- App.tsx layout: `relative w-screen h-screen`. GlobeView fills it. AgentPanel is absolute right-0, w-80, h-full, only rendered when chatOpen=true. Chat toggle button: absolute bottom-16 right-4.
- useGlobe returns: { isLoading, satelliteCount, hoverInfo, setActiveCategories }
- Coordinate system (unchanged): prime meridian → +X, north → +Y, 90°E → −Z

ARCHITECTURE RULE (enforce strictly) — Claude is PRESENTER ONLY. Never compute, infer, or guess any data value. Every value shown to the user must come from a backend tool result or pre-computed server-side value. If data is missing, say unavailable.

SESSION 11 GOALS (priority order):
1. Agent group-highlight tool: highlight_catalog_group(category) — agent call turns all satellites in a category a different colour (e.g. "show all Starlink satellites" → Starlink dots turn white/yellow). Requires: new Python tool + frontend Globe.setGroupHighlight(category, color) method that updates InstancedMesh material or per-instance colour via instanceColor buffer.
2. CHANGELOG + README polish for portfolio: update public-facing docs to reflect Session 10 UI.
3. Deployment check: verify Vercel and Railway are healthy after Session 10 changes.
4. Consider: agent tool for ground station passes (find_ground_station_passes) — lower priority.
```
