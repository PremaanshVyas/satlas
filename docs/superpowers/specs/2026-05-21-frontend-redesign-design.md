# Satlas Frontend Redesign — Design Spec
**Date:** 2026-05-21
**Status:** Approved

---

## Direction

Nothing/Terminal aesthetic. Industrial, monospace-first, high-contrast dark. The 3D globe is always the hero — every UI element exists to frame it, not compete with it.

The one-sentence brief: **mission control built by Nothing**.

---

## Design Tokens

### Colors

```
--bg:            #080808          /* near-black app background */
--panel-bg:      rgba(9,9,9,0.72) /* glass panel background */
--panel-blur:    16px              /* backdrop-filter blur */
--border:        rgba(255,255,255,0.07) /* barely-there white border */

--text-primary:  #ffffff
--text-secondary:#888888
--text-label:    #2a2a2a          /* section titles, field labels — recedes */
--text-muted:    #1a1a1a          /* ultra-dim decorative text */

--accent:        #00d4ff          /* electric cyan — live data, active status, primary CTA */
--accent-glow:   #00d4ff33        /* accent at 20% for halos / button borders */
--accent-dim:    #00d4ff88        /* accent at 53% for secondary live values */

--danger:        #ff4444          /* debris / rocket body badges */
--danger-bg:     rgba(255,68,68,0.12)
--warn:          #ffaa00          /* degraded / unknown status */
--warn-bg:       rgba(255,170,0,0.12)
```

### Typography

One font: **JetBrains Mono** (Google Fonts). All weights 300–700. No Inter, no system-ui fallback for UI text.

```
/* Satellite / object name */
font: 700 11px/1.2 'JetBrains Mono';
text-transform: uppercase;
letter-spacing: 0.04em;
color: var(--text-primary);

/* Section titles (e.g. "Live Position", "Catalog") */
font: 400 7px/1 'JetBrains Mono';
text-transform: uppercase;
letter-spacing: 0.18em;
color: var(--text-label);

/* Field labels (e.g. "Altitude", "Latitude") */
font: 400 8px/1 'JetBrains Mono';
color: var(--text-label);

/* Data values — static */
font: 300 10px/1 'JetBrains Mono';
color: var(--text-secondary);

/* Data values — live / active */
font: 400 10px/1 'JetBrains Mono';
color: var(--accent);

/* Buttons */
font: 400 8px/1 'JetBrains Mono';
text-transform: uppercase;
letter-spacing: 0.08em;
```

**Label rule:** Full words always. Never abbreviate in the UI.
- ✅ Altitude, Latitude, Longitude, Velocity, NORAD ID, Launch Site, Designator, Owner, Launched
- ❌ ALT, LAT, LON, VEL, Int'l Des.

### Geometry

```
--radius-panel:  3px   /* info card, pass panel, search bar, chat panel */
--radius-btn:    2px   /* buttons, badges */
--border-width:  1px
```

---

## Components

### Panel shell (shared by SatInfoCard, PassPanel, AgentPanel, SearchBar dropdown)

```
background: var(--panel-bg)
backdrop-filter: blur(var(--panel-blur))
border: var(--border-width) solid var(--border)
border-radius: var(--radius-panel)
```

Internal dividers between sections: `1px solid rgba(255,255,255,0.04)` — even subtler than the outer border.

### SatInfoCard

Structure (top to bottom):
1. **Header** — satellite name (uppercase, bold, with pulsing cyan dot for active), NORAD ID below, object-type badge top-right, dismiss ×
2. **Catalog** section — Owner, Launched, Status, Designator, Launch Site
3. **Live Position** section — Latitude, Longitude, Altitude, Velocity (live values in cyan)
4. **Orbital Parameters** section (when available) — Inclination, Period, Apogee, Perigee
5. **Actions** — "Predict Passes" (secondary), "Ask AI" (primary cyan)

Status badge colours:
- Operational (`+`, `tracked`): cyan text, cyan dot + ping
- Degraded / unknown: `--warn`
- Decayed (`D`, `decayed`): `--danger`
- Debris / Rocket Body object type: `--danger` badge

### PassPanel

Structure:
1. **Header** — "Pass Prediction · Next 24 h" label, satellite name, NORAD ID, close ×
2. **Observer Location** — location name + coords, "Change" link; or search input with autocomplete
3. **Pass list** — each row: time + timezone, duration (right-aligned), then Elevation + compass rose on same line
4. Compass rose: keep existing SVG, recolour needle to `--accent`

### AgentPanel (chat)

- Message bubbles: user = `rgba(0,212,255,0.08)` background + `--accent` border at 15% opacity, text `--text-primary`. AI = transparent + `--border`, text `--text-secondary`.
- Streaming indicator: three cyan dots instead of gray
- Input: panel-bg, `--border`, cyan focus ring
- Send button: `--accent` border + text, transparent bg; filled on hover

### SearchBar

- Same panel shell
- Search icon: cyan
- Results dropdown: panel shell, each result separated by `--border` dividers
- NORAD ID in result: `--text-label` (dim, right-aligned)

### GlobeView overlays

- UTC clock (top-left): `--text-label`, no background chip — just text over the globe
- Satellite count (top-right): same
- Category filter pills: `--border` border, `--text-label` text inactive; `--accent` border + text active
- API Docs link: panel shell, "API Docs" label (not just "API")
- Cloud toggle: same pill style

### App chrome

- Selection tray (bottom-left): panel shell; selected satellite chip uses `--accent` background at 8%
- Chat toggle button: panel shell circle, cyan icon; no filled blue background
- Chat panel (right side): `background: #080808`, `border-left: 1px solid rgba(255,255,255,0.07)`
- Chat header: "AI · ASSISTANT" label (uppercase, spaced), small cyan dot

### ApiDocs page

- `background: #080808`
- Font: JetBrains Mono throughout
- `GET` badge: cyan text + border; `POST` badge: `--warn` text + border
- Code blocks: `#050505` background, cyan syntax for strings/values
- Header and footer: `--border` dividers

---

## Animations

All motion via Framer Motion (already installed). Principle: **precise and fast**, never playful.

| Element | Animation |
|---------|-----------|
| Panel enter (SatInfoCard, PassPanel) | `opacity: 0→1`, `y: -8→0`, 140ms easeOut |
| Panel exit | `opacity: 1→0`, `y: 0→-6`, 100ms easeOut |
| Chat panel slide | `x: 100%→0`, 180ms `[0.25,0.1,0.25,1]` easeOut (no spring — ADR) |
| Chat message appear | `opacity: 0→1`, `y: 6→0`, 120ms easeOut; 60ms stagger between messages |
| Live data flash | On value change: background flashes `--accent-glow` for 300ms then fades *(optional — requires prev-value tracking via useRef)* |
| Pulsing active dot | Existing `animate-ping` — recolour to cyan |
| Button hover | `border-color` brightens to `--accent-dim`; no scale, no bounce |
| Streaming dots | Three dots pulse in cyan with 150ms stagger |
| Category pill active | `border-color` + `color` transition, 120ms |

---

## What changes in each file

| File | Changes |
|------|---------|
| `index.css` | Add JetBrains Mono import; define CSS custom properties; remove Geist reference |
| `SatInfoCard.tsx` | Full restyle — tokens, full labels, section titles, status colours |
| `PassPanel.tsx` | Full restyle — tokens, full labels, compass needle colour |
| `AgentPanel.tsx` | Restyle bubbles, input, send button, streaming dots |
| `SearchBar.tsx` | Restyle pill + dropdown |
| `GlobeView.tsx` | Restyle overlays — clock, count, pills, API Docs link label |
| `App.tsx` | Restyle tray, chat toggle button, chat panel header |
| `ApiDocs.tsx` | Full restyle — font, colours, badge styles, code blocks |

No new npm packages required. No structural/logic changes — pure visual layer.

---

## Out of scope

- Globe renderer itself (Three.js scene — satellite dot colours, atmosphere, stars)
- Any backend changes
- Routing or component structure changes
- Mobile-specific layout changes (existing responsive behaviour preserved)
