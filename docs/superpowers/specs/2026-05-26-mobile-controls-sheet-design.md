# Mobile Controls Bottom Sheet — Design Spec

**Date:** 2026-05-26
**Scope:** Mobile and tablet only (`< sm`, i.e. `< 640px`). Desktop unchanged.

---

## Problem

On mobile, the right-edge toggle buttons (Clouds, Debris, Borders) clutter the top-right corner. The UTC clock and TimeControls are hidden entirely (`hidden sm:block`). Category pills sit permanently at the bottom consuming vertical space. The result: a crowded globe with no access to time controls.

---

## Solution

A hamburger button in the top-left corner (mobile only) opens a `vaul` Drawer bottom sheet containing all secondary controls. The globe is completely clean when the sheet is closed.

---

## What Changes

### On mobile (< 640px)

**Removed from the always-visible overlay:**
- Right-edge toggle cluster (Clouds, Debris, Borders buttons) — moves into the sheet
- Bottom category pills bar — moves into the sheet

**Added to the always-visible overlay:**
- Hamburger button `☰` at top-left (28×28px, same style as existing chips)

**New bottom sheet (vaul Drawer):**
- Handle bar at top
- UTC clock + speed badge row (same `utcClock` string + `SpeedBadge` from TimeControls)
- Full transport button row (◄100 ◄50 ◄10 ◄2 ⏸ LIVE 2► 10► 50► 100►)
- Layer toggles section: Clouds, Debris, Borders — each as a full-width row with label + toggle pill
- Category filter section: Starlink, GPS, Iridium, Debris, Other pills (same toggle logic as existing pills)

### On desktop (≥ 640px)

**Absolutely nothing changes.** The hamburger button is `sm:hidden`. All existing desktop layout stays identical.

---

## Component Design

### `MobileControlsSheet.tsx` (new)

Single self-contained component. Receives all props it needs; owns no state except `open` (the sheet open/close toggle).

```
Props:
  utcClock: string                          — "14:32:07 UTC"
  timeScale: number
  onSetScale: (scale: number) => void
  cloudsVisible: boolean
  onToggleClouds: () => void
  bordersVisible: boolean
  onToggleBorders: () => Promise<void>
  activeCategories: Set<SatCategory>
  onToggleCategory: (cat: SatCategory) => void
```

Internally renders:
- A hamburger `<button>` that is `sm:hidden` — this is what the user taps
- A `<Drawer.Root>` (vaul) that opens from the bottom
- `<Drawer.Overlay>` with `bg-black/50 backdrop-blur-sm`
- `<Drawer.Content>` containing the sections listed above

The Drawer uses the same `vaul` import already in the project. No new library needed.

### Integration in `GlobeView.tsx`

`MobileControlsSheet` is dropped into the overlay layer alongside the existing chips. It receives props it needs from state already in `GlobeView`:
- `utcClock` — already computed
- `timeScale`, `setTimeScale` — already from `useGlobe`
- `cloudsVisible`, `setCloudsVisible` (already state in GlobeView) — passed through `toggleClouds`
- `bordersVisible`, `setBordersVisibleState` — already state in GlobeView — passed through `toggleBorders`
- `activeCategories`, `toggleCategory` — already state + callback in GlobeView

The existing toggle buttons in GlobeView are conditionally hidden: `hidden sm:flex` (they already show on desktop, this makes the hide explicit). The category pills bar becomes `hidden sm:flex` too.

No changes to `App.tsx`, `useGlobe`, `Globe.ts`, any API files, or any other component.

---

## Interaction Details

- Sheet opens on hamburger tap, closes on handle swipe-down, backdrop tap, or explicit close
- Closing the sheet does not reset any state — toggles/categories/speed stay as set
- When chat panel is open, hamburger button is still visible (chat is a right-side panel, hamburger is top-left — no overlap)
- `onToggleBorders` is async (can throw on GeoJSON load failure); the sheet stays open while loading, matching existing desktop behaviour
- Transport buttons inside the sheet use the same `handleSpeed` toggle-to-pause logic from TimeControls
- `SpeedBadge` is not exported from TimeControls.tsx — reproduce the ~10-line component inline inside MobileControlsSheet rather than exporting it (CLAUDE.md: avoid premature abstraction)

---

## Visual Style

Matches existing Vaul sheets in the codebase exactly:
- `bg-[rgba(9,9,9,0.98)]`
- `border-t border-[rgba(255,255,255,0.07)]`
- `rounded-t-2xl`
- Handle: `w-10 h-1 rounded-full bg-[rgba(255,255,255,0.08)]`
- Section labels: `font-mono text-[9px] uppercase tracking-[0.18em] text-[#555555]`
- Toggle rows: same pill design as existing toggle buttons but full-width with label
- Category pills: same pill design as existing bottom bar pills

---

## Files Touched

| File | Change |
|------|--------|
| `apps/web/src/components/MobileControlsSheet.tsx` | **New** — entire sheet component |
| `apps/web/src/components/GlobeView.tsx` | Add `<MobileControlsSheet>` to overlay; hide desktop toggles and pill bar on mobile (`hidden sm:flex`) |

No other files change.

---

## What Does NOT Change

- Desktop layout — identical to today
- `App.tsx` — no changes
- `Globe.ts`, `useGlobe.ts` — no changes
- Any API files — no changes
- TimeControls.tsx — no changes (reuse its SpeedBadge and button logic inline in the sheet, or import SpeedBadge directly)
- All 113 existing tests continue to pass unmodified

---

## Out of Scope

- Tablet-specific breakpoint (640px covers both phone and tablet portrait; tablet landscape gets the desktop layout, which is correct)
- Animations beyond vaul's built-in slide-up
- Persisting sheet open state across sessions
