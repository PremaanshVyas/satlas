import { Link } from 'react-router-dom'

const BASE = window.location.origin

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
      'Full TLE (Two-Line Element) satellite catalog in 3-line text format. Approximately 30,000+ objects including active satellites, rocket bodies, and debris. Refreshed every 2 hours from Space-Track.org. Data is subject to Space-Track.org redistribution terms.',
    curl: `curl ${BASE}/api/catalog`,
    response: [
      '0 ISS (ZARYA)',
      '1 25544U 98067A   26141.42361111  .00021328  00000-0  38431-3 0  9993',
      '2 25544  51.6397 132.4788 0003527  84.9201  23.3094 15.50036716513899',
      '0 STARLINK-1234',
      '1 48274U 21...',
      '...(~31,000+ objects total)',
    ].join('\n'),
  },
  {
    method: 'GET',
    path: '/api/pass',
    description:
      'Predict upcoming passes of a satellite over a ground location. Returns start/end times (UTC ISO 8601), max elevation in degrees, compass direction, and duration.',
    params: [
      { name: 'norad_id',    type: 'string', required: true,  description: 'NORAD catalog number (e.g. 25544 for ISS)' },
      { name: 'latitude',    type: 'number', required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
      { name: 'longitude',   type: 'number', required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
      { name: 'hours_ahead', type: 'number', required: false, description: 'Hours to search ahead. Default: 24' },
    ],
    curl: `curl "${BASE}/api/pass?norad_id=25544&latitude=-37.81&longitude=144.96&hours_ahead=24"`,
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
  return (
    <span className={`font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[2px] border ${
      method === 'GET'
        ? 'border-[rgba(0,212,255,0.3)] text-accent'
        : 'border-[rgba(255,170,0,0.3)] text-warn'
    }`}>
      {method}
    </span>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-[#050505] border border-[rgba(255,255,255,0.06)] rounded-[3px] p-4 font-mono text-[11px] font-light text-secondary overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {code}
    </pre>
  )
}

function ParamsTable({ params }: { params: Param[] }) {
  return (
    <div className="border border-[rgba(255,255,255,0.06)] rounded-[3px] overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.06)]">
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Parameter</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Type</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Required</th>
            <th className="text-left pb-2 pt-2.5 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-label font-normal">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
          {params.map(p => (
            <tr key={p.name}>
              <td className="py-2.5 px-4 font-mono text-[10px] text-accent">{p.name}</td>
              <td className="py-2.5 px-4 font-mono text-[9px] font-light text-label">{p.type}</td>
              <td className="py-2.5 px-4">
                {p.required ? (
                  <span className="font-mono text-[8px] text-accent">required</span>
                ) : (
                  <span className="font-mono text-[8px] text-label">optional</span>
                )}
              </td>
              <td className="py-2.5 px-4 font-mono text-[10px] font-light text-secondary">{p.description}</td>
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
        <code className="font-mono text-[12px] text-white">{endpoint.path}</code>
      </div>
      <p className="font-mono text-[11px] font-light text-secondary mb-5 leading-relaxed">{endpoint.description}</p>
      {endpoint.params && (
        <div className="mb-5">
          <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Parameters</h3>
          <ParamsTable params={endpoint.params} />
        </div>
      )}
      <div className="mb-5">
        <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Example</h3>
        <CodeBlock code={endpoint.curl} />
      </div>
      <div>
        <h3 className="font-mono text-[7px] uppercase tracking-[0.18em] text-label mb-2">Response</h3>
        <CodeBlock code={endpoint.response} />
      </div>
    </section>
  )
}

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-[rgba(255,255,255,0.07)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-secondary">Satlas API</span>
        </div>
        <Link to="/" className="font-mono text-[9px] uppercase tracking-[0.1em] text-label hover:text-secondary transition-colors">
          ← Back to globe
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-mono text-[22px] font-bold text-white mb-2 tracking-[-0.01em]">API Reference</h1>
        <p className="font-mono text-[11px] font-light text-secondary mb-1">
          Public HTTP API for satellite tracking. No authentication required.
        </p>
        <p className="font-mono text-[10px] text-label">
          Base URL: <span className="text-secondary">{BASE}</span>
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-16 divide-y divide-[rgba(255,255,255,0.06)]">
        {ENDPOINTS.map(ep => (
          <div key={ep.path} className="py-10 first:pt-0">
            <EndpointSection endpoint={ep} />
          </div>
        ))}
      </div>

      <footer className="border-t border-[rgba(255,255,255,0.07)] px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
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
