# Session 10 Bootstrap Prompt

> Copy-paste this at the start of the next session to restore full context instantly.

```
We're working on Satlas — a real-time 3D satellite tracker with an AI agent chat interface. Portfolio project for landing a SWE internship in Australia. Read CLAUDE.md fully before doing anything.

Where we left off (end of Session 9):

WHAT'S LIVE at https://satlas.vercel.app:
- 3D Earth globe (Three.js, NASA 8K day + 3.6K night textures, GLSL day/night shader)
- Atmospheric rim glow (Fresnel shader), 8,000-star background
- ~9,000–10,000 live satellites from CelesTrak/space-track (30-min catalog cache; stale-cache fallback prevents blank globe on source outage)
- ISS: separate 5-min TLE cache via /tle/iss, frontend refreshes every 2 min
- ISS rendered as yellow dot + orbital ring (ECI+GMST) + pulse animation on agent highlight
- Catalog satellites as blue InstancedMesh; satellite heights now use actual propagated altitude (geo.height km → Earth-radii), so LEO/MEO/GEO shells are visually distinct
- Click-to-select: click any catalog dot → agent panel pre-fills "Tell me about NORAD <id> (<name>)" for exact backend lookup
- AI agent chat (Claude API, tool use, multi-turn history)
- 4 agent tools: predict_iss_passes, highlight_on_globe, find_satellites_overhead, get_satellite_info
- UTC clock overlay + satellite count overlay
- Backend: Python FastAPI on Railway; frontend: Vite+React on Vercel
- Tests: 77 pytest + 32 Vitest — all green

KEY TECHNICAL STATE:
- Coordinate system: prime meridian → +X, north → +Y, 90°E → −Z (Three.js SphereGeometry UV convention)
- ISS arc: ECI positions rotated by current GMST → closed ring at correct geographic longitude. Recomputes when TLE updates.
- SatelliteMesh.ts: dot/halo in ECEF (geo.height radius), arc in ECI+GMST.
- Globe.ts click handler: screen-space proximity picking using Vector3.project(camera). Dynamic dot radius = (0.005 / depth) * fovFactor. Accept if screenDist <= dotRadiusPx + 1px. Stores satNames[] and satNoradIds[] parallel to position buffer.
- propagator.worker.ts + SatelliteField.ts: InstancedMesh, positions updated from worker buffer every 100ms
- CelesTrak catalog: FORMAT=TLE (3LE text, parsed by _parse_tle_text). SpaceTrack fallback uses _parse_gp (JSON with TLE_LINE1/TLE_LINE2). Stale cache fallback if both fail.
- api/chat.ts: two-turn Claude loop. Turn 1 (haiku, non-streaming): detects tools, runs orbital calls, collects pendingHighlight. Turn 2 (haiku, streaming): produces text only (no tools — forces text output). Melbourne time computed server-side via toLocaleString.
- App.tsx: prefill state lifted to App. handleSatelliteSelect formats "Tell me about NORAD <id> (<name>)" so backend gets NORAD ID for exact match.

ARCHITECTURE RULE (enforce strictly) — Claude is PRESENTER ONLY. Never compute, infer, or guess any data value. Every value shown to the user must come from a backend tool result or pre-computed server-side value. If data is missing, say unavailable.

SESSION 10 GOALS (priority order — each is independently shippable):
1. Hover tooltip: mousemove raycaster → show satellite name + altitude in floating div when cursor is near a dot (same screen-space proximity logic as click handler)
2. Category filter toggles: classify catalog by name pattern (STARLINK, GPS, IRIDIUM, ISS, debris) → UI buttons → show/hide InstancedMesh subsets by filtering position buffer updates
3. Agent group-highlight tool: highlight_catalog_group(category) — agent says "show me all Starlink satellites" and globe highlights them with a different colour
4. Ground track for selected catalog satellite: on click-to-select, show the selected satellite's orbit arc (same ECI+GMST approach as ISS arc)

NOTES:
- Click-to-select is live and working (Session 9). Blank-space false positives eliminated by dynamic dot radius check.
- Hovering with the same proximity logic should reuse Globe.ts screen-space code — add a mousemove handler that calls a new `onSatelliteHover` callback.
- Category filter approach: classify tles by name regex at catalog load time, store per-category index sets, InstancedMesh position buffer only emits positions for active categories. UI toggle buttons above globe or as an overlay panel.
```
