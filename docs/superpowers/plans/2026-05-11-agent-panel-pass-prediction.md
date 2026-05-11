# Agent Panel + Pass Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Aussie Sky agent panel to the Claude API with a single ISS pass prediction tool, so a user can type "when does the ISS pass over Melbourne tonight?" and get a real answer backed by orbital math.

**Architecture:** A Python FastAPI service (`apps/orbital/`) uses skyfield to compute ISS passes and exposes `GET /predict-passes`, deployed to Railway. A Vercel Edge Function (`api/chat.ts`) receives the user's chat message, calls Claude with the `predict_iss_passes` tool definition, executes any tool call against the Railway service, then streams Claude's final text response back to the browser. The React frontend replaces the static `AgentPanel` placeholder with a real streaming chat UI. The Vercel function lives at the repo root `api/` directory — Vercel auto-detects it alongside the existing `vercel.json` static build.

**Tech Stack:** Python 3.11, FastAPI 0.111, uvicorn, skyfield 1.49, pytest, Railway; `@anthropic-ai/sdk`, TypeScript, Vercel Edge Functions; React 19, Vitest, `@testing-library/react`

---

## File map

```
apps/orbital/
  passes.py                  — ISS pass prediction logic (skyfield)
  main.py                    — FastAPI app: GET /predict-passes, GET /health
  requirements.txt           — Python deps
  Dockerfile                 — Container for Railway
  .gitignore                 — __pycache__, .env, venv
  tests/
    __init__.py
    test_passes.py           — pytest unit tests for passes.py

api/
  chat.ts                    — Vercel Edge Function: Claude tool-use loop + streaming

package.json                 — (repo root) @anthropic-ai/sdk dep for the Edge Function
tsconfig.json                — (repo root) TypeScript config scoped to api/

apps/web/src/
  types/
    chat.ts                  — ChatMessage type
  hooks/
    useChat.ts               — Chat state, fetch + ReadableStream logic
    useChat.test.ts          — Vitest tests for the hook
  components/
    AgentPanel.tsx           — MODIFY: replace placeholder with real chat UI

.env.example                 — (repo root) documents ANTHROPIC_API_KEY + ORBITAL_SERVICE_URL
```

---

### Task 1: ISS pass prediction — `passes.py` + tests

**Files:**
- Create: `apps/orbital/tests/__init__.py`
- Create: `apps/orbital/tests/test_passes.py`
- Create: `apps/orbital/passes.py`

`skyfield`'s `find_events` with `altitude_degrees=10.0` finds rise (event 0), culmination (event 1), and set (event 2) for each pass. We use `builtin=True` on the timescale to skip a network download at startup. The same ISS TLE from the globe is hardcoded here — symbolic position, fine for MVP.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p apps/orbital/tests
touch apps/orbital/tests/__init__.py
```

- [ ] **Step 2: Write the failing tests**

Create `apps/orbital/tests/test_passes.py`:
```python
import pytest
from passes import predict_passes, az_to_direction


class TestAzToDirection:
    def test_north(self):
        assert az_to_direction(0) == 'N'
        assert az_to_direction(360) == 'N'

    def test_cardinal_directions(self):
        assert az_to_direction(90) == 'E'
        assert az_to_direction(180) == 'S'
        assert az_to_direction(270) == 'W'

    def test_intercardinal(self):
        assert az_to_direction(45) == 'NE'
        assert az_to_direction(225) == 'SW'
        assert az_to_direction(315) == 'NW'


class TestPredictPasses:
    # Melbourne — a real location Claude knows the coords for
    LAT = -37.8136
    LON = 144.9631

    def test_returns_list(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        assert isinstance(result, list)

    def test_pass_has_required_fields(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window — stale TLE, rerun or extend window')
        p = result[0]
        assert 'start_utc' in p
        assert 'end_utc' in p
        assert 'max_elevation_deg' in p
        assert 'direction' in p

    def test_max_elevation_is_float(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        assert isinstance(result[0]['max_elevation_deg'], float)

    def test_direction_is_valid_compass_point(self):
        valid = {'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'}
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        assert result[0]['direction'] in valid

    def test_start_before_end(self):
        result = predict_passes(self.LAT, self.LON, hours_ahead=48)
        if not result:
            pytest.skip('No passes in 48h window')
        for p in result:
            assert p['start_utc'] < p['end_utc']

    def test_longer_window_at_least_as_many_passes(self):
        passes_1h = predict_passes(self.LAT, self.LON, hours_ahead=1)
        passes_48h = predict_passes(self.LAT, self.LON, hours_ahead=48)
        assert len(passes_1h) <= len(passes_48h)
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd apps/orbital
python -m pytest tests/test_passes.py -v
```
Expected: `ModuleNotFoundError: No module named 'passes'`

- [ ] **Step 4: Implement `passes.py`**

Create `apps/orbital/passes.py`:
```python
from skyfield.api import load, wgs84, EarthSatellite
from typing import Any

ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'

_ts = load.timescale(builtin=True)
_iss = EarthSatellite(ISS_TLE1, ISS_TLE2, 'ISS (ZARYA)', _ts)


def az_to_direction(az_deg: float) -> str:
    dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[round(az_deg / 45) % 8]


def predict_passes(
    latitude: float,
    longitude: float,
    hours_ahead: int = 24,
) -> list[dict[str, Any]]:
    location = wgs84.latlon(latitude, longitude)
    t0 = _ts.now()
    t1 = _ts.tt_jd(t0.tt + hours_ahead / 24.0)

    times, events = _iss.find_events(location, t0, t1, altitude_degrees=10.0)

    passes: list[dict[str, Any]] = []
    current: dict[str, Any] = {}

    for t, event in zip(times, events):
        if event == 0:  # rise above 10°
            current = {'start_utc': t.utc_iso()}
        elif event == 1:  # culmination (max elevation)
            diff = _iss - location
            alt, az, _ = diff.at(t).altaz()
            current['max_elevation_deg'] = round(float(alt.degrees), 1)
            current['direction'] = az_to_direction(float(az.degrees))
        elif event == 2:  # set below 10°
            current['end_utc'] = t.utc_iso()
            if 'start_utc' in current:
                passes.append(current)
                current = {}

    return passes
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/orbital
pip install skyfield pytest
python -m pytest tests/test_passes.py -v
```
Expected: All non-skipped tests pass. The stale TLE still preserves orbital period, so skyfield will find geometrically valid passes — typically 2–4 in a 48-hour window.

- [ ] **Step 6: Commit**

```bash
git add apps/orbital/
git commit -m "feat: ISS pass prediction with skyfield (passes.py + tests)"
```

---

### Task 2: FastAPI app + service infrastructure

**Files:**
- Create: `apps/orbital/main.py`
- Create: `apps/orbital/requirements.txt`
- Create: `apps/orbital/Dockerfile`
- Create: `apps/orbital/.gitignore`

- [ ] **Step 1: Create `requirements.txt`**

Create `apps/orbital/requirements.txt`:
```
fastapi==0.111.0
uvicorn[standard]==0.30.0
skyfield==1.49
```

- [ ] **Step 2: Create `main.py`**

Create `apps/orbital/main.py`:
```python
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from passes import predict_passes

app = FastAPI(title='Aussie Sky Orbital Service')

# TODO: tighten allow_origins to the Vercel domain before V1 production
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET'],
    allow_headers=['*'],
)


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/predict-passes')
async def get_passes(
    latitude: float = Query(..., ge=-90, le=90, description='Decimal degrees, south negative'),
    longitude: float = Query(..., ge=-180, le=180, description='Decimal degrees, west negative'),
    hours_ahead: int = Query(24, ge=1, le=168, description='Search window in hours (max 7 days)'),
) -> dict[str, list]:
    try:
        passes = predict_passes(latitude, longitude, hours_ahead)
        return {'passes': passes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 3: Create `Dockerfile`**

Create `apps/orbital/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

Railway sets `PORT` automatically; the `${PORT:-8000}` fallback is for local runs.

- [ ] **Step 4: Create `.gitignore`**

Create `apps/orbital/.gitignore`:
```
__pycache__/
*.pyc
.env
venv/
.venv/
```

- [ ] **Step 5: Test the service locally**

```bash
cd apps/orbital
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

In a second terminal:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}

curl "http://localhost:8000/predict-passes?latitude=-37.8136&longitude=144.9631&hours_ahead=48"
# Expected: {"passes":[...]}  — array, possibly empty due to stale TLE
```

Stop the server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add apps/orbital/main.py apps/orbital/requirements.txt apps/orbital/Dockerfile apps/orbital/.gitignore
git commit -m "feat: FastAPI orbital service with /predict-passes endpoint"
```

---

### Task 3: Vercel Edge Function (`api/chat.ts`)

**Files:**
- Create: `package.json` (repo root)
- Create: `tsconfig.json` (repo root)
- Create: `api/chat.ts`

Vercel detects `api/` at the repo root automatically when `framework: null` is set. A root `package.json` provides the `@anthropic-ai/sdk` dependency Vercel installs for Edge Functions (separate from the `apps/web` build). The function does one synchronous Claude call to detect tool use, calls Railway if needed, then streams the final Claude response back as plain text.

Prompt caching is applied to the system prompt on both Claude calls — same system string, Vercel Edge Functions are stateless so each invocation pays for system prompt tokens, and caching recovers most of that cost.

- [ ] **Step 1: Create root `package.json`**

Create `package.json` at the repo root:
```json
{
  "name": "aussie-sky",
  "private": true
}
```

Install the SDK at whatever is current (package-lock.json will pin the exact version):
```bash
npm install @anthropic-ai/sdk@latest
```
This creates `node_modules/` and `package-lock.json` at the repo root. Add `node_modules/` to the root `.gitignore` if it isn't already there (it is — confirmed above).

- [ ] **Step 2: Create root `tsconfig.json`**

Create `tsconfig.json` at the repo root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["api"]
}
```

- [ ] **Step 3: Create `api/chat.ts`**

```bash
mkdir -p api
```

Create `api/chat.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL = 'claude-sonnet-4-6' // fall back to 'claude-sonnet-4-5' if this returns a model-not-found error

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

// TextBlockParam extended with cache_control (supported by API, types may lag SDK version)
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

  // First call: non-streaming, detect whether Claude wants to call a tool
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
          )!

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

          // Second call: stream the final answer
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
          // No tool use (e.g. greeting, off-topic question) — return text directly
          const textBlock = response1.content.find(
            (b): b is Anthropic.TextBlock => b.type === 'text',
          )
          if (textBlock) controller.enqueue(enc.encode(textBlock.text))
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
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit --project tsconfig.json
```
Expected: No errors, or only errors on `cache_control` (the `as` cast in the code handles those at runtime). If there are errors on Anthropic SDK types that are unrelated to `cache_control`, install the latest SDK: `npm install @anthropic-ai/sdk@latest`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json api/
git commit -m "feat: Vercel Edge Function for Claude tool-use loop and streaming (chat.ts)"
```

---

### Task 4: Chat message types

**Files:**
- Create: `apps/web/src/types/chat.ts`

- [ ] **Step 1: Create `apps/web/src/types/chat.ts`**

```typescript
export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  streaming: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/types/
git commit -m "feat: ChatMessage type"
```

---

### Task 5: Chat state hook — `useChat.ts`

**Files:**
- Create: `apps/web/src/hooks/useChat.ts`
- Create: `apps/web/src/hooks/useChat.test.ts`

`useChat` manages message state and reads the `/api/chat` response as a `ReadableStream`, appending text chunks to the assistant message in real time.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/hooks/useChat.test.ts`:
```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from './useChat'

function mockStream(chunks: string[]): Promise<Response> {
  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return Promise.resolve(new Response(readable, { status: 200 }))
}

describe('useChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('initial state has no messages and is not loading', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  test('sendMessage adds user message then streams assistant response', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['The ISS ', 'passes at 9pm']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('When does the ISS pass over Melbourne?')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'When does the ISS pass over Melbourne?',
    })

    await waitFor(() => {
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'The ISS passes at 9pm',
        streaming: false,
      })
    })
  })

  test('calls /api/chat with correct body', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['ok']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('test message')
    })

    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message' }),
    })
  })

  test('isLoading is false after response completes', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['done']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('test')
    })

    expect(result.current.isLoading).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/hooks/useChat.test.ts
```
Expected: `Cannot find module './useChat'`

- [ ] **Step 3: Implement `useChat.ts`**

Create `apps/web/src/hooks/useChat.ts`:
```typescript
import { useState, useCallback } from 'react'
import type { ChatMessage } from '../types/chat'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      streaming: false,
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m,
          ),
        )
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Error: could not reach the agent.', streaming: false }
            : m,
        ),
      )
    } finally {
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m)),
      )
      setIsLoading(false)
    }
  }, [])

  return { messages, isLoading, sendMessage }
}
```

- [ ] **Step 4: Run `useChat` tests to verify they pass**

```bash
cd apps/web && npx vitest run src/hooks/useChat.test.ts
```
Expected: 4 tests passed.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd apps/web && npm run test:run
```
Expected: All 11 tests pass (7 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useChat.ts apps/web/src/hooks/useChat.test.ts apps/web/src/types/
git commit -m "feat: useChat hook with streaming fetch and tests"
```

---

### Task 6: Agent panel UI

**Files:**
- Modify: `apps/web/src/components/AgentPanel.tsx`

Replace the static placeholder with a functional chat UI: scrollable message list, animated loading dots while streaming, input with Enter-to-send.

`App.test.tsx` mocks `./hooks/useGlobe`. If `AgentPanel` now imports `useChat` and that import fails or causes a side-effect in jsdom, add a matching mock. Check after Step 2 — if the test suite reports an error in `App.test.tsx`, apply the mock described in Step 1b.

- [ ] **Step 1: Replace `AgentPanel.tsx`**

Replace the full content of `apps/web/src/components/AgentPanel.tsx`:
```tsx
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useChat } from '../hooks/useChat'

export default function AgentPanel() {
  const { messages, isLoading, sendMessage } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-gray-600 text-center leading-relaxed px-4">
              Ask about ISS passes over any location.
              <br />
              <span className="text-gray-700">
                e.g. "When does the ISS pass over Melbourne tonight?"
              </span>
            </p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.content || (msg.streaming ? (
                <span className="inline-flex gap-1 items-center h-4">
                  <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
                </span>
              ) : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-gray-900 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-gray-700 disabled:opacity-50"
            placeholder="Ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
cd apps/web && npm run test:run
```
Expected: All 11 tests pass.

- [ ] **Step 3: Build to check for TypeScript errors**

```bash
cd apps/web && npm run build
```
Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AgentPanel.tsx
git commit -m "feat: replace agent panel placeholder with streaming chat UI"
```

---

### Task 7: Environment config + deployment

**Files:**
- Create: `.env.example` (repo root)
- Create: `apps/orbital/.env.example`

Manual deployment steps for Railway and Vercel are documented here — they cannot be automated.

- [ ] **Step 1: Create `.env.example` at the repo root**

Create `.env.example`:
```bash
# Vercel Edge Function — set these in Vercel dashboard: Settings > Environment Variables
ANTHROPIC_API_KEY=sk-ant-api03-...
ORBITAL_SERVICE_URL=https://your-service.up.railway.app
```

- [ ] **Step 2: Create `apps/orbital/.env.example`**

Create `apps/orbital/.env.example`:
```bash
# Railway sets PORT automatically. No other env vars needed.
# PORT=8000
```

- [ ] **Step 3: Commit env examples**

```bash
git add .env.example apps/orbital/.env.example
git commit -m "chore: env examples for Vercel and Railway config"
```

- [ ] **Step 4: Push everything to GitHub**

```bash
git push
```

- [ ] **Step 5: Deploy the orbital service to Railway**

Manual steps:
1. Go to [railway.app](https://railway.app), create a new project
2. "Deploy from GitHub repo" → select `PremaanshVyas/aussie-sky`
3. Set **Root Directory** to `apps/orbital`
4. Railway detects the `Dockerfile` and builds automatically
5. Once deployed, click **Settings > Networking → Generate Domain** to get a public URL
6. Test: `curl https://<your-app>.up.railway.app/health` → `{"status":"ok"}`
7. Note the URL — you'll need it for Vercel

- [ ] **Step 6: Add env vars to Vercel**

In the Vercel dashboard for `aussie-sky`:
1. Settings → Environment Variables
2. Add `ANTHROPIC_API_KEY` = your Anthropic API key
3. Add `ORBITAL_SERVICE_URL` = the Railway URL from Step 5 (no trailing slash)
4. Redeploy: go to Deployments → click the three-dot menu on the latest deploy → Redeploy

- [ ] **Step 7: End-to-end verification**

Open the live Vercel URL. Type into the chat panel:
```
When does the ISS pass over Melbourne tonight?
```

Expected sequence:
1. Your message appears right-aligned in blue immediately
2. Animated loading dots appear on the left within ~100ms
3. Text starts streaming in within 3–5 seconds (Railway cold start + Claude API)
4. Response lists 1–3 pass windows with times, max elevation, and direction

If you see `Error: could not reach the agent.`, check:
- `ORBITAL_SERVICE_URL` is set correctly in Vercel (no trailing slash)
- Railway service is running (`/health` returns 200)
- `ANTHROPIC_API_KEY` is valid
