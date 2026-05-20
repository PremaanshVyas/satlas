# API Docs Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public-facing `/docs` route to `getsatlas.vercel.app` that documents the three public API endpoints with parameters, curl examples, and response samples.

**Architecture:** Add `react-router-dom` to the Vite app; wrap `main.tsx` with `<BrowserRouter>` and `<Routes>`; `/` stays as the existing `App`, `/docs` renders a new `ApiDocs` page component. A Vercel rewrite rule ensures hard-refreshing `/docs` serves `index.html` rather than 404ing. No changes to `App.tsx` or any existing component.

**Tech Stack:** React 19, react-router-dom v7, Tailwind v4, Vitest + Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `apps/web/package.json` | Add `react-router-dom` dependency |
| Modify | `apps/web/src/main.tsx` | BrowserRouter + Routes wrapping |
| Create | `apps/web/src/pages/ApiDocs.tsx` | Docs page — all endpoint content and layout |
| Create | `apps/web/src/pages/ApiDocs.test.tsx` | Component tests |
| Modify | `vercel.json` | SPA rewrite rule so `/docs` doesn't 404 on hard refresh |

---

## Task 1: Install react-router-dom

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package**

```bash
cd apps/web && npm install react-router-dom
```

Expected output: `added N packages` with `react-router-dom` appearing in `dependencies`.

- [ ] **Step 2: Verify it landed in package.json**

```bash
grep react-router-dom apps/web/package.json
```

Expected: `"react-router-dom": "^7.x.x"` (exact version will vary).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore: add react-router-dom"
```

---

## Task 2: Write failing tests for ApiDocs

**Files:**
- Create: `apps/web/src/pages/ApiDocs.test.tsx`

- [ ] **Step 1: Create the pages directory and test file**

```bash
mkdir -p apps/web/src/pages
```

Create `apps/web/src/pages/ApiDocs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import ApiDocs from './ApiDocs'

function renderApiDocs() {
  return render(
    <MemoryRouter>
      <ApiDocs />
    </MemoryRouter>,
  )
}

describe('ApiDocs', () => {
  it('renders the page heading', () => {
    renderApiDocs()
    expect(screen.getByText('API Reference')).toBeInTheDocument()
  })

  it('shows the Satlas API title in the header', () => {
    renderApiDocs()
    expect(screen.getByText('Satlas API')).toBeInTheDocument()
  })

  it('renders a link back to the globe', () => {
    renderApiDocs()
    const link = screen.getByRole('link', { name: /back to globe/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows all three endpoint paths', () => {
    renderApiDocs()
    expect(screen.getByText('/api/catalog')).toBeInTheDocument()
    expect(screen.getByText('/api/pass')).toBeInTheDocument()
    expect(screen.getByText('/api/chat')).toBeInTheDocument()
  })

  it('shows GET badge for catalog and pass endpoints', () => {
    renderApiDocs()
    const badges = screen.getAllByText('GET')
    expect(badges.length).toBeGreaterThanOrEqual(2)
  })

  it('shows POST badge for chat endpoint', () => {
    renderApiDocs()
    expect(screen.getByText('POST')).toBeInTheDocument()
  })

  it('shows the base URL', () => {
    renderApiDocs()
    expect(screen.getByText('https://getsatlas.vercel.app')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
cd apps/web && npm run test:run -- src/pages/ApiDocs.test.tsx
```

Expected: all 7 tests FAIL with `Cannot find module './ApiDocs'`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/web/src/pages/ApiDocs.test.tsx
git commit -m "test: add failing tests for ApiDocs page"
```

---

## Task 3: Implement ApiDocs.tsx

**Files:**
- Create: `apps/web/src/pages/ApiDocs.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/pages/ApiDocs.tsx`:

```tsx
import { Link } from 'react-router-dom'

const BASE = 'https://getsatlas.vercel.app'

interface Param {
  name: string
  type: string
  required: boolean
  description: string
}

interface Endpoint {
  method: 'GET' | 'POST'
  path: string
  description: string
  params?: Param[]
  curl: string
  response: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/catalog',
    description:
      'Full TLE (Two-Line Element) satellite catalog in 3-line text format. Approximately 20,000 active objects. Refreshed every 2 hours from Space-Track.org.',
    curl: `curl ${BASE}/api/catalog`,
    response: [
      '0 ISS (ZARYA)',
      '1 25544U 98067A   26141.42361111  .00021328  00000-0  38431-3 0  9993',
      '2 25544  51.6397 132.4788 0003527  84.9201  23.3094 15.50036716513899',
      '0 STARLINK-1234',
      '1 48274U 21...',
      '...(~20,000 objects total)',
    ].join('\n'),
  },
  {
    method: 'GET',
    path: '/api/pass',
    description:
      'Predict upcoming passes of a satellite over a ground location. Returns start/end times (UTC ISO 8601), max elevation in degrees, compass direction, and duration.',
    params: [
      { name: 'norad',  type: 'string', required: true,  description: 'NORAD catalog number (e.g. 25544 for ISS)' },
      { name: 'lat',    type: 'number', required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
      { name: 'lon',    type: 'number', required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
      { name: 'hours',  type: 'number', required: false, description: 'Hours to search ahead. Default: 24' },
    ],
    curl: `curl "${BASE}/api/pass?norad=25544&lat=-37.81&lon=144.96&hours=24"`,
    response: JSON.stringify(
      {
        satellite: 'ISS (ZARYA)',
        norad_id: '25544',
        passes: [
          {
            start: '2026-05-21T10:14:00.000Z',
            end: '2026-05-21T10:20:00.000Z',
            max_elevation: 62,
            direction: 'NW',
            duration_seconds: 360,
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    method: 'POST',
    path: '/api/chat',
    description:
      'AI agent powered by Claude. Accepts natural-language satellite questions and returns a streamed text response. Rate-limited to 15 requests per IP per minute. Strip __HIGHLIGHT__: and __SET_FILTER__: control tokens if consuming outside the Satlas frontend.',
    params: [
      { name: 'message', type: 'string', required: true,  description: 'User question, max 500 characters' },
      { name: 'history', type: 'array',  required: false, description: 'Prior turns: [{ role: "user" | "assistant", content: string }]' },
    ],
    curl: [
      `curl -X POST ${BASE}/api/chat \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"message":"Where is the ISS right now?"}'`,
    ].join('\n'),
    response: [
      'The ISS (ZARYA) is currently at:',
      '- Altitude: 423 km',
      '- Latitude: -12.4°, Longitude: 87.2°',
      '- Velocity: 7.66 km/s',
      '',
      '__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS (ZARYA)"}',
    ].join('\n'),
  },
]

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  const cls =
    method === 'GET'
      ? 'bg-green-900/40 text-green-400 border border-green-800/60'
      : 'bg-blue-900/40 text-blue-400 border border-blue-800/60'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${cls}`}>
      {method}
    </span>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-gray-900 border border-gray-700/80 rounded-lg p-4 text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
      {code}
    </pre>
  )
}

function ParamsTable({ params }: { params: Param[] }) {
  return (
    <div className="bg-gray-900 border border-gray-700/80 rounded-lg p-4 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
            <th className="pb-2 pr-6 font-medium">Parameter</th>
            <th className="pb-2 pr-6 font-medium">Type</th>
            <th className="pb-2 pr-6 font-medium">Required</th>
            <th className="pb-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {params.map(p => (
            <tr key={p.name}>
              <td className="py-2 pr-6 font-mono text-gray-200">{p.name}</td>
              <td className="py-2 pr-6 text-gray-500 font-mono text-xs">{p.type}</td>
              <td className="py-2 pr-6">
                {p.required ? (
                  <span className="text-blue-400 text-xs">required</span>
                ) : (
                  <span className="text-gray-600 text-xs">optional</span>
                )}
              </td>
              <td className="py-2 text-gray-400">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EndpointSection({ endpoint }: { endpoint: Endpoint }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <MethodBadge method={endpoint.method} />
        <code className="text-gray-200 font-mono text-sm">{endpoint.path}</code>
      </div>
      <p className="text-gray-400 text-sm mb-4">{endpoint.description}</p>
      {endpoint.params && (
        <div className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Parameters</h3>
          <ParamsTable params={endpoint.params} />
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Example</h3>
        <CodeBlock code={endpoint.curl} />
      </div>
      <div>
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Response</h3>
        <CodeBlock code={endpoint.response} />
      </div>
    </section>
  )
}

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-semibold tracking-wide">Satlas API</span>
        </div>
        <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
          ← Back to globe
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">API Reference</h1>
        <p className="text-gray-400 text-sm mb-1">
          Public HTTP API for satellite tracking. No authentication required.
        </p>
        <p className="text-sm font-mono text-gray-500">
          Base URL: <span className="text-gray-300">{BASE}</span>
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16 space-y-0 divide-y divide-gray-800/40">
        {ENDPOINTS.map(ep => (
          <div key={ep.path} className="py-10 first:pt-0">
            <EndpointSection endpoint={ep} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the tests — confirm they all pass**

```bash
cd apps/web && npm run test:run -- src/pages/ApiDocs.test.tsx
```

Expected: 7 tests PASS.

- [ ] **Step 3: Run the full test suite — confirm nothing broke**

```bash
cd apps/web && npm run test:run
```

Expected: all tests pass (previously 68; now 75).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/ApiDocs.tsx
git commit -m "feat: add ApiDocs page component"
```

---

## Task 4: Wire up routing and Vercel rewrite

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `vercel.json`

- [ ] **Step 1: Update main.tsx**

Replace the full contents of `apps/web/src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ApiDocs from './pages/ApiDocs.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/docs" element={<ApiDocs />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 2: Update vercel.json**

Replace the full contents of `vercel.json` with:

```json
{
  "buildCommand": "cd apps/web && npm install && npm run build",
  "outputDirectory": "apps/web/dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

The regex `/((?!api/).*)` matches every path that does not start with `api/`. Vercel's serverless functions (`/api/*`) always take priority over rewrites, so this is belt-and-suspenders — it keeps the rule explicit rather than relying on implicit precedence.

- [ ] **Step 3: Run the full test suite — confirm nothing broke**

```bash
cd apps/web && npm run test:run
```

Expected: all 75 tests pass. `App.test.tsx` renders `<App />` directly without a Router, which is fine because `App.tsx` itself uses no router hooks.

- [ ] **Step 4: Run tsc and lint**

```bash
cd apps/web && npm run build
```

Expected: build completes without TypeScript errors or lint warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx vercel.json
git commit -m "feat: wire up /docs route and Vercel SPA rewrite"
```

---

## Task 5: Smoke-test locally

- [ ] **Step 1: Start the dev server**

```bash
cd apps/web && npm run dev
```

- [ ] **Step 2: Verify the globe still works**

Open `http://localhost:5173` in a browser. The 3D globe should load and the AI chat button should appear. No console errors.

- [ ] **Step 3: Verify the docs page**

Navigate to `http://localhost:5173/docs`. You should see:
- Dark page with "Satlas API" in the header
- "← Back to globe" link in the top-right
- Three endpoint sections: `GET /api/catalog`, `GET /api/pass`, `POST /api/chat`
- Green `GET` badges, blue `POST` badge
- Parameter tables for `/api/pass` and `/api/chat`
- curl examples and response code blocks

- [ ] **Step 4: Verify the back-link works**

Click "← Back to globe" — should navigate to `/` and show the globe.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: public API docs page at /docs (Session 21)"
```
