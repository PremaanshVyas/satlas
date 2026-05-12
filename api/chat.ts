import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL = 'claude-sonnet-4-6'

function buildSystemPrompt(): string {
  return `You are Aussie Sky's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics. \
\n\nTOOL USAGE RULES:\
\n- predict_iss_passes: call when the user asks about ISS visibility or pass times from a location.\
\n- find_satellites_overhead: call when the user asks what satellites are overhead, above them, or currently visible from their location.\
\n- get_satellite_info: call when the user asks about a specific satellite by name or NORAD ID (e.g. "where is Hubble", "tell me about Starlink-1"). After calling this, also call highlight_on_globe with the returned norad_id.\
\n- highlight_on_globe: ONLY call this for satellites that are confirmed to be in the catalog and rendered on the 3D globe. Currently the catalog contains approximately 1000 LEO satellites fetched from space-track.org. Do NOT call this tool and do NOT claim the globe has highlighted anything if you are unsure whether the satellite is in the catalog. Do not mention the highlight in your text response.\
\n\nFormat pass times in the user's likely local timezone (Melbourne queries → AEST/AEDT, Tokyo → JST, etc.). \
Be concise: list each pass on one line with local time, max elevation, and compass direction. \
Current UTC time: ${new Date().toISOString()}`
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

const TOOLS = [PREDICT_PASSES_TOOL, HIGHLIGHT_TOOL]

interface PassesInput {
  latitude: number
  longitude: number
  hours_ahead?: number
}

interface HighlightInput {
  norad_id: string
  satellite_name: string
}

async function callOrbitalService(input: PassesInput): Promise<unknown> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    hours_ahead: String(input.hours_ahead ?? 24),
  })
  const res = await fetch(`${ORBITAL_SERVICE_URL}/predict-passes?${params}`)
  if (!res.ok) throw new Error(`Orbital service returned ${res.status}`)
  return res.json()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  const { message } = req.body as { message: string }
  const systemPrompt = buildSystemPrompt()

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    // First call: non-streaming — detects whether Claude wants to call tools
    const response1 = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: [{ role: 'user', content: message }],
    })

    let pendingHighlight: HighlightInput | null = null

    if (response1.stop_reason === 'tool_use') {
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: message },
        { role: 'assistant', content: response1.content },
      ]

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response1.content) {
        if (block.type !== 'tool_use') continue

        if (block.name === 'predict_iss_passes') {
          const result = await callOrbitalService(block.input as PassesInput)
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

      messages.push({ role: 'user', content: toolResults })

      // Stream the final answer
      const stream2 = client.messages.stream({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
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
