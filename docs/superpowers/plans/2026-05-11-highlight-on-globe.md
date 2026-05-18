# highlight_on_globe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `highlight_on_globe` tool — when the user asks about a specific satellite, the agent returns prose AND emits a `__HIGHLIGHT__` directive that makes the Three.js globe fly to that satellite and pulse-animate it.

**Architecture:** The backend adds a second Claude tool (`highlight_on_globe`) that acts as a frontend-control signal — no external service is called, just an `ok` acknowledgement. After streaming the text response, `api/chat.ts` appends `\n__HIGHLIGHT__:{"norad_id":"...","satellite_name":"..."}\n`. `useChat` parses and strips that line from the displayed text, setting a `highlight` state that flows down from `App` → `GlobeView` → `useGlobe` → `Globe.highlightSatellite()`. The globe animates a smooth camera fly-to and a 3× pulse on the halo mesh.

**Tech Stack:** TypeScript, React 19, Three.js, Vitest, @testing-library/react, @anthropic-ai/sdk, @vercel/node

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/types/chat.ts` | Add `HighlightDirective` type |
| `api/chat.ts` | Add `highlight_on_globe` tool; extend tool-use loop to handle both tools; emit `__HIGHLIGHT__` directive at end |
| `apps/web/src/hooks/useChat.ts` | Parse `__HIGHLIGHT__:` from stream; strip from displayed text; expose `highlight` state |
| `apps/web/src/hooks/useChat.test.ts` | Tests for highlight parsing and state |
| `apps/web/src/globe/SatelliteMesh.ts` | Add `getCurrentPosition()` method and `startPulse()` with halo animation |
| `apps/web/src/globe/Globe.ts` | Add `highlightSatellite(noradId: string)` — fly-to animation + calls `iss.startPulse()` |
| `apps/web/src/hooks/useGlobe.ts` | Accept `highlight: HighlightDirective \| null`; call `globe.highlightSatellite()` on change |
| `apps/web/src/hooks/useGlobe.test.ts` | New: verify `highlightSatellite` is called when highlight prop changes |
| `apps/web/src/components/GlobeView.tsx` | Accept and pass `highlight` prop to `useGlobe` |
| `apps/web/src/components/AgentPanel.tsx` | Accept `messages`, `isLoading`, `sendMessage` as props (lift `useChat` to App) |
| `apps/web/src/App.tsx` | Call `useChat` here; pass `highlight` to `GlobeView`; pass chat state to `AgentPanel` |
| `apps/web/src/App.test.tsx` | Update mocks for new `useChat` return shape and new `AgentPanel` props shape |

---

## Task 1: Add `HighlightDirective` type

**Files:**
- Modify: `apps/web/src/types/chat.ts`

- [ ] **Step 1: Add the type**

Replace the contents of `apps/web/src/types/chat.ts` with:

```typescript
export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  streaming: boolean
}

export interface HighlightDirective {
  norad_id: string
  satellite_name: string
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/types/chat.ts
git commit -m "feat: add HighlightDirective type"
```

---

## Task 2: Extend `api/chat.ts` — add `highlight_on_globe` tool

**Files:**
- Modify: `api/chat.ts`

The current handler runs one non-streaming detection call, then one streaming final call. We extend it to:
1. Process BOTH tools in the first response (iterate `response1.content` for all `tool_use` blocks)
2. Record any `highlight_on_globe` call as `pendingHighlight`
3. After streaming, append `\n__HIGHLIGHT__:...\n`

- [ ] **Step 1: Write the updated `api/chat.ts`**

Replace the full file with:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const ORBITAL_SERVICE_URL = process.env.ORBITAL_SERVICE_URL!
const MODEL = 'claude-sonnet-4-5'

function buildSystemPrompt(): string {
  return `You are Satlas's AI assistant specialising in space situational awareness. \
Help users track satellites and understand orbital mechanics. \
When asked about ISS passes, sightings, or visibility from any location, call predict_iss_passes. \
Whenever your response is about a specific satellite (e.g. the ISS), also call highlight_on_globe — \
this signals the 3D globe to focus on and animate that satellite. Do not mention the highlight in your text. \
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
```

- [ ] **Step 2: Commit**

```bash
git add api/chat.ts
git commit -m "feat: add highlight_on_globe tool to chat handler"
```

---

## Task 3: Update `useChat.ts` — parse `__HIGHLIGHT__:` from stream

**Files:**
- Modify: `apps/web/src/hooks/useChat.ts`
- Modify: `apps/web/src/hooks/useChat.test.ts`

The hook currently appends every chunk directly to `content`. We need to detect the `__HIGHLIGHT__:` line, strip it from `content`, and set `highlight` state.

**Parsing rule:** the directive always arrives as a single chunk containing `\n__HIGHLIGHT__:{"norad_id":...}\n`. Split on `\n__HIGHLIGHT__:`, take text before, parse JSON after.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/hooks/useChat.test.ts` (after the existing `describe` block closes):

```typescript
describe('useChat highlight parsing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('strips __HIGHLIGHT__ directive and sets highlight state', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream([
        'The ISS is currently over the Pacific Ocean.',
        '\n__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS"}\n',
      ])
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Where is the ISS?')
    })

    await waitFor(() => {
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'The ISS is currently over the Pacific Ocean.',
        streaming: false,
      })
      expect(result.current.highlight).toEqual({
        norad_id: '25544',
        satellite_name: 'ISS',
      })
    })
  })

  test('does not set highlight when no directive in stream', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['Just a normal text response.']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    await waitFor(() => {
      expect(result.current.highlight).toBeNull()
    })
  })

  test('handles directive split across chunks', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream([
        'Some text.',
        '\n__HIGHLIGHT__:{"norad_id":"25544",',
        '"satellite_name":"ISS"}\n',
      ])
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Show me the ISS')
    })

    await waitFor(() => {
      expect(result.current.messages[1].content).toBe('Some text.')
      expect(result.current.highlight).toEqual({
        norad_id: '25544',
        satellite_name: 'ISS',
      })
    })
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
cd apps/web && npx vitest run src/hooks/useChat.test.ts
```

Expected: FAIL — `result.current.highlight` is undefined (property doesn't exist yet)

- [ ] **Step 3: Implement the updated `useChat.ts`**

Replace `apps/web/src/hooks/useChat.ts` with:

```typescript
import { useState, useCallback } from 'react'
import type { ChatMessage, HighlightDirective } from '../types/chat'

const HIGHLIGHT_MARKER = '\n__HIGHLIGHT__:'

function parseChunkForHighlight(
  accumulated: string,
): { text: string; highlight: HighlightDirective | null } {
  const idx = accumulated.indexOf(HIGHLIGHT_MARKER)
  if (idx === -1) return { text: accumulated, highlight: null }

  const text = accumulated.slice(0, idx)
  const jsonStr = accumulated.slice(idx + HIGHLIGHT_MARKER.length).replace(/\n$/, '')
  try {
    const highlight = JSON.parse(jsonStr) as HighlightDirective
    return { text, highlight }
  } catch {
    return { text: accumulated, highlight: null }
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlight, setHighlight] = useState<HighlightDirective | null>(null)

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
      let rawAccumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        rawAccumulated += chunk

        // Strip any directive from displayed content in real time
        const { text } = parseChunkForHighlight(rawAccumulated)
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: text } : m)),
        )
      }

      // Final parse: extract highlight if present
      const { text, highlight: newHighlight } = parseChunkForHighlight(rawAccumulated)
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: text } : m)),
      )
      if (newHighlight) setHighlight(newHighlight)
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

  return { messages, isLoading, sendMessage, highlight }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/web && npx vitest run src/hooks/useChat.test.ts
```

Expected: All tests PASS (including the 4 existing + 3 new = 7 total)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useChat.ts apps/web/src/hooks/useChat.test.ts
git commit -m "feat: parse __HIGHLIGHT__ directive in useChat stream"
```

---

## Task 4: Update `SatelliteMesh.ts` — add `getCurrentPosition()` and `startPulse()`

**Files:**
- Modify: `apps/web/src/globe/SatelliteMesh.ts`

`Globe` will need the ISS's current 3D position to aim the camera fly-to. `startPulse()` drives the halo scale animation for 3 cycles.

- [ ] **Step 1: Write the updated `SatelliteMesh.ts`**

Replace `apps/web/src/globe/SatelliteMesh.ts` with:

```typescript
import * as THREE from 'three'
import * as satellite from 'satellite.js'

const PULSE_DURATION_MS = 1000
const PULSE_SCALE = 1.6
const PULSE_REPEATS = 3

export class SatelliteMesh {
  readonly group: THREE.Group
  private dot: THREE.Mesh
  private halo: THREE.Mesh
  private arc: THREE.LineLoop
  private satrec: satellite.SatRec
  private lastArcDate: Date
  private pulseStartTime: number | null = null

  constructor(tle1: string, tle2: string) {
    this.satrec = satellite.twoline2satrec(tle1, tle2)
    this.lastArcDate = new Date()
    this.group = new THREE.Group()

    this.dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    )

    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.2 }),
    )

    this.arc = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.computeArcPoints(new Date())),
      new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.5 }),
    )

    this.group.add(this.dot, this.halo, this.arc)
  }

  private toThreePosition(date: Date): THREE.Vector3 | null {
    const posVel = satellite.propagate(this.satrec, date)
    if (typeof posVel.position === 'boolean') return null

    const gmst = satellite.gstime(date)
    const geo = satellite.eciToGeodetic(
      posVel.position as satellite.EciVec3<number>,
      gmst,
    )

    const lat = geo.latitude  // radians
    const lon = geo.longitude // radians
    const r = 1.06            // slightly above unit sphere surface

    return new THREE.Vector3(
      -r * Math.cos(lat) * Math.sin(lon),
       r * Math.sin(lat),
       r * Math.cos(lat) * Math.cos(lon),
    )
  }

  private computeArcPoints(date: Date): THREE.Vector3[] {
    const periodMs = (2 * Math.PI / this.satrec.no) * 60 * 1000
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 90; i++) {
      const t = new Date(date.getTime() + (i / 90) * periodMs)
      const pos = this.toThreePosition(t)
      if (pos) points.push(pos)
    }
    return points
  }

  getCurrentPosition(): THREE.Vector3 | null {
    return this.toThreePosition(new Date())
  }

  startPulse(): void {
    this.pulseStartTime = performance.now()
  }

  update(date: Date): void {
    const pos = this.toThreePosition(date)
    if (pos) {
      this.dot.position.copy(pos)
      this.halo.position.copy(pos)
    }

    const shouldRecompute = date.getTime() - this.lastArcDate.getTime() > 60_000
    if (shouldRecompute) {
      this.lastArcDate = date
      this.arc.geometry.setFromPoints(this.computeArcPoints(date))
    }

    // Pulse animation: scale halo 1.0 → PULSE_SCALE → 1.0 for PULSE_REPEATS cycles
    if (this.pulseStartTime !== null) {
      const elapsed = performance.now() - this.pulseStartTime
      const cycleIndex = Math.floor(elapsed / PULSE_DURATION_MS)

      if (cycleIndex >= PULSE_REPEATS) {
        this.pulseStartTime = null
        this.halo.scale.setScalar(1)
      } else {
        const t = (elapsed % PULSE_DURATION_MS) / PULSE_DURATION_MS
        const scale = 1 + (PULSE_SCALE - 1) * Math.sin(t * Math.PI)
        this.halo.scale.setScalar(scale)
      }
    }
  }

  dispose(): void {
    this.dot.geometry.dispose()
    this.halo.geometry.dispose()
    this.arc.geometry.dispose()
    ;(this.dot.material as THREE.Material).dispose()
    ;(this.halo.material as THREE.Material).dispose()
    ;(this.arc.material as THREE.Material).dispose()
  }
}
```

- [ ] **Step 2: Verify existing satellite tests still pass**

```bash
cd apps/web && npx vitest run src/globe/satellite.test.ts
```

Expected: PASS (unchanged test, no Three.js instantiation)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/globe/SatelliteMesh.ts
git commit -m "feat: add getCurrentPosition and startPulse to SatelliteMesh"
```

---

## Task 5: Update `Globe.ts` — add `highlightSatellite()` with fly-to animation

**Files:**
- Modify: `apps/web/src/globe/Globe.ts`

Camera fly-to: interpolate `camera.position` from current to a point 2.5 units in the direction of the ISS, over 1500 ms with cubic ease-in-out. `controls.target` stays at the origin (Earth center) throughout.

- [ ] **Step 1: Write the updated `Globe.ts`**

Replace `apps/web/src/globe/Globe.ts` with:

```typescript
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EarthMesh } from './EarthMesh'
import { SatelliteMesh } from './SatelliteMesh'
import { getSunDirection } from '../lib/solar'

const ISS_TLE1 = '1 25544U 98067A   24087.54791667  .00016717  00000-0  10270-3 0  9993'
const ISS_TLE2 = '2 25544  51.6412 195.4700 0001944  67.8403 292.2940 15.50034440443522'
const ISS_NORAD = '25544'
const FLY_DURATION_MS = 1500
const CAMERA_DISTANCE = 2.5

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class Globe {
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private scene!: THREE.Scene
  private controls!: OrbitControls
  private earth!: EarthMesh
  private iss!: SatelliteMesh
  private rafId: number | null = null

  private flyFromPos: THREE.Vector3 | null = null
  private flyToPos: THREE.Vector3 | null = null
  private flyStartTime: number | null = null

  mount(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth || canvas.width || 800
    const h = canvas.clientHeight || canvas.height || 600

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setSize(w, h, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 0, CAMERA_DISTANCE)

    this.scene = new THREE.Scene()

    this.earth = new EarthMesh()
    this.scene.add(this.earth.mesh)

    this.iss = new SatelliteMesh(ISS_TLE1, ISS_TLE2)
    this.scene.add(this.iss.group)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1.3
    this.controls.maxDistance = 8
    this.controls.autoRotate = false

    this.tick()
  }

  highlightSatellite(noradId: string): void {
    if (noradId !== ISS_NORAD) return

    const issPos = this.iss.getCurrentPosition()
    if (!issPos) return

    // Position the camera 2.5 units away in the direction of the ISS from Earth center
    const dir = issPos.clone().normalize()
    this.flyFromPos = this.camera.position.clone()
    this.flyToPos = dir.multiplyScalar(CAMERA_DISTANCE)
    this.flyStartTime = performance.now()

    this.iss.startPulse()
  }

  private tick(): void {
    this.rafId = requestAnimationFrame(() => this.tick())
    const now = new Date()
    this.earth.update(getSunDirection(now))
    this.iss.update(now)

    // Camera fly-to animation
    if (this.flyFromPos && this.flyToPos && this.flyStartTime !== null) {
      const elapsed = performance.now() - this.flyStartTime
      const t = Math.min(elapsed / FLY_DURATION_MS, 1)
      const eased = easeInOutCubic(t)

      this.camera.position.lerpVectors(this.flyFromPos, this.flyToPos, eased)

      if (t >= 1) {
        this.flyFromPos = null
        this.flyToPos = null
        this.flyStartTime = null
      }
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.controls.dispose()
    this.earth.dispose()
    this.iss.dispose()
    this.renderer.dispose()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/globe/Globe.ts
git commit -m "feat: add highlightSatellite fly-to animation to Globe"
```

---

## Task 6: Update `useGlobe.ts` — accept `highlight`, call `highlightSatellite`

**Files:**
- Modify: `apps/web/src/hooks/useGlobe.ts`
- Create: `apps/web/src/hooks/useGlobe.test.ts`

`useGlobe` needs to hold a ref to the `Globe` instance so it can call `highlightSatellite()` when `highlight` changes. The second `useEffect` runs whenever `highlight` prop changes.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useGlobe.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useGlobe } from './useGlobe'
import type { HighlightDirective } from '../types/chat'

// Mock the Globe class entirely — Three.js requires WebGL which jsdom doesn't provide
vi.mock('../globe/Globe', () => ({
  Globe: vi.fn().mockImplementation(() => ({
    mount: vi.fn(),
    resize: vi.fn(),
    unmount: vi.fn(),
    highlightSatellite: vi.fn(),
  })),
}))

// Mock ResizeObserver (not available in jsdom)
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()
vi.stubGlobal('ResizeObserver', vi.fn(() => ({ observe: mockObserve, disconnect: mockDisconnect })))

import { Globe } from '../globe/Globe'

describe('useGlobe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeContainerRef() {
    const div = document.createElement('div')
    return { current: div }
  }

  test('calls highlightSatellite when highlight prop changes', () => {
    const containerRef = makeContainerRef()
    const { rerender } = renderHook(
      ({ highlight }: { highlight: HighlightDirective | null }) =>
        useGlobe(containerRef as React.RefObject<HTMLDivElement>, highlight),
      { initialProps: { highlight: null } },
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    expect(globeInstance).toBeDefined()

    act(() => {
      rerender({ highlight: { norad_id: '25544', satellite_name: 'ISS' } })
    })

    expect(globeInstance.highlightSatellite).toHaveBeenCalledWith('25544')
  })

  test('does not call highlightSatellite when highlight is null', () => {
    const containerRef = makeContainerRef()
    renderHook(
      ({ highlight }: { highlight: HighlightDirective | null }) =>
        useGlobe(containerRef as React.RefObject<HTMLDivElement>, highlight),
      { initialProps: { highlight: null } },
    )

    const globeInstance = vi.mocked(Globe).mock.results[0]?.value
    expect(globeInstance?.highlightSatellite).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the failing test**

```bash
cd apps/web && npx vitest run src/hooks/useGlobe.test.ts
```

Expected: FAIL — `useGlobe` doesn't accept a `highlight` param yet

- [ ] **Step 3: Implement the updated `useGlobe.ts`**

Replace `apps/web/src/hooks/useGlobe.ts` with:

```typescript
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { Globe } from '../globe/Globe'
import type { HighlightDirective } from '../types/chat'

export function useGlobe(
  containerRef: RefObject<HTMLDivElement | null>,
  highlight: HighlightDirective | null,
): void {
  const globeRef = useRef<Globe | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    const globe = new Globe()
    globe.mount(canvas)
    globeRef.current = globe

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      globe.resize(width, height)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      globe.unmount()
      globeRef.current = null
      canvas.remove()
    }
  }, [])

  useEffect(() => {
    if (highlight && globeRef.current) {
      globeRef.current.highlightSatellite(highlight.norad_id)
    }
  }, [highlight])
}
```

- [ ] **Step 4: Run the test**

```bash
cd apps/web && npx vitest run src/hooks/useGlobe.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useGlobe.ts apps/web/src/hooks/useGlobe.test.ts
git commit -m "feat: useGlobe accepts highlight prop and calls highlightSatellite"
```

---

## Task 7: Update `GlobeView.tsx` — accept `highlight` prop

**Files:**
- Modify: `apps/web/src/components/GlobeView.tsx`

Small change — add the prop and thread it to `useGlobe`.

- [ ] **Step 1: Write the updated `GlobeView.tsx`**

Replace `apps/web/src/components/GlobeView.tsx` with:

```typescript
import { useRef } from 'react'
import { useGlobe } from '../hooks/useGlobe'
import type { HighlightDirective } from '../types/chat'

interface GlobeViewProps {
  highlight: HighlightDirective | null
}

export default function GlobeView({ highlight }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useGlobe(containerRef, highlight)
  return <div ref={containerRef} className="w-full h-full" />
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/GlobeView.tsx
git commit -m "feat: GlobeView accepts highlight prop"
```

---

## Task 8: Update `AgentPanel.tsx` — accept props (lift `useChat` to `App`)

**Files:**
- Modify: `apps/web/src/components/AgentPanel.tsx`

`useChat` moves to `App`. `AgentPanel` receives `messages`, `isLoading`, and `sendMessage` as props — same types, just passed in rather than hook-owned.

- [ ] **Step 1: Write the updated `AgentPanel.tsx`**

Replace `apps/web/src/components/AgentPanel.tsx` with:

```typescript
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import type { ChatMessage } from '../types/chat'

interface AgentPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (content: string) => void
}

export default function AgentPanel({ messages, isLoading, sendMessage }: AgentPanelProps) {
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
              Ask about ISS passes or where it is right now.
              <br />
              <span className="text-gray-700">
                e.g. "Show me where the ISS is right now"
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

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/AgentPanel.tsx
git commit -m "refactor: AgentPanel accepts messages/isLoading/sendMessage as props"
```

---

## Task 9: Update `App.tsx` — lift `useChat`, wire `highlight` to `GlobeView`

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write the updated `App.tsx`**

Replace `apps/web/src/App.tsx` with:

```typescript
import GlobeView from './components/GlobeView'
import AgentPanel from './components/AgentPanel'
import { useChat } from './hooks/useChat'

export default function App() {
  const { messages, isLoading, sendMessage, highlight } = useChat()

  return (
    <div className="flex h-screen w-screen bg-gray-950 overflow-hidden">
      <div className="flex-[65]">
        <GlobeView highlight={highlight} />
      </div>
      <div className="flex-[35] border-l border-gray-800">
        <AgentPanel messages={messages} isLoading={isLoading} sendMessage={sendMessage} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `App.test.tsx` to match new shapes**

Replace `apps/web/src/App.test.tsx` with:

```typescript
import { render } from '@testing-library/react'
import App from './App'

vi.mock('./hooks/useGlobe', () => ({ useGlobe: vi.fn() }))
vi.mock('./hooks/useChat', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    isLoading: false,
    sendMessage: vi.fn(),
    highlight: null,
  })),
}))

window.HTMLElement.prototype.scrollIntoView = vi.fn()

test('App renders without crashing', () => {
  const { container } = render(<App />)
  expect(container.firstChild).toBeTruthy()
})
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/web && npx vitest run
```

Expected: All tests PASS. Count should be ≥ 14 (7 useChat + 2 satellite + 2 solar + 2 useGlobe + 1 App + 2 existing useChat baseline).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: lift useChat to App, wire highlight to GlobeView"
```

> **Note — highlight state persistence (session 4 concern):** `highlight` currently persists across messages for the life of the session. With only one satellite on the globe this is invisible — the globe stays facing the ISS whether or not it re-highlights. When session 4 adds multiple satellites, a stale `highlight` would leave the wrong satellite highlighted. The fix is to call `setHighlight(null)` at the start of `sendMessage` (i.e., when the user sends a new message). Do NOT implement that now — wait until multiple satellites exist so the fix is observable and testable. Flag this in the decisions log so it isn't forgotten.

---

## Task 10: End-to-end verify and deploy

**Files:** None (verification + CLAUDE.md + README.md)

- [ ] **Step 1: Run the full test suite one more time**

```bash
cd apps/web && npx vitest run
```

Expected: All tests PASS with no failures.

- [ ] **Step 2: Push to main (triggers Vercel auto-deploy)**

```bash
git push
```

Expected: Vercel builds and deploys within ~60 seconds.

- [ ] **Step 3: Verify deployment**

Open https://getsatlas.vercel.app in a browser. Type: "Show me where the ISS is right now"

Expected:
1. Bouncing dots appear while streaming.
2. Text response arrives (prose about ISS location, no mention of highlight).
3. Camera smoothly flies to face the ISS dot (~1.5s).
4. Yellow halo pulses 3 times then settles.

> **Symbolic-TLE caveat:** The ISS TLE is hardcoded to March 2024. The camera will fly to where the ISS *would be* at today's time if propagated from that 2024 epoch — not its real current position. The visual behaviour (camera moves, dot pulses) is what to verify, not geographic accuracy. Real-time accuracy requires live TLE fetch from CelesTrak, which is a session 4 prerequisite.

Also test: "When does the ISS pass over Melbourne?" → text only, no camera move (Claude shouldn't call `highlight_on_globe` for a pass prediction query).

- [ ] **Step 4: Update CLAUDE.md — tick off session 3 tasks, update Last session**

In the "Session 3 tasks" checklist, mark all items as `[x]`. Update "Last session ended at":

```
**Last session ended at:** Session 3 complete. highlight_on_globe tool shipped. Chat and globe are now one surface — asking about the ISS drives camera fly-to + pulse animation. Deployed at https://getsatlas.vercel.app.
```

Update "Next milestone":

```
**Next milestone:** Live TLE catalog — fetch ~500-2000 TLEs from CelesTrak, propagate in a web worker, render via instanced meshes so the main thread stays smooth.
```

Add decisions log entry:

```
- **2026-05-11 — highlight_on_globe shipped.** Backend: added HIGHLIGHT_TOOL alongside PREDICT_PASSES_TOOL; both are processed in the same first non-streaming turn; directive emitted as `\n__HIGHLIGHT__:...\n` after text stream. Frontend: useChat parses directive from accumulated buffer (handles cross-chunk splits), strips from displayed content, exposes `highlight` state. useChat lifted to App so highlight can flow to GlobeView. Globe.ts: cubic ease-in-out fly-to over 1500ms; SatelliteMesh.ts: sin-curve pulse for 3 × 1000ms cycles. Only NORAD 25544 (ISS) is supported — other IDs are silently ignored. No external animation library used. Known limitation: highlight state persists across messages within a session — invisible now (single satellite) but will need `setHighlight(null)` at sendMessage start once session 4 adds multiple satellites. Known limitation: ISS TLE is hardcoded to March 2024, so camera flies to a symbolically correct position, not the real current ISS location — live TLE fetch from CelesTrak becomes essential in session 4.
```

- [ ] **Step 5: Update README.md**

In the "Try it" section, add:

```markdown
- **"Show me where the ISS is right now"** — the agent responds with prose *and* flies the 3D globe camera to face the ISS, pulsing it three times.
```

In the roadmap or "What's working" section, add or update:

```markdown
- [x] Agent-driven globe interaction — chat can highlight and animate satellites on the globe
```

- [ ] **Step 6: Commit docs**

```bash
git add CLAUDE.md README.md
git commit -m "docs: session 3 complete — agent now drives the globe"
git push
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|------------|------|
| Structured response format (text + highlight directive) | Task 2 (`__HIGHLIGHT__:` line), Task 3 (parsing) |
| `api/chat.ts` updated for new format | Task 2 |
| `highlight_on_globe` tool in system prompt | Task 2 |
| Frontend parses highlight directives | Task 3 |
| Camera fly-to in Three.js globe | Task 5 |
| Pulse animation in Three.js globe | Task 4 + Task 5 |
| End-to-end test: "show me ISS" → text + highlight | Task 10 |
| Deploy verify | Task 10 |
| README + CLAUDE.md updated | Task 10 |

All spec requirements covered. ✓

**Placeholder scan:** No TBDs, no "similar to Task N" references, no "add error handling" vagueness. All code blocks are complete. ✓

**Type consistency check:**
- `HighlightDirective.norad_id` (string) used consistently in `types/chat.ts`, `useChat.ts`, `useGlobe.ts`, `Globe.ts`, `api/chat.ts`. ✓
- `Globe.highlightSatellite(noradId: string)` called with `highlight.norad_id` in `useGlobe.ts`. ✓
- `SatelliteMesh.getCurrentPosition()` returns `THREE.Vector3 | null` — used with null guard in `Globe.highlightSatellite()`. ✓
- `AgentPanel` props (`messages`, `isLoading`, `sendMessage`) match `useChat` return. ✓
- `useGlobe(containerRef, highlight)` signature matches call in `GlobeView`. ✓
