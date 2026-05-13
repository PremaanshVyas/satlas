import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL_DETECT = 'claude-haiku-4-5-20251001'  // tool-detection turn
const MODEL_ANSWER  = 'claude-haiku-4-5-20251001'  // answer turn — haiku TTFT ~0.5s keeps total under Vercel 10s hard cap
const ORBITAL_FETCH_TIMEOUT_MS = 5000              // fail fast on Railway cold starts

function buildSystemPrompt(now: Date): string {
  return `You are Aussie Sky's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics. \
\n\nTOOL USAGE RULES:\
\n- predict_iss_passes: call when the user asks about ISS visibility or pass times from a location.\
\n- find_satellites_overhead: call when the user asks what satellites are overhead, above them, or currently visible from their location.\
\n- get_satellite_info: call when the user asks about a specific satellite by name or NORAD ID (e.g. "where is Hubble", "tell me about Starlink-1"). Always call highlight_on_globe IN THE SAME RESPONSE (in parallel) using the satellite's known NORAD ID.\
\n- highlight_on_globe: call this IN THE SAME TURN as get_satellite_info — do not wait for get_satellite_info to return first. Use the NORAD ID you already know (ISS=25544, Hubble=20580). ONLY call for satellites confirmed in the ~10,000-satellite catalog. Do not mention the highlight in your text response.\
\n\nFormat pass times in the user's likely local timezone (Melbourne queries → AEST/AEDT, Tokyo → JST, etc.). \
Be concise: list each pass on one line with local time, max elevation, and compass direction. \
Current date and time (UTC): ${now.toUTCString()}. Use this as the authoritative current time for all calculations.`
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    return res
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

const PREDICT_PASSES_TOOL: Anthropic.Tool = {
  name: 'predict_iss_passes',
  description:
    'Predict upcoming ISS passes over a given location on Earth. Returns start/end times in UTC ISO 8601, max elevation in degrees, and compass direction (N/NE/E/SE/S/SW/W/NW). Use this whenever the user asks about ISS visibility, sightings, or pass times from a specific place.',
  input_schema: {
    type: 'object' as const,
    properties: {
      latitude: {
        type: 'number',
        description: 'Observer latitude in decimal degrees. South is negative. Melbourne is -37.8136.',
      },
      longitude: {
        type: 'number',
        description: 'Observer longitude in decimal degrees. West is negative. Melbourne is 144.9631.',
      },
      hours_ahead: {
        type: 'number',
        description: 'Hours ahead to search for passes. Default 24. Use 48 for "this week" or multi-day queries.',
      },
    },
    required: ['latitude', 'longitude'],
  },
}

const HIGHLIGHT_TOOL: Anthropic.Tool = {
  name: 'highlight_on_globe',
  description:
    'Signal the 3D globe to focus the camera on a satellite and animate a pulse around it. Call this whenever the user is asking about a specific satellite — always include it alongside your text response about that satellite. The ISS NORAD ID is 25544. This does not affect your text response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      norad_id: {
        type: 'string',
        description: 'NORAD catalog number of the satellite. The ISS is "25544".',
      },
      satellite_name: {
        type: 'string',
        description: 'Human-readable name, e.g. "ISS".',
      },
    },
    required: ['norad_id', 'satellite_name'],
  },
}

const FIND_OVERHEAD_TOOL: Anthropic.Tool = {
  name: 'find_satellites_overhead',
  description:
    'Find satellites currently overhead within a given radius of an observer. Returns up to 20 satellites sorted by elevation angle (highest first), with each satellite\'s name, NORAD ID, altitude, azimuth, and elevation. Use when the user asks "what satellites are over me", "what\'s overhead right now", or "what can I see from [location]".',
  input_schema: {
    type: 'object' as const,
    properties: {
      latitude: {
        type: 'number',
        description: 'Observer latitude in decimal degrees. South is negative.',
      },
      longitude: {
        type: 'number',
        description: 'Observer longitude in decimal degrees. West is negative.',
      },
      radius_km: {
        type: 'number',
        description:
          'Search radius in kilometres from the observer\'s ground position. Default 2000. Use 1000 for a tighter local search.',
      },
    },
    required: ['latitude', 'longitude'],
  },
}

const GET_SAT_INFO_TOOL: Anthropic.Tool = {
  name: 'get_satellite_info',
  description:
    'Look up a satellite by name or NORAD catalog ID and get its current orbital position and parameters. Use when the user asks about a specific satellite by name (e.g. "where is Hubble", "what is the ISS altitude", "tell me about Starlink-1"). After calling this tool, also call highlight_on_globe with the returned norad_id so the globe focuses on the satellite.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Satellite name (case-insensitive substring match) or NORAD catalog number as a string. Examples: "hubble", "25544", "starlink-1".',
      },
    },
    required: ['query'],
  },
}

const TOOLS = [PREDICT_PASSES_TOOL, HIGHLIGHT_TOOL, FIND_OVERHEAD_TOOL, GET_SAT_INFO_TOOL]

interface PassesInput {
  latitude: number
  longitude: number
  hours_ahead?: number
}

interface HighlightInput {
  norad_id: string
  satellite_name: string
  latitude?: number
  longitude?: number
}

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

async function callOrbitalService(input: PassesInput): Promise<unknown> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    hours_ahead: String(input.hours_ahead ?? 24),
  })
  let res: Response
  try {
    res = await fetchWithTimeout(`${ORBITAL_SERVICE_URL}/predict-passes?${params}`, ORBITAL_FETCH_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { error: 'Orbital service timed out — it may be waking up. Try again in a moment.' }
    throw err
  }
  if (!res.ok) return { error: `Orbital service returned ${res.status}` }
  return res.json()
}

interface OverheadInput {
  latitude: number
  longitude: number
  radius_km?: number
}

interface SatInfoInput {
  query: string
}

async function callOverheadService(input: OverheadInput): Promise<unknown> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    radius_km: String(input.radius_km ?? 2000),
  })
  let res: Response
  try {
    res = await fetchWithTimeout(`${ORBITAL_SERVICE_URL}/satellites-overhead?${params}`, ORBITAL_FETCH_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { error: 'Orbital service timed out — it may be waking up. Try again in a moment.' }
    throw err
  }
  if (!res.ok) return { error: `Orbital service returned ${res.status}` }
  return res.json()
}

async function callSatInfoService(input: SatInfoInput): Promise<unknown> {
  const params = new URLSearchParams({ query: input.query })
  let res: Response
  try {
    res = await fetchWithTimeout(`${ORBITAL_SERVICE_URL}/satellite-info?${params}`, ORBITAL_FETCH_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { error: 'Service timeout' }
    throw err
  }
  if (res.status === 404) return { error: `Satellite not found: ${input.query}` }
  if (!res.ok) throw new Error(`Orbital service returned ${res.status}`)
  return res.json()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  const { message, history = [] } = req.body as { message: string; history?: HistoryMessage[] }
  const now = new Date()
  const systemPrompt = buildSystemPrompt(now)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const historyMessages: Anthropic.MessageParam[] = history.map(m => ({
      role: m.role,
      // Strip __HIGHLIGHT__ directives from assistant entries — Claude doesn't need to see those
      content:
        m.role === 'assistant' && m.content.includes('__HIGHLIGHT__')
          ? m.content.split('\n__HIGHLIGHT__:')[0]
          : m.content,
    }))

    const currentMessages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: message },
    ]

    // First call: non-streaming — detects and executes all tool calls.
    // highlight_on_globe MUST be called here (alongside get_satellite_info) since the
    // answer turn has tools disabled to prevent haiku calling tools instead of streaming text.
    const response1 = await client.messages.create({
      model: MODEL_DETECT,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    })

    let pendingHighlight: HighlightInput | null = null

    if (response1.stop_reason === 'tool_use') {
      const messages: Anthropic.MessageParam[] = [
        ...currentMessages,
        { role: 'assistant', content: response1.content },
      ]

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      // Maps norad_id → {latitude, longitude} from get_satellite_info results this turn
      const satInfoPositions = new Map<string, { latitude: number; longitude: number }>()

      for (const block of response1.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'predict_iss_passes') {
          const result = await callOrbitalService(block.input as PassesInput)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        } else if (block.name === 'find_satellites_overhead') {
          const result = await callOverheadService(block.input as OverheadInput)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        } else if (block.name === 'get_satellite_info') {
          const result = await callSatInfoService(block.input as SatInfoInput)
          // Store position for highlight enrichment (Claude may call highlight_on_globe after this)
          const r = result as Record<string, unknown>
          if (r && typeof r.norad_id === 'string' && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
            satInfoPositions.set(r.norad_id, { latitude: r.latitude, longitude: r.longitude })
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        } else if (block.name === 'highlight_on_globe') {
          pendingHighlight = block.input as HighlightInput
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'ok',
          })
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'error: unknown tool',
            is_error: true,
          })
        }
      }

      // Enrich the highlight directive with lat/lon from satinfo (if available)
      // This allows Globe.highlightSatellite to fly to the correct position for non-ISS satellites
      if (pendingHighlight) {
        const pos = satInfoPositions.get(pendingHighlight.norad_id)
        if (pos) {
          pendingHighlight = { ...pendingHighlight, ...pos }
        }
      }

      messages.push({ role: 'user', content: toolResults })

      // Stream the final answer — no tools so haiku is forced to produce text, not more tool calls.
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
      // No tool use — write text directly
      for (const block of response1.content) {
        if (block.type === 'text') res.write(block.text)
      }
    }

    // Emit highlight directive after text (frontend strips this from displayed content)
    if (pendingHighlight) {
      res.write(`\n__HIGHLIGHT__:${JSON.stringify(pendingHighlight)}\n`)
    }

    res.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.write(`Error: ${msg}`)
    res.end()
  }
}
