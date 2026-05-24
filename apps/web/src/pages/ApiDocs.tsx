import { useState } from 'react'
import { Link } from 'react-router-dom'

const BASE = typeof window !== 'undefined' ? window.location.origin : 'https://satlas.app'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Param {
  name: string
  type: string
  required: boolean
  description: string
}

interface Field {
  name: string
  type: string
  description: string
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'overview',        label: 'Overview' },
  { id: 'catalog',         label: '/api/catalog' },
  { id: 'pass',            label: '/api/pass' },
  { id: 'chat',            label: '/api/chat' },
  { id: 'satellite-info',  label: '/api/satellite-info' },
  { id: 'satellites',      label: '/api/satellites' },
  { id: 'overhead',        label: '/api/overhead' },
  { id: 'errors',          label: 'Errors' },
  { id: 'data',            label: 'Data Sources' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span className={`inline-block font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[2px] border ${
      method === 'GET'
        ? 'border-[rgba(0,212,255,0.35)] text-accent'
        : 'border-[rgba(255,170,0,0.35)] text-warn'
    }`}>
      {method}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className={`font-mono text-[8px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[2px] border transition-colors ${
        copied
          ? 'border-[rgba(0,212,255,0.4)] text-accent'
          : 'border-[rgba(255,255,255,0.08)] text-label hover:text-secondary hover:border-[rgba(255,255,255,0.14)]'
      }`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-[#050505] border border-[rgba(255,255,255,0.06)] rounded-[3px] p-4 font-mono text-[11px] font-light text-secondary overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  )
}

function ParamsTable({ params }: { params: Param[] }) {
  return (
    <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.06)]">
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Parameter</th>
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Type</th>
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Required</th>
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
          {params.map(p => (
            <tr key={p.name}>
              <td className="py-2.5 px-4 font-mono text-[10px] text-accent whitespace-nowrap">{p.name}</td>
              <td className="py-2.5 px-4 font-mono text-[9px] font-light text-label whitespace-nowrap">{p.type}</td>
              <td className="py-2.5 px-4">
                {p.required
                  ? <span className="font-mono text-[8px] text-accent">required</span>
                  : <span className="font-mono text-[8px] text-label">optional</span>}
              </td>
              <td className="py-2.5 px-4 font-mono text-[10px] font-light text-secondary">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SchemaTable({ fields }: { fields: Field[] }) {
  return (
    <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.06)]">
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Field</th>
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Type</th>
            <th className="text-left pt-2.5 pb-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
          {fields.map(f => (
            <tr key={f.name}>
              <td className="py-2.5 px-4 font-mono text-[10px] text-accent whitespace-nowrap">{f.name}</td>
              <td className="py-2.5 px-4 font-mono text-[9px] font-light text-label whitespace-nowrap">{f.type}</td>
              <td className="py-2.5 px-4 font-mono text-[10px] font-light text-secondary">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2.5">
      {children}
    </h3>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* Header */}
      <header className="border-b border-[rgba(255,255,255,0.07)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#080808] z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">Satlas API</span>
        </div>
        <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">
          ← Back to globe
        </Link>
      </header>

      {/* Body — sidebar + main */}
      <div className="max-w-5xl mx-auto flex items-start">

        {/* Left nav — sticky, desktop only */}
        <nav className="hidden md:flex flex-col gap-0.5 w-44 flex-shrink-0 sticky top-[57px] self-start h-[calc(100vh-57px)] overflow-y-auto py-10 pr-6">
          <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-[#333] mb-3">Contents</p>
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="font-mono text-[10px] text-label hover:text-secondary transition-colors py-0.5 truncate"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-auto pt-8 flex flex-col gap-2">
            <a
              href="https://github.com/PremaanshVyas/satlas"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors"
            >
              GitHub ↗
            </a>
            <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">
              Globe ↗
            </Link>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-6 md:pl-10 py-10 space-y-20">

          {/* ── Overview ─────────────────────────────────────────────────────── */}
          <section id="overview">
            <h1 className="font-mono text-[22px] font-bold text-white mb-2 tracking-[-0.01em]">API Reference</h1>
            <p className="font-mono text-[12px] font-light text-secondary mb-6 leading-relaxed max-w-xl">
              Satellite tracking, orbital mechanics, and AI — open and free with no authentication required.
              Track 31,000+ objects in real time, predict passes over any location on Earth, and query the
              same AI agent that powers the Satlas globe.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {[
                { label: 'Objects tracked', value: '31,000+' },
                { label: 'Auth required', value: 'None' },
                { label: 'Endpoints', value: '6' },
                { label: 'TLE propagation', value: 'SGP4 / skyfield' },
              ].map(stat => (
                <div key={stat.label} className="border border-[rgba(255,255,255,0.06)] rounded-[3px] px-4 py-3">
                  <div className="font-mono text-[7px] uppercase tracking-[0.16em] text-label mb-1">{stat.label}</div>
                  <div className="font-mono text-[14px] text-white">{stat.value}</div>
                </div>
              ))}
            </div>

            <SectionLabel>Base URLs</SectionLabel>
            <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] divide-y divide-[rgba(255,255,255,0.04)] mb-6">
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-label w-32 flex-shrink-0">Vercel Edge</span>
                <code className="font-mono text-[11px] text-secondary">{BASE}</code>
              </div>
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-label w-32 flex-shrink-0">Orbital Service</span>
                <code className="font-mono text-[11px] text-secondary">https://api.satlas.app</code>
              </div>
            </div>

            <p className="font-mono text-[10px] font-light text-label leading-relaxed">
              All <code className="text-secondary">/api/*</code> routes are served from the Vercel Edge Network —
              catalog responses are globally cached and served in under 100 ms. The orbital service at{' '}
              <code className="text-secondary">api.satlas.app</code> runs on AWS ECS Fargate (us-east-1)
              and handles real-time propagation and pass prediction.
            </p>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── GET /api/catalog ─────────────────────────────────────────────── */}
          <section id="catalog">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="GET" />
              <code className="font-mono text-[13px] text-white">/api/catalog</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              Full TLE (Two-Line Element) catalog in 3-line text format. Approximately 31,000+ objects — active
              satellites, rocket bodies, and debris. Sourced from Space-Track.org and refreshed every 2 hours.
              Served from Vercel Edge Cache; most requests resolve in under 100 ms globally.
            </p>

            <div className="mb-5">
              <SectionLabel>Example</SectionLabel>
              <CodeBlock code={`curl ${BASE}/api/catalog`} />
            </div>

            <div>
              <SectionLabel>Response — 3-line TLE text (Content-Type: text/plain)</SectionLabel>
              <CodeBlock code={[
                '0 ISS (ZARYA)',
                '1 25544U 98067A   26141.42361111  .00021328  00000-0  38431-3 0  9993',
                '2 25544  51.6397 132.4788 0003527  84.9201  23.3094 15.50036716513899',
                '0 STARLINK-1234',
                '1 48274U 21015AK  26141.50000000  .00001234  00000-0  10270-3 0  9991',
                '2 48274  53.0520  44.2310 0001234  90.1234 269.9876 15.06392110512345',
                '...(~31,000+ objects total)',
              ].join('\n')} />
            </div>

            <div className="mt-4 p-3 border border-[rgba(255,255,255,0.06)] rounded-[3px] bg-[rgba(255,255,255,0.01)]">
              <p className="font-mono text-[9px] text-label leading-relaxed">
                Each object is 3 lines: name (prefixed <code className="text-secondary">0 </code>), TLE line 1, TLE line 2.
                Cache-Control: <code className="text-secondary">s-maxage=7200, stale-while-revalidate=86400</code>.
                Data redistribution subject to Space-Track.org terms.
              </p>
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── GET /api/pass ─────────────────────────────────────────────────── */}
          <section id="pass">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="GET" />
              <code className="font-mono text-[13px] text-white">/api/pass</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              Predict upcoming visible passes of any tracked satellite over a ground location. Returns start/end
              times in UTC, max elevation in degrees, and compass direction. Uses SGP4 propagation via skyfield.
              Searches up to 168 hours ahead (7 days).
            </p>

            <div className="mb-5">
              <SectionLabel>Query Parameters</SectionLabel>
              <ParamsTable params={[
                { name: 'norad_id',    type: 'string', required: true,  description: 'NORAD catalog number — e.g. 25544 for ISS' },
                { name: 'latitude',    type: 'number', required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
                { name: 'longitude',   type: 'number', required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
                { name: 'hours_ahead', type: 'integer', required: false, description: 'Hours to search ahead (1–168). Default: 24' },
              ]} />
            </div>

            <div className="mb-5">
              <SectionLabel>Example</SectionLabel>
              <CodeBlock code={`curl "${BASE}/api/pass?norad_id=25544&latitude=-37.81&longitude=144.96&hours_ahead=24"`} />
            </div>

            <div className="mb-5">
              <SectionLabel>Response</SectionLabel>
              <CodeBlock code={JSON.stringify({
                passes: [
                  {
                    start_utc: '2026-05-25T10:14:00Z',
                    end_utc: '2026-05-25T10:20:22Z',
                    max_elevation_deg: 62.3,
                    direction: 'NW',
                  },
                  {
                    start_utc: '2026-05-25T11:52:11Z',
                    end_utc: '2026-05-25T11:57:44Z',
                    max_elevation_deg: 28.1,
                    direction: 'SE',
                  },
                ],
              }, null, 2)} />
            </div>

            <div>
              <SectionLabel>Response Schema — each pass object</SectionLabel>
              <SchemaTable fields={[
                { name: 'start_utc',         type: 'string (ISO 8601)',  description: 'Pass rise time above 10° elevation, UTC' },
                { name: 'end_utc',           type: 'string (ISO 8601)',  description: 'Pass set time below 10° elevation, UTC' },
                { name: 'max_elevation_deg', type: 'number',             description: 'Maximum elevation angle reached during the pass, in degrees' },
                { name: 'direction',         type: 'string',             description: 'Compass direction at max elevation (N, NE, E, SE, S, SW, W, NW, and 8 intermediate points)' },
              ]} />
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── POST /api/chat ─────────────────────────────────────────────────── */}
          <section id="chat">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="POST" />
              <code className="font-mono text-[13px] text-white">/api/chat</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              AI agent powered by Claude. Accepts natural-language satellite questions and streams a text response.
              The agent autonomously decides which orbital tools to call — satellite position, pass prediction,
              overhead queries — and synthesises the results into a plain-English answer.
              Rate-limited to 15 requests per IP per minute.
            </p>

            <div className="mb-5">
              <SectionLabel>Request Body (JSON)</SectionLabel>
              <ParamsTable params={[
                { name: 'message', type: 'string',  required: true,  description: 'User question. Max 500 characters.' },
                { name: 'history', type: 'array',   required: false, description: 'Prior turns for context: [{ role: "user" | "assistant", content: string }]' },
              ]} />
            </div>

            <div className="mb-5">
              <SectionLabel>Example</SectionLabel>
              <CodeBlock code={[
                `curl -X POST ${BASE}/api/chat \\`,
                `  -H "Content-Type: application/json" \\`,
                `  -d '{"message":"Where is the ISS right now?"}'`,
              ].join('\n')} />
            </div>

            <div className="mb-5">
              <SectionLabel>Response — plain text stream (Content-Type: text/plain)</SectionLabel>
              <CodeBlock code={[
                'The ISS (ZARYA) is currently at:',
                '- Altitude: 421 km',
                '- Latitude: -12.4°, Longitude: 87.2°',
                '- Velocity: 7.66 km/s',
                '- Orbital period: 92.9 min',
                '',
                '__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS (ZARYA)"}',
              ].join('\n')} />
            </div>

            <div className="p-3 border border-[rgba(255,255,255,0.06)] rounded-[3px] bg-[rgba(255,255,255,0.01)]">
              <p className="font-mono text-[9px] text-label leading-relaxed">
                Control tokens appear at the end of the stream for Satlas-native clients.
                Strip lines starting with <code className="text-secondary">__HIGHLIGHT__:</code> and{' '}
                <code className="text-secondary">__SET_FILTER__:</code> when consuming outside the Satlas frontend.
              </p>
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── GET /api/satellite-info ──────────────────────────────────────── */}
          <section id="satellite-info">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="GET" />
              <code className="font-mono text-[13px] text-white">/api/satellite-info</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              Live position and orbital parameters for any tracked satellite. Search by NORAD catalog ID
              (e.g. <code className="text-secondary">25544</code>) or name substring
              (e.g. <code className="text-secondary">ISS</code>, <code className="text-secondary">STARLINK-1234</code>).
              Position is propagated in real time using SGP4 from the latest TLE. Response is cached for 10 seconds.
            </p>

            <div className="mb-5">
              <SectionLabel>Query Parameters</SectionLabel>
              <ParamsTable params={[
                { name: 'query', type: 'string', required: true, description: 'NORAD catalog ID (digits only) or satellite name substring (case-insensitive)' },
              ]} />
            </div>

            <div className="mb-5">
              <SectionLabel>Examples</SectionLabel>
              <div className="space-y-2">
                <CodeBlock code={`curl "${BASE}/api/satellite-info?query=25544"`} />
                <CodeBlock code={`curl "${BASE}/api/satellite-info?query=ISS"`} />
                <CodeBlock code={`curl "${BASE}/api/satellite-info?query=STARLINK-1234"`} />
              </div>
            </div>

            <div className="mb-5">
              <SectionLabel>Response</SectionLabel>
              <CodeBlock code={JSON.stringify({
                name: 'ISS (ZARYA)',
                norad_id: '25544',
                latitude: -12.4123,
                longitude: 87.2034,
                altitude_km: 421.3,
                velocity_kmps: 7.66,
                orbital_period_min: 92.9,
                inclination_deg: 51.64,
              }, null, 2)} />
            </div>

            <div>
              <SectionLabel>Response Schema</SectionLabel>
              <SchemaTable fields={[
                { name: 'name',                 type: 'string',  description: 'Official satellite name from the Space-Track catalog' },
                { name: 'norad_id',             type: 'string',  description: 'NORAD catalog number (zero-padded to 5 digits)' },
                { name: 'latitude',             type: 'number',  description: 'Sub-satellite latitude in decimal degrees (south = negative)' },
                { name: 'longitude',            type: 'number',  description: 'Sub-satellite longitude in decimal degrees (west = negative)' },
                { name: 'altitude_km',          type: 'number',  description: 'Altitude above the WGS-84 ellipsoid in kilometres' },
                { name: 'velocity_kmps',        type: 'number',  description: 'Total orbital speed in km/s (magnitude of 3D velocity vector)' },
                { name: 'orbital_period_min',   type: 'number',  description: 'Orbital period in minutes, derived from mean motion' },
                { name: 'inclination_deg',      type: 'number',  description: 'Orbital inclination in degrees relative to the equatorial plane' },
              ]} />
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── GET /api/satellites ──────────────────────────────────────────── */}
          <section id="satellites">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="GET" />
              <code className="font-mono text-[13px] text-white">/api/satellites</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              Search the full satellite catalog by name or NORAD ID, with optional category filtering.
              Returns name, NORAD ID, and category for each match. At least one of <code className="text-secondary">q</code>{' '}
              or <code className="text-secondary">category</code> is required. Cached for 2 minutes.
            </p>

            <div className="mb-5">
              <SectionLabel>Query Parameters</SectionLabel>
              <ParamsTable params={[
                { name: 'q',        type: 'string',  required: false, description: 'Name substring (case-insensitive) or exact NORAD ID (digits only). At least one of q or category required.' },
                { name: 'category', type: 'string',  required: false, description: 'Filter to a category: STARLINK | GPS | IRIDIUM | DEBRIS | OTHER' },
                { name: 'limit',    type: 'integer', required: false, description: 'Max results to return (1–100). Default: 20' },
              ]} />
            </div>

            <div className="mb-5">
              <SectionLabel>Examples</SectionLabel>
              <div className="space-y-2">
                <CodeBlock code={`curl "${BASE}/api/satellites?q=starlink&limit=5"`} />
                <CodeBlock code={`curl "${BASE}/api/satellites?category=GPS"`} />
                <CodeBlock code={`curl "${BASE}/api/satellites?q=25544"`} />
              </div>
            </div>

            <div className="mb-5">
              <SectionLabel>Response</SectionLabel>
              <CodeBlock code={JSON.stringify({
                total: 7042,
                limit: 5,
                results: [
                  { name: 'STARLINK-1007', norad_id: '44713', category: 'STARLINK' },
                  { name: 'STARLINK-1008', norad_id: '44714', category: 'STARLINK' },
                  { name: 'STARLINK-1009', norad_id: '44715', category: 'STARLINK' },
                  { name: 'STARLINK-1010', norad_id: '44716', category: 'STARLINK' },
                  { name: 'STARLINK-1011', norad_id: '44717', category: 'STARLINK' },
                ],
              }, null, 2)} />
            </div>

            <div>
              <SectionLabel>Response Schema</SectionLabel>
              <SchemaTable fields={[
                { name: 'total',              type: 'integer', description: 'Total number of matching satellites (before limit is applied)' },
                { name: 'limit',              type: 'integer', description: 'Max results returned, as requested' },
                { name: 'results[].name',     type: 'string',  description: 'Official satellite name from the Space-Track catalog' },
                { name: 'results[].norad_id', type: 'string',  description: 'NORAD catalog number (5-digit, zero-padded)' },
                { name: 'results[].category', type: 'string',  description: 'Derived category: STARLINK | GPS | IRIDIUM | DEBRIS | OTHER' },
              ]} />
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── GET /api/overhead ────────────────────────────────────────────── */}
          <section id="overhead">
            <div className="flex items-center gap-3 mb-3">
              <MethodBadge method="GET" />
              <code className="font-mono text-[13px] text-white">/api/overhead</code>
            </div>
            <p className="font-mono text-[11px] font-light text-secondary mb-6 leading-relaxed">
              All satellites currently above the horizon at a given location, sorted by elevation angle.
              Propagates the full catalog (31,000+ objects) to the current instant using SGP4. Response time
              is typically 3–8 seconds on cold start, under 1 second warm. Cached for 15 seconds.
            </p>

            <div className="mb-5">
              <SectionLabel>Query Parameters</SectionLabel>
              <ParamsTable params={[
                { name: 'latitude',      type: 'number',  required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
                { name: 'longitude',     type: 'number',  required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
                { name: 'min_elevation', type: 'number',  required: false, description: 'Minimum elevation angle in degrees. Default: 10' },
                { name: 'category',      type: 'string',  required: false, description: 'Restrict to a category: STARLINK | GPS | IRIDIUM | DEBRIS | OTHER' },
                { name: 'limit',         type: 'integer', required: false, description: 'Max results to return (1–50). Default: 25' },
              ]} />
            </div>

            <div className="mb-5">
              <SectionLabel>Examples</SectionLabel>
              <div className="space-y-2">
                <CodeBlock code={`curl "${BASE}/api/overhead?latitude=-37.81&longitude=144.96"`} />
                <CodeBlock code={`curl "${BASE}/api/overhead?latitude=51.51&longitude=-0.13&category=STARLINK&limit=10"`} />
              </div>
            </div>

            <div className="mb-5">
              <SectionLabel>Response</SectionLabel>
              <CodeBlock code={JSON.stringify({
                location:   { latitude: -37.81, longitude: 144.96 },
                count:      142,
                limit:      25,
                satellites: [
                  { name: 'ISS (ZARYA)', norad_id: '25544', category: 'OTHER', elevation_deg: 68.4, azimuth_deg: 312.7, direction: 'NW' },
                  { name: 'STARLINK-3109', norad_id: '52750', category: 'STARLINK', elevation_deg: 54.1, azimuth_deg: 88.2, direction: 'E' },
                  { name: 'STARLINK-3204', norad_id: '53240', category: 'STARLINK', elevation_deg: 41.8, azimuth_deg: 201.5, direction: 'SSW' },
                ],
              }, null, 2)} />
            </div>

            <div>
              <SectionLabel>Response Schema</SectionLabel>
              <SchemaTable fields={[
                { name: 'location',                   type: 'object',  description: 'Echo of the requested latitude/longitude' },
                { name: 'count',                      type: 'integer', description: 'Total satellites found above min_elevation (before limit)' },
                { name: 'limit',                      type: 'integer', description: 'Max results returned, as requested' },
                { name: 'satellites[].name',          type: 'string',  description: 'Official satellite name' },
                { name: 'satellites[].norad_id',      type: 'string',  description: 'NORAD catalog number' },
                { name: 'satellites[].category',      type: 'string',  description: 'STARLINK | GPS | IRIDIUM | DEBRIS | OTHER' },
                { name: 'satellites[].elevation_deg', type: 'number',  description: 'Current elevation angle above horizon in degrees' },
                { name: 'satellites[].azimuth_deg',   type: 'number',  description: 'Current azimuth in degrees (0° = North, clockwise)' },
                { name: 'satellites[].direction',     type: 'string',  description: '16-point compass direction (N, NNE, NE … NNW)' },
              ]} />
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── Errors ──────────────────────────────────────────────────────── */}
          <section id="errors">
            <h2 className="font-mono text-[15px] font-bold text-white mb-4 tracking-[-0.01em]">Errors</h2>
            <p className="font-mono text-[11px] font-light text-secondary mb-5 leading-relaxed">
              All error responses use a consistent JSON envelope with a single <code className="text-secondary">error</code> field.
            </p>

            <div className="mb-5">
              <SectionLabel>Error Response Shape</SectionLabel>
              <CodeBlock code={JSON.stringify({ error: 'Satellite 99999 not found in catalog' }, null, 2)} />
            </div>

            <SectionLabel>HTTP Status Codes</SectionLabel>
            <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] divide-y divide-[rgba(255,255,255,0.04)]">
              {[
                { code: '200', label: 'OK',                    desc: 'Request succeeded.' },
                { code: '400', label: 'Bad Request',           desc: 'Missing or invalid query parameter.' },
                { code: '404', label: 'Not Found',             desc: 'Satellite NORAD ID or name not found in the catalog.' },
                { code: '405', label: 'Method Not Allowed',    desc: 'Wrong HTTP method for the endpoint.' },
                { code: '429', label: 'Too Many Requests',     desc: 'Rate limit exceeded (chat endpoint: 15 req/min per IP).' },
                { code: '503', label: 'Service Unavailable',   desc: 'Upstream dependency (orbital service, Space-Track) temporarily unreachable.' },
              ].map(row => (
                <div key={row.code} className="flex items-start gap-4 px-4 py-2.5">
                  <span className={`font-mono text-[11px] w-8 flex-shrink-0 ${
                    row.code.startsWith('2') ? 'text-accent' :
                    row.code.startsWith('4') ? 'text-warn' : 'text-danger'
                  }`}>{row.code}</span>
                  <span className="font-mono text-[10px] text-secondary w-36 flex-shrink-0">{row.label}</span>
                  <span className="font-mono text-[10px] font-light text-label">{row.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[rgba(255,255,255,0.05)]" />

          {/* ── Data Sources ────────────────────────────────────────────────── */}
          <section id="data">
            <h2 className="font-mono text-[15px] font-bold text-white mb-4 tracking-[-0.01em]">Data Sources</h2>

            <div className="space-y-4">
              {[
                {
                  name: 'Space-Track.org',
                  detail: 'TLE catalog',
                  desc: 'The authoritative source for all satellite tracking data, operated by US Space Command. Satlas fetches the full GP catalog (non-decayed objects, epoch within 90 days) every 2 hours and caches it on Vercel Edge. Data is subject to Space-Track.org redistribution terms.',
                },
                {
                  name: 'SGP4 / skyfield',
                  detail: 'Orbital propagation',
                  desc: 'All position, velocity, and pass predictions use the SGP4 simplified perturbations model — the same standard used by Space-Track and Celestrak. The Python skyfield library handles ephemeris computations on the orbital service. The Three.js globe uses satellite.js (SGP4 port) for real-time client-side propagation of 31k+ objects.',
                },
                {
                  name: 'Vercel Edge Network',
                  detail: 'Catalog delivery',
                  desc: 'The /api/catalog endpoint is cached at the edge with s-maxage=7200. Most requests are served by the nearest edge node in under 100 ms worldwide. The stale-while-revalidate=86400 header means the cache is always warm.',
                },
                {
                  name: 'AWS ECS Fargate',
                  detail: 'Orbital service',
                  desc: 'The api.satlas.app orbital service runs on ECS Fargate in us-east-1. It maintains an in-memory TLE cache refreshed from the CloudFront distribution, handles SGP4 propagation, and serves pass predictions via FastAPI.',
                },
                {
                  name: 'Claude (Anthropic)',
                  detail: 'AI agent',
                  desc: 'The /api/chat endpoint uses Claude claude-haiku-4-5-20251001 for tool routing (~1s) and Sonnet for the streaming answer. The agent orchestrates orbital tools autonomously — it decides what to look up, calls the tools, and synthesises a response.',
                },
              ].map(src => (
                <div key={src.name} className="border border-[rgba(255,255,255,0.06)] rounded-[3px] px-4 py-3">
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span className="font-mono text-[11px] text-white">{src.name}</span>
                    <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-label">{src.detail}</span>
                  </div>
                  <p className="font-mono text-[10px] font-light text-label leading-relaxed">{src.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="h-8" />

        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[rgba(255,255,255,0.07)] px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">← Globe</Link>
            <a
              href="https://github.com/PremaanshVyas/satlas"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors"
            >
              GitHub
            </a>
          </div>
          <span className="font-mono text-[9px] text-[#1a1a1a] uppercase tracking-[0.06em]">Satlas · open-source space situational awareness</span>
        </div>
      </footer>

    </div>
  )
}
