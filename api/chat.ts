import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as satellite from 'satellite.js'

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const MODEL_DETECT = 'claude-haiku-4-5-20251001'
const MODEL_ANSWER  = 'claude-haiku-4-5-20251001'

// ── Rate limiting (in-process, per warm instance) ─────────────────────────────

const WINDOW_MS = 60_000   // 1 minute sliding window
const MAX_REQ   = 15       // requests per IP per window
const MAX_MSG_LEN = 500    // characters

const ipWindows = new Map<string, { count: number; resetAt: number }>()

// Purge stale entries every ~100 calls to prevent unbounded growth
let callsSincePurge = 0
function checkRateLimit(ip: string): boolean {
  if (++callsSincePurge > 100) {
    const now = Date.now()
    for (const [k, v] of ipWindows) if (now > v.resetAt) ipWindows.delete(k)
    callsSincePurge = 0
  }
  const now = Date.now()
  const entry = ipWindows.get(ip)
  if (!entry || now > entry.resetAt) { ipWindows.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return true }
  if (entry.count >= MAX_REQ) return false
  entry.count++
  return true
}

// ── TLE helpers ───────────────────────────────────────────────────────────────

interface TleRecord { name: string; noradId: string; tle1: string; tle2: string }

function parseTleText(text: string): TleRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const out: TleRecord[] = []
  let i = 0
  while (i + 2 < lines.length) {
    const name = lines[i], tle1 = lines[i + 1], tle2 = lines[i + 2]
    if (tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
      out.push({ name, noradId: tle1.slice(2, 7).trim(), tle1, tle2 })
      i += 3
    } else { i++ }
  }
  return out
}

// ── Catalog fetch for bulk queries (overhead) ────────────────────────────────

const CATALOG_BASE = process.env.CATALOG_BASE ?? 'https://getsatlas.vercel.app'
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL ?? 'http://satlas-1659207311.ap-southeast-2.elb.amazonaws.com'

async function fetchCatalogTles(): Promise<TleRecord[]> {
  const res = await fetch(`${CATALOG_BASE}/api/catalog`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
  const tles = parseTleText(await res.text())
  // Space-Track prefixes name lines with "0 " — strip it
  return tles.map(r => ({ ...r, name: r.name.replace(/^0 /, '') }))
}

// Fetch a single TLE from the CloudFront catalog — avoids CelesTrak cloud IP blocks
const CLOUDFRONT_CATALOG = process.env.CLOUDFRONT_CATALOG ?? 'https://dgsll6twimcwl.cloudfront.net/catalog.tle'
let _catalogCache: TleRecord[] | null = null
let _catalogFetchedAt = 0
async function fetchTle(query: string): Promise<TleRecord | null> {
  const now = Date.now()
  if (!_catalogCache || now - _catalogFetchedAt > 120_000) {
    const res = await fetch(CLOUDFRONT_CATALOG, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const tles = parseTleText(await res.text())
    _catalogCache = tles.map(r => ({ ...r, name: r.name.replace(/^0 /, '') }))
    _catalogFetchedAt = now
  }
  const isNorad = /^\d+$/.test(query.trim())
  if (isNorad) return _catalogCache.find(r => r.noradId === query.trim()) ?? null
  const q = query.trim().toUpperCase()
  return _catalogCache.find(r => r.name.toUpperCase().includes(q)) ?? null
}

function isDebrisOrRocketBody(name: string): boolean {
  const n = name.toUpperCase()
  return n.endsWith(' DEB') || n.includes(' DEB ') || n.includes('DEBRIS') ||
         n.endsWith(' R/B') || n.endsWith(' RB') || n.includes('ROCKET BODY')
}

// CelesTrak CATNR and NAME queries work from cloud/Vercel IPs (ADR: only GROUP=active is blocked).
async function fetchTle(query: string): Promise<TleRecord | null> {
  const isNorad = /^\d+$/.test(query.trim())
  const param = isNorad ? `CATNR=${encodeURIComponent(query.trim())}` : `NAME=${encodeURIComponent(query.trim())}`
  const url = `https://celestrak.org/NORAD/elements/gp.php?${param}&FORMAT=TLE`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'satlas/1.0 (portfolio project)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return parseTleText(text)[0] ?? null
  } catch {
    return null
  }
}

// ── Orbital computations (satellite.js, runs in Vercel Node.js) ───────────────

const MU = 398600.4418  // km³/s²
const R_EARTH = 6371    // km

interface Pass {
  start: string
  end: string
  max_elevation: number
  direction: string
  duration_seconds: number
}

function azToCompass(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((azDeg % 360) + 360) / 45) % 8]
}

function computePasses(rec: TleRecord, latDeg: number, lonDeg: number, hoursAhead: number): Pass[] {
  const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
  const observerGd = {
    latitude:  satellite.degreesToRadians(latDeg),
    longitude: satellite.degreesToRadians(lonDeg),
    height: 0.01,
  }

  const passes: Pass[] = []
  const STEP_MS = 20_000  // 20-second steps — fine enough for 90-min ISS orbit
  const now = Date.now()
  const endMs = now + hoursAhead * 3_600_000
  const MIN_EL = 10  // degrees

  let passStart: number | null = null
  let passEnd: number | null = null
  let maxEl = 0
  let maxElAz = 0

  for (let t = now; t <= endMs; t += STEP_MS) {
    const date = new Date(t)
    const posVel = satellite.propagate(satrec, date)
    if (!posVel.position || typeof posVel.position === 'boolean') continue

    const gmst = satellite.gstime(date)
    const ecf = satellite.eciToEcf(posVel.position as satellite.EciVec3<number>, gmst)
    const look = satellite.ecfToLookAngles(observerGd, ecf)
    const elDeg = look.elevation * (180 / Math.PI)
    const azDeg = look.azimuth * (180 / Math.PI)

    if (elDeg >= MIN_EL) {
      if (passStart === null) passStart = t
      passEnd = t + STEP_MS
      if (elDeg > maxEl) { maxEl = elDeg; maxElAz = azDeg }
    } else if (passStart !== null) {
      passes.push({
        start: new Date(passStart).toISOString(),
        end: new Date(passEnd!).toISOString(),
        max_elevation: Math.round(maxEl),
        direction: azToCompass(maxElAz),
        duration_seconds: Math.round((passEnd! - passStart) / 1000),
      })
      passStart = null; passEnd = null; maxEl = 0
      if (passes.length >= 8) break
    }
  }

  return passes
}

// ── Tool implementations (no Railway) ────────────────────────────────────────

async function toolGetSatelliteInfo(query: string): Promise<unknown> {
  const res = await fetch(
    `${ORBITAL_SERVICE_URL}/satellite-info?query=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) return { error: `Satellite not found: ${query}` }
  return res.json()
}

async function toolPredictPasses(
  noradOrName: string,
  lat: number,
  lon: number,
  hoursAhead: number,
): Promise<unknown> {
  const rec = await fetchTle(noradOrName)
  if (!rec) return { error: `Satellite not found: ${noradOrName}` }
  const passes = computePasses(rec, lat, lon, hoursAhead)
  if (passes.length === 0) return { message: `No passes above 10° in the next ${hoursAhead} hours for this location.` }
  return { satellite: rec.name, norad_id: rec.noradId, passes }
}

async function toolFindSatellitesOverhead(
  lat: number,
  lon: number,
  minElevation: number,
): Promise<unknown> {
  const tles = await fetchCatalogTles()
  const observerGd = {
    latitude: satellite.degreesToRadians(lat),
    longitude: satellite.degreesToRadians(lon),
    height: 0.01,
  }
  const now = new Date()
  // Compute GMST once — all satellites are propagated to the same instant
  const gmst = satellite.gstime(now)

  const overhead: Array<{ name: string; norad_id: string; elevation: number; direction: string }> = []

  for (const rec of tles) {
    if (isDebrisOrRocketBody(rec.name)) continue
    try {
      const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
      const posVel = satellite.propagate(satrec, now)
      if (!posVel.position || typeof posVel.position === 'boolean') continue
      const ecf = satellite.eciToEcf(posVel.position as satellite.EciVec3<number>, gmst)
      const look = satellite.ecfToLookAngles(observerGd, ecf)
      const elDeg = look.elevation * (180 / Math.PI)
      if (elDeg >= minElevation) {
        overhead.push({
          name: rec.name,
          norad_id: rec.noradId,
          elevation: Math.round(elDeg),
          direction: azToCompass(look.azimuth * (180 / Math.PI)),
        })
      }
    } catch { continue }
  }

  overhead.sort((a, b) => b.elevation - a.elevation)
  const top = overhead.slice(0, 25)
  return {
    location: { latitude: lat, longitude: lon },
    count: overhead.length,
    satellites: top,
    ...(overhead.length > 25 ? { note: `Showing top 25 of ${overhead.length} above ${minElevation}°` } : {}),
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(now: Date, shownCategories: string[], categoryCounts: Record<string, number>): string {
  const utcTime = now.toUTCString()
  const melbourneTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'full',
    timeStyle: 'long',
  })
  const shownList = shownCategories.join(', ')
  const countLines = Object.entries(categoryCounts).length > 0
    ? Object.entries(categoryCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, n]) => `  ${cat}: ${n.toLocaleString()}`)
        .join('\n')
    : '  (loading…)'
  return `You are Satlas's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics.\n\n\
TOOL USAGE RULES:\
\n- get_satellite_info: call when the user asks about ANY specific satellite — "where is X", "tell me about X", "what altitude is X". ALWAYS call this tool; NEVER answer satellite position, altitude, velocity, inclination, or orbital period from your training knowledge. When the user's message includes a NORAD ID (plain integer), pass just that number. Always call highlight_on_globe IN THE SAME RESPONSE (in parallel).\
\n- predict_passes: call when the user asks about pass times, ISS visibility, or when a satellite will be overhead. Requires latitude, longitude, and the satellite's NORAD ID or name.\
\n- highlight_on_globe: call IN THE SAME TURN as get_satellite_info — never wait for satellite info first. Do not mention the highlight in your text.\
\n- set_category_filter: FILTER RULES:\
\n  * Currently shown: ${shownList}\
\n  * "Show X" / "also show X" = ADD X to current. Call with CURRENT + X.\
\n  * "Only show X" / "just X" = REPLACE. Call with just X.\
\n  * "Hide X" = REMOVE X. Call with current minus X.\
\n  * "Show all" / "reset" = call with all 5 categories.\
\n  * ALWAYS call immediately — never argue about current state.\
\n- find_satellites_overhead: call when the user asks what satellites are currently overhead, above, or passing over a location right now. Infer lat/lon from well-known cities (Sydney: -33.87, 151.21; Melbourne: -37.81, 144.96; London: 51.51, -0.13; New York: 40.71, -74.01; Tokyo: 35.68, 139.69). Ask if the location is ambiguous.\
\n\nIMPORTANT — you are the PRESENTER, not the calculator. Every value you show must come from a tool result. Never compute or guess position, altitude, pass times, or any data value.\
\n\nIF ANY TOOL RETURNS AN ERROR: respond with exactly "The live data service is temporarily unavailable — please try again in a moment." Do NOT use training knowledge.\
\n\nCurrent time (pre-computed): UTC: ${utcTime} | Melbourne (AEST/AEDT): ${melbourneTime}\
\n\nLive catalog counts (from the tracking globe — use these directly when asked about how many of each type):\
\n${countLines}\
\n\nFor pass times (UTC ISO 8601), convert to local timezone only when you have been given the offset. For Australian locations use the Melbourne time above as reference.\
\nBe concise: list each pass on one line with local time, max elevation, and compass direction.`
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const GET_SAT_INFO_TOOL: Anthropic.Tool = {
  name: 'get_satellite_info',
  description: 'Look up a satellite by name or NORAD ID and return its current position, altitude, velocity, and orbital parameters. Call for any question about a specific satellite. After calling, also call highlight_on_globe in the same turn.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Satellite name or NORAD catalog number. Examples: "hubble", "25544", "STARLINK-1". Pass just the NORAD number when one is given.' },
    },
    required: ['query'],
  },
}

const PREDICT_PASSES_TOOL: Anthropic.Tool = {
  name: 'predict_passes',
  description: 'Predict upcoming passes of a satellite over a given location. Returns start/end times (UTC), max elevation in degrees, and compass direction. Use for any question about when a satellite will be visible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      satellite: { type: 'string', description: 'Satellite NORAD ID or name. The ISS is "25544".' },
      latitude:  { type: 'number', description: 'Observer latitude in decimal degrees. South is negative. Melbourne is -37.8136.' },
      longitude: { type: 'number', description: 'Observer longitude in decimal degrees. West is negative. Melbourne is 144.9631.' },
      hours_ahead: { type: 'number', description: 'Hours to search ahead. Default 24.' },
    },
    required: ['satellite', 'latitude', 'longitude'],
  },
}

const HIGHLIGHT_TOOL: Anthropic.Tool = {
  name: 'highlight_on_globe',
  description: 'Signal the 3D globe to focus on a satellite. Call alongside get_satellite_info — never wait for satellite info first. Does not affect your text response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      norad_id: { type: 'string', description: 'NORAD catalog number. ISS is "25544".' },
      satellite_name: { type: 'string', description: 'Human-readable name, e.g. "ISS".' },
    },
    required: ['norad_id', 'satellite_name'],
  },
}

const SET_FILTER_TOOL: Anthropic.Tool = {
  name: 'set_category_filter',
  description: 'Update the category filter on the 3D globe. Pass the complete list of categories that should be visible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'] },
        description: 'List of categories to show. All others are hidden.',
      },
    },
    required: ['categories'],
  },
}

const FIND_OVERHEAD_TOOL: Anthropic.Tool = {
  name: 'find_satellites_overhead',
  description: 'Find all satellites currently above the horizon at a given location, sorted by elevation. Use when the user asks what satellites are visible, overhead, or passing over a location right now.',
  input_schema: {
    type: 'object' as const,
    properties: {
      latitude:      { type: 'number', description: 'Observer latitude in decimal degrees. South is negative. Melbourne is -37.8136.' },
      longitude:     { type: 'number', description: 'Observer longitude in decimal degrees. West is negative. Melbourne is 144.9631.' },
      min_elevation: { type: 'number', description: 'Minimum elevation in degrees above the horizon. Default 10.' },
    },
    required: ['latitude', 'longitude'],
  },
}

const TOOLS = [GET_SAT_INFO_TOOL, PREDICT_PASSES_TOOL, HIGHLIGHT_TOOL, SET_FILTER_TOOL, FIND_OVERHEAD_TOOL]

// ── Input interfaces ──────────────────────────────────────────────────────────

interface SatInfoInput   { query: string }
interface PassesInput    { satellite: string; latitude: number; longitude: number; hours_ahead?: number }
interface HighlightInput { norad_id: string; satellite_name: string; latitude?: number; longitude?: number }
interface SetFilterInput { categories: ('STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER')[] }
interface OverheadInput  { latitude: number; longitude: number; min_elevation?: number }
interface HistoryMessage { role: 'user' | 'assistant'; content: string }

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] as string ?? '').split(',')[0].trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment.' })
    return
  }

  const { message, history = [], shownCategories = ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'], categoryCounts = {} } =
    req.body as { message: string; history?: HistoryMessage[]; shownCategories?: string[]; categoryCounts?: Record<string, number> }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: 'Message is required.' }); return
  }
  if (message.length > MAX_MSG_LEN) {
    res.status(400).json({ error: `Message too long (max ${MAX_MSG_LEN} characters).` }); return
  }

  const systemPrompt = buildSystemPrompt(new Date(), shownCategories, categoryCounts)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const historyMessages: Anthropic.MessageParam[] = history.map(m => ({
      role: m.role,
      content: m.role === 'assistant'
        ? m.content.split('\n__HIGHLIGHT__:')[0].split('\n__SET_FILTER__:')[0]
        : m.content,
    }))

    const currentMessages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ]

    const response1 = await client.messages.create({
      model: MODEL_DETECT,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    })

    let pendingHighlight: HighlightInput | null = null
    let pendingSetFilter: SetFilterInput | null = null

    if (response1.stop_reason === 'tool_use') {
      const messages: Anthropic.MessageParam[] = [
        ...currentMessages,
        { role: 'assistant', content: response1.content },
      ]

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      const satInfoPositions = new Map<string, { latitude: number; longitude: number }>()

      for (const block of response1.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'get_satellite_info') {
          const input = block.input as SatInfoInput
          const result = await toolGetSatelliteInfo(input.query)
          const r = result as Record<string, unknown>
          if (r && typeof r.norad_id === 'string' && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
            satInfoPositions.set(r.norad_id, { latitude: r.latitude, longitude: r.longitude })
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })

        } else if (block.name === 'predict_passes') {
          const input = block.input as PassesInput
          const result = await toolPredictPasses(input.satellite, input.latitude, input.longitude, input.hours_ahead ?? 24)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })

        } else if (block.name === 'highlight_on_globe') {
          pendingHighlight = block.input as HighlightInput
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'ok' })

        } else if (block.name === 'set_category_filter') {
          pendingSetFilter = block.input as SetFilterInput
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'ok' })

        } else if (block.name === 'find_satellites_overhead') {
          const input = block.input as OverheadInput
          const result = await toolFindSatellitesOverhead(input.latitude, input.longitude, input.min_elevation ?? 10)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })

        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'error: unknown tool', is_error: true })
        }
      }

      // Enrich highlight with real position from satellite info if available.
      if (pendingHighlight) {
        const pos = satInfoPositions.get(pendingHighlight.norad_id)
        if (pos) pendingHighlight = { ...pendingHighlight, ...pos }
      }

      messages.push({ role: 'user', content: toolResults })

      const stream2 = client.messages.stream({
        model: MODEL_ANSWER,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })
      for await (const event of stream2) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(event.delta.text)
        }
      }
    } else {
      for (const block of response1.content) {
        if (block.type === 'text') res.write(block.text)
      }
    }

    if (pendingHighlight) res.write(`\n__HIGHLIGHT__:${JSON.stringify(pendingHighlight)}\n`)
    if (pendingSetFilter) res.write(`\n__SET_FILTER__:${JSON.stringify(pendingSetFilter)}\n`)
    res.end()
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 529 || err.status === 503) {
        res.write("The AI is overloaded right now — please try again in a moment.")
      } else if (err.status === 429) {
        res.write("Rate limit reached — please wait a moment and try again.")
      } else if (err.status === 401) {
        res.write("AI service configuration error — please contact support.")
      } else {
        res.write("The AI service returned an error — please try again.")
      }
    } else {
      res.write("Something went wrong — please try again.")
    }
    res.end()
  }
}
