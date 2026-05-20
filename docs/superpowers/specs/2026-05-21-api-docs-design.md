# Spec: Public API Docs Page

**Date:** 2026-05-21  
**Session:** 21  
**Status:** Approved

---

## Goal

A public-facing `/docs` route on `getsatlas.vercel.app` that lists Satlas's public API endpoints with request/response examples. Primary audience: recruiters and developers who find the project. Should look polished and match the existing dark space aesthetic.

---

## Routing

Add `react-router-dom` to `apps/web`. Wrap the app in `<BrowserRouter>` in `main.tsx`. Two routes:

- `/` → existing `<App>` (unchanged)
- `/docs` → new `<ApiDocs>` page component

Add a `rewrites` rule to `vercel.json` so that a hard refresh on `/docs` doesn't return a 404 — Vercel must serve `index.html` for all non-asset paths.

---

## Endpoints Documented

Only the stable Vercel-hosted endpoints. The ALB is HTTP-only with no domain and is not a clean public surface yet.

### 1. `GET /api/catalog`

Returns the full TLE (Two-Line Element) satellite catalog in 3-line text format. Approximately 20,000 active objects. Refreshed every 2 hours from Space-Track.org via ECS.

**Parameters:** none

**Response:** `text/plain`, 3-line TLE format:
```
0 ISS (ZARYA)
1 25544U 98067A   24...
2 25544  51.6...
```

---

### 2. `GET /api/pass`

Predicts upcoming passes of a satellite over a given ground location.

**Query parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `norad` | string | yes | NORAD catalog number (e.g. `25544` for ISS) |
| `lat` | number | yes | Observer latitude in decimal degrees (south = negative) |
| `lon` | number | yes | Observer longitude in decimal degrees (west = negative) |
| `hours` | number | no | Hours to search ahead. Default: 24 |

**Response:** `application/json`
```json
{
  "satellite": "ISS (ZARYA)",
  "norad_id": "25544",
  "passes": [
    {
      "start": "2026-05-21T10:14:00.000Z",
      "end": "2026-05-21T10:20:00.000Z",
      "max_elevation": 62,
      "direction": "NW",
      "duration_seconds": 360
    }
  ]
}
```

---

### 3. `POST /api/chat`

AI agent powered by Claude. Accepts plain-English questions about satellites and returns a streamed text response. Rate-limited to 15 requests per IP per minute.

**Request body:** `application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | yes | User question, max 500 characters |
| `history` | array | no | Prior turn history (`[{ role, content }]`) |

**Response:** `text/plain` streaming. May contain inline control tokens (`__HIGHLIGHT__:`, `__SET_FILTER__:`) for globe interaction — strip these when using outside the Satlas frontend.

---

## Component Architecture

### New file: `apps/web/src/pages/ApiDocs.tsx`

Single scrollable page component. No sidebar. Sections:

1. **Header** — "Satlas API" wordmark (left), "← Back to globe" link to `/` (right)
2. **Intro block** — one-paragraph description, base URL (`https://getsatlas.vercel.app`), rate limit note
3. **Three endpoint sections** — one per endpoint, each containing:
   - Method badge + path in monospace
   - Description paragraph
   - Parameters table (if applicable)
   - `curl` example code block
   - Response example code block (truncated where needed)

### Modified files

| File | Change |
|------|--------|
| `apps/web/package.json` | Add `react-router-dom` dependency |
| `apps/web/src/main.tsx` | Wrap with `<BrowserRouter>`, add `<Routes>` with `/` and `/docs` |
| `vercel.json` | Add `rewrites` so `/docs` serves `index.html` |

No changes to `App.tsx` or any existing component.

---

## Styling

Matches the app's existing palette:

| Token | Usage |
|-------|-------|
| `bg-gray-950` | Page background |
| `bg-gray-900` | Card and code block backgrounds |
| `border-gray-700/80` | Card borders |
| `text-gray-400` | Secondary / body text |
| `text-gray-200` | Primary text |
| `text-blue-400` | Links, `POST` method badge |
| `text-green-400` | `GET` method badge |

Monospace font for code blocks (system default via Tailwind `font-mono`). No new UI libraries beyond `react-router-dom`.

---

## Out of Scope

- Interactive "try it" console
- Authentication / API keys
- ALB/ECS endpoints (not stable public surface yet — HTTP, no domain)
- OpenAPI / Swagger spec generation
- Search or sidebar navigation (only 3 endpoints)
