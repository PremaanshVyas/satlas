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
      'Full TLE (Two-Line Element) satellite catalog in 3-line text format. Approximately 20,000 active objects. Refreshed every 2 hours from Space-Track.org. Data is subject to Space-Track.org redistribution terms.',
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
      { name: 'norad_id',   type: 'string', required: true,  description: 'NORAD catalog number (e.g. 25544 for ISS)' },
      { name: 'latitude',   type: 'number', required: true,  description: 'Observer latitude in decimal degrees (south = negative)' },
      { name: 'longitude',  type: 'number', required: true,  description: 'Observer longitude in decimal degrees (west = negative)' },
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
