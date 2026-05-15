import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import * as satellite from 'satellite.js'

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const MODEL_DETECT = 'claude-haiku-4-5-20251001'
const MODEL_ANSWER  = 'claude-haiku-4-5-20251001'

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

// CelesTrak CATNR and NAME queries work from cloud/Vercel IPs (ADR: only GROUP=active is blocked).
async function fetchTle(query: string): Promise<TleRecord | null> {
  const isNorad = /^\d+$/.test(query.trim())
  const param = isNorad ? `CATNR=${encodeURIComponent(query.trim())}` : `NAME=${encodeURIComponent(query.trim())}`
  const url = `https://celestrak.org/NORAD/elements/gp.php?${param}&FORMAT=TLE`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'aussie-sky/1.0 (portfolio project)' },
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

function computeSatInfo(rec: TleRecord) {
  const satrec = satellite.twoline2satrec(rec.tle1, rec.tle2)
  const now = new Date()
  const posVel = satellite.propagate(satrec, now)
  if (!posVel.position || typeof posVel.position === 'boolean') return { error: 'Propagation failed' }

  const pos = posVel.position as satellite.EciVec3<number>
  const vel = posVel.velocity as satellite.EciVec3<number>
  const gmst = satellite.gstime(now)
  const geod = satellite.eciToGeodetic(pos, gmst)
  const velKms = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)

  const noRads = satrec.no / 60       // rad/min → rad/s
  const a = Math.cbrt(MU / (noRads * noRads))
  const e = satrec.ecco
  const period = (2 * Math.PI / noRads) / 60  // seconds → minutes

  return {
    name: rec.name,
    norad_id: rec.noradId,
    latitude:  +satellite.degreesLat(geod.latitude).toFixed(4),
    longitude: +satellite.degreesLong(geod.longitude).toFixed(4),
    altitude_km: +geod.height.toFixed(1),
    velocity_kms: +velKms.toFixed(3),
    inclination: +(satrec.inclo * 180 / Math.PI).toFixed(2),
    period_minutes: +period.toFixed(2),
    apogee_km:  +(a * (1 + e) - R_EARTH).toFixed(0),
    perigee_km: +(a * (1 - e) - R_EARTH).toFixed(0),
  }
}

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
  const rec = await fetchTle(query)
  if (!rec) return { error: `Satellite not found: ${query}` }
  return computeSatInfo(rec)
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

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(now: Date, shownCategories: string[]): string {
  const utcTime = now.toUTCString()
  const melbourneTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'full',
    timeStyle: 'long',
  })
  const shownList = shownCategories.join(', ')
  return `You are Aussie Sky's AI assistant specialising in space situational awareness. \
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
\n\nIMPORTANT — you are the PRESENTER, not the calculator. Every value you show must come from a tool result. Never compute or guess position, altitude, pass times, or any data value.\
\n\nIF ANY TOOL RETURNS AN ERROR: respond with exactly "The live data service is temporarily unavailable — please try again in a moment." Do NOT use training knowledge.\
\n\nCurrent time (pre-computed): UTC: ${utcTime} | Melbourne (AEST/AEDT): ${melbourneTime}\
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

const TOOLS = [GET_SAT_INFO_TOOL, PREDICT_PASSES_TOOL, HIGHLIGHT_TOOL, SET_FILTER_TOOL]

// ── Input interfaces ──────────────────────────────────────────────────────────

interface SatInfoInput   { query: string }
interface PassesInput    { satellite: string; latitude: number; longitude: number; hours_ahead?: number }
interface HighlightInput { norad_id: string; satellite_name: string; latitude?: number; longitude?: number }
interface SetFilterInput { categories: ('STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER')[] }
interface HistoryMessage { role: 'user' | 'assistant'; content: string }

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return }

  const { message, history = [], shownCategories = ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'] } =
    req.body as { message: string; history?: HistoryMessage[]; shownCategories?: string[] }

  const systemPrompt = buildSystemPrompt(new Date(), shownCategories)
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
    res.write(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    res.end()
  }
}
