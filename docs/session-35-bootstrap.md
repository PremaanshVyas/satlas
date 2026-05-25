# Session 35 Bootstrap → Session 36

## Where we are

Session 35 is complete. V1 is live at satlas.app with all features working.

## What shipped in Session 35

**Time controls.** A compact transport bar at the bottom-left (desktop) lets the user run the simulation at 2×, 10×, 50×, or 100× forward or reverse, pause, or snap back to real time (LIVE). Every time-dependent element — satellite positions, Earth rotation, sun direction, and the UTC clock — advances at the selected rate. Clicking the active speed button again pauses. The UTC clock at the top-left gains an inline speed badge (⏸ or Nx►/◄Nx) when not at 1×, removing the need for a second time display in the transport card.

**Satellite sync bug fixed.** Rapidly clicking speed buttons caused satellites to freeze while the Earth kept rotating. Root cause: `lastFieldTickMs` stored a simulated timestamp; after a speed change the rate-limiting gate compared real time against a simulated-future value, preventing any worker ticks. Fix: `lastFieldTickMs` now uses real time throughout; reset to 0 on every `setTimeScale()` call so satellites get a tick on the very next frame.

**AI agent satellite info no longer depends on ECS.** `get_satellite_info` (the chat tool) and `/api/satellite-info` (the public proxy) were calling the Python orbital service at `api.satlas.app`. Cold-start latency (~10–15s) exceeded the 8s fetch timeout, producing "Something went wrong" responses for ISS/satellite questions. Both now compute locally: `fetchTle()` pulls from the CloudFront 2-min TLE cache, satellite.js propagates to current epoch. ECS is no longer on the critical path for any chat query.

## Key files touched

- `apps/web/src/globe/Globe.ts` — `_simTimeMs`, `_timeScale`, `_lastTickRealMs`, `_lastSimSecond`; `setTimeScale()`, `getSimulatedTime()`, `onSimulatedTime`; tick() advances sim time + fires callback
- `apps/web/src/hooks/useGlobe.ts` — exposes `simulatedTime`, `timeScale`, `setTimeScale`
- `apps/web/src/components/TimeControls.tsx` — new compact transport card
- `apps/web/src/components/TimeControls.test.tsx` — 9 tests
- `apps/web/src/components/GlobeView.tsx` — `timeScale` destructured; speed badge on UTC clock
- `apps/web/src/App.tsx` — wires callback ref; renders TimeControls; removed unused `simulatedTime` state
- `apps/web/src/App.test.tsx` — stable `Date` reference in `useGlobe` mock
- `api/chat.ts` — `toolGetSatelliteInfo` replaced with in-process satellite.js computation; `ORBITAL_SERVICE_URL` removed
- `api/satellite-info.ts` — rewritten to compute locally; same response shape

## Next session — V2 direction decision

Choose one of:
- **(A) Alert subscriptions** — email/push when a satellite passes overhead
- **(B) Conjunction analysis** — close-approach warnings between tracked objects
- **(C) Vision pipeline / bushfire scars** — Sentinel-2 ML segmentation, Australian-relevant
- **(D) Vector RAG over space docs** — semantic search over orbital mechanics literature

Check the r/Starlink post from Session 33 for any accumulated community feedback before deciding.

## No blockers. Test count: 113.
