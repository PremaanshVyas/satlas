import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL_DETECT = 'claude-haiku-4-5-20251001'  // tool-detection turn
const MODEL_ANSWER  = 'claude-haiku-4-5-20251001'  // answer turn — haiku TTFT ~0.5s keeps total under Vercel 10s hard cap
const ORBITAL_FETCH_TIMEOUT_MS = 5000              // fail fast on Railway cold starts

function buildSystemPrompt(now: Date, shownCategories: string[]): string {
  const utcTime = now.toUTCString()
  const melbourneTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'full',
    timeStyle: 'long',
  })
  const shownList = shownCategories.join(', ')
  return `You are Aussie Sky's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics. \
\n\nTOOL USAGE RULES:\
\n- predict_iss_passes: call when the user asks about ISS visibility or pass times from a location.\
\n- find_satellites_overhead: call when the user asks what satellites are overhead, above them, or currently visible from their location.\
\n- get_satellite_info: call when the user asks about ANY specific satellite — "where is X", "tell me about X", "what altitude is X", "show me X". ALWAYS call this tool; NEVER answer satellite position, altitude, velocity, inclination, or orbital period from your training knowledge — that data changes daily and your training is outdated. When the user's message includes a NORAD ID (a plain integer, e.g. "NORAD 44713"), pass just that number as the query for exact lookup. If get_satellite_info returns not-found, say "I couldn't find this satellite in our live catalog" — do not guess or fill from memory. Always call highlight_on_globe IN THE SAME RESPONSE (in parallel).\
\n- highlight_on_globe: call this IN THE SAME TURN as get_satellite_info — do not wait for get_satellite_info to return first. ONLY call for satellites confirmed in the live catalog. Do not mention the highlight in your text response.\
\n- set_category_filter: FILTER RULES — read carefully:\
\n  * Currently shown on globe: ${shownList}\
\n  * "Show X" / "turn on X" / "also show X" (no "only") = ADD X to currently shown. Call set_category_filter with CURRENT shown categories PLUS X.\
\n  * "Only show X" / "show only X" / "just X" / "only X" = REPLACE. Call set_category_filter with just X.\
\n  * "Hide X" / "turn off X" / "remove X" = REMOVE X from currently shown.\
\n  * "Show all" / "reset" = call set_category_filter with all 5 categories.\
\n  * ALWAYS call set_category_filter immediately — never say categories are already showing, never argue about current state. Just call the tool with the correct result.\
\n- get_category_counts: call when the user asks how many satellites of a given type are tracked. NEVER guess or compute counts yourself — always call this tool.\
\n\nIMPORTANT — you are the PRESENTER, not the calculator. Every value you show the user must come from a tool result or from data explicitly provided below. Never compute, infer, or guess any data value — not position, not altitude, not timezone offsets, not pass times.\n\nIF ANY TOOL RETURNS AN ERROR OR TIMEOUT: respond with exactly this and nothing else: "The live data service is temporarily unavailable — please try again in a moment." Do NOT use your training knowledge to estimate, guess, or provide any satellite data. Your training data about specific satellite positions, altitudes, and orbital parameters is outdated and must never substitute for a live tool result.\
\n\nCurrent time (pre-computed, use as-is): UTC: ${utcTime} | Melbourne (AEST/AEDT): ${melbourneTime}\
\n\nFor pass times from orbital tool results (which are in UTC ISO 8601), convert to the user's local timezone only when you have been given the offset explicitly. For Australian locations you may use the Melbourne time above as a reference.\
\nBe concise: list each pass on one line with local time, max elevation, and compass direction.`
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

const SET_FILTER_TOOL: Anthropic.Tool = {
  name: 'set_category_filter',
  description:
    'Update the category filter on the 3D globe. Pass the complete list of categories that should be visible after the call. For additive requests ("also show GPS"), include currently shown categories plus the new one. For exclusive requests ("only show Starlink"), pass just the requested category. Always call this tool immediately without arguing.',
  input_schema: {
    type: 'object' as const,
    properties: {
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'] },
        description: 'List of satellite categories to show. All others will be hidden.',
      },
    },
    required: ['categories'],
  },
}

const GET_CATEGORY_COUNTS_TOOL: Anthropic.Tool = {
  name: 'get_category_counts',
  description:
    'Returns how many tracked satellites belong to each category (Starlink, GPS, Iridium, Debris, Other). Use when the user asks how many satellites of a given type are currently tracked.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
}

const TOOLS = [PREDICT_PASSES_TOOL, HIGHLIGHT_TOOL, FIND_OVERHEAD_TOOL, GET_SAT_INFO_TOOL, SET_FILTER_TOOL, GET_CATEGORY_COUNTS_TOOL]

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

interface SetFilterInput {
  categories: ('STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER')[]
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

async function callCategoryCountsService(): Promise<unknown> {
  let res: Response
  try {
    res = await fetchWithTimeout(`${ORBITAL_SERVICE_URL}/satellite-categories`, ORBITAL_FETCH_TIMEOUT_MS)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return { error: 'Service timeout' }
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

  const { message, history = [], shownCategories = ['STARLINK', 'GPS', 'IRIDIUM', 'DEBRIS', 'OTHER'] } = req.body as { message: string; history?: HistoryMessage[]; shownCategories?: string[] }
  const now = new Date()
  const systemPrompt = buildSystemPrompt(now, shownCategories)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const historyMessages: Anthropic.MessageParam[] = history.map(m => ({
      role: m.role,
      // Strip directives from assistant entries — Claude doesn't need to see them
      content: m.role === 'assistant'
        ? m.content.split('\n__HIGHLIGHT__:')[0].split('\n__SET_FILTER__:')[0]
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
    let pendingSetFilter: SetFilterInput | null = null

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
        } else if (block.name === 'set_category_filter') {
          pendingSetFilter = block.input as SetFilterInput
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'ok',
          })
        } else if (block.name === 'get_category_counts') {
          const result = await callCategoryCountsService()
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
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

    // Emit directives after text (frontend strips these from displayed content)
    if (pendingHighlight) {
      res.write(`\n__HIGHLIGHT__:${JSON.stringify(pendingHighlight)}\n`)
    }
    if (pendingSetFilter) {
      res.write(`\n__SET_FILTER__:${JSON.stringify(pendingSetFilter)}\n`)
    }

    res.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.write(`Error: ${msg}`)
    res.end()
  }
}
