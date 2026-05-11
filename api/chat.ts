import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL = 'claude-sonnet-4-6'

function buildSystemPrompt(): string {
  return `You are Aussie Sky's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics. \
When asked about ISS passes, sightings, or visibility from any location, call predict_iss_passes. \
Format pass times in the user's likely local timezone (Melbourne queries → AEST/AEDT). \
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
        description:
          'Observer latitude in decimal degrees. South is negative. Melbourne is -37.8136.',
      },
      longitude: {
        type: 'number',
        description:
          'Observer longitude in decimal degrees. West is negative. Melbourne is 144.9631.',
      },
      hours_ahead: {
        type: 'number',
        description:
          'Hours ahead to search for passes. Default 24. Use 48 for "this week" or multi-day queries.',
      },
    },
    required: ['latitude', 'longitude'],
  },
}

interface ToolInput {
  latitude: number
  longitude: number
  hours_ahead?: number
}

async function callOrbitalService(input: ToolInput): Promise<unknown> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    hours_ahead: String(input.hours_ahead ?? 24),
  })
  const res = await fetch(`${ORBITAL_SERVICE_URL}/predict-passes?${params}`)
  if (!res.ok) throw new Error(`Orbital service returned ${res.status}`)
  return res.json()
}

type CachedTextBlock = Anthropic.TextBlockParam & { cache_control: { type: 'ephemeral' } }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { message } = (await req.json()) as { message: string }
  const systemPrompt = buildSystemPrompt()
  const systemContent: CachedTextBlock[] = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ]

  const response1 = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemContent as Anthropic.TextBlockParam[],
    tools: [PREDICT_PASSES_TOOL],
    messages: [{ role: 'user', content: message }],
  })

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      try {
        if (response1.stop_reason === 'tool_use') {
          const toolBlock = response1.content.find(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )
          if (!toolBlock) {
            controller.enqueue(enc.encode('Error: expected tool use block not found'))
            return
          }

          const toolResult = await callOrbitalService(toolBlock.input as ToolInput)

          const messages: Anthropic.MessageParam[] = [
            { role: 'user', content: message },
            { role: 'assistant', content: response1.content },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify(toolResult),
                },
              ],
            },
          ]

          const stream2 = client.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            system: systemContent as Anthropic.TextBlockParam[],
            tools: [PREDICT_PASSES_TOOL],
            messages,
          })

          for await (const event of stream2) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(enc.encode(event.delta.text))
            }
          }
        } else {
          const textBlock = response1.content.find(
            (b): b is Anthropic.TextBlock => b.type === 'text',
          )
          if (textBlock) {
            controller.enqueue(enc.encode(textBlock.text))
          } else {
            controller.enqueue(enc.encode(`Error: no text in response (stop_reason: ${response1.stop_reason})`))
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        controller.enqueue(enc.encode(`Error: ${msg}`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
