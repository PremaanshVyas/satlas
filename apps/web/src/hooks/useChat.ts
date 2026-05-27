import { useState, useCallback } from 'react'
import type { ChatMessage, HighlightDirective, SetFilterDirective, SpotlightDirective } from '../types/chat'

const HIGHLIGHT_MARKER  = '\n__HIGHLIGHT__:'
const SET_FILTER_MARKER = '\n__SET_FILTER__:'
const SPOTLIGHT_MARKER  = '\n__SPOTLIGHT__:'

const ALL_MARKERS = [HIGHLIGHT_MARKER, SET_FILTER_MARKER, SPOTLIGHT_MARKER]

function extractDirective<T>(text: string, marker: string): T | null {
  const idx = text.indexOf(marker)
  if (idx === -1) return null
  const start = idx + marker.length
  // End = start of the next directive marker, or end of string
  const nextIdx = ALL_MARKERS
    .map(m => text.indexOf(m, start))
    .filter(i => i !== -1)
    .reduce((min, i) => Math.min(min, i), text.length)
  try { return JSON.parse(text.slice(start, nextIdx).replace(/\n+$/, '')) as T } catch { return null }
}

function parseDirectives(accumulated: string): {
  text: string
  highlight: HighlightDirective | null
  setFilter: SetFilterDirective | null
  spotlight: SpotlightDirective | null
} {
  const highlight = extractDirective<HighlightDirective>(accumulated, HIGHLIGHT_MARKER)
  const setFilter = extractDirective<SetFilterDirective>(accumulated, SET_FILTER_MARKER)
  const spotlight = extractDirective<SpotlightDirective>(accumulated, SPOTLIGHT_MARKER)

  // Only truncate at markers that parsed successfully — malformed directives stay visible as raw text
  const validPositions = [
    highlight !== null ? accumulated.indexOf(HIGHLIGHT_MARKER) : -1,
    setFilter !== null ? accumulated.indexOf(SET_FILTER_MARKER) : -1,
    spotlight !== null ? accumulated.indexOf(SPOTLIGHT_MARKER) : -1,
  ].filter(i => i !== -1)

  const cutoff = validPositions.length > 0 ? Math.min(...validPositions) : accumulated.length

  return { text: accumulated.slice(0, cutoff), highlight, setFilter, spotlight }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlight, setHighlight] = useState<HighlightDirective | null>(null)
  const [setFilter, setSetFilter] = useState<SetFilterDirective | null>(null)
  const [spotlight, setSpotlight] = useState<SpotlightDirective | null>(null)

  const sendMessage = useCallback(async (content: string, shownCategories?: string[], categoryCounts?: Record<string, number>) => {
    // Reset directives at the start of every new message
    setHighlight(null)
    setSetFilter(null)
    setSpotlight(null)

    // Snapshot history from messages currently in state (before adding new user message).
    // Filter out any still-streaming message (shouldn't exist at this point, but defensive).
    const history = messages
      .filter(m => !m.streaming)
      .map(m => ({ role: m.role, content: m.content }))

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      streaming: false,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true, timestamp: Date.now() },
    ])

    try {
      const body: Record<string, unknown> = { message: content, history }
      if (shownCategories !== undefined) body.shownCategories = shownCategories
      if (categoryCounts !== undefined && Object.keys(categoryCounts).length > 0) body.categoryCounts = categoryCounts
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let rawAccumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        rawAccumulated += chunk

        // Strip any directives from displayed content in real time
        const { text } = parseDirectives(rawAccumulated)
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: text } : m)),
        )
      }

      // Final parse: extract all directives
      const { text, highlight: newHighlight, setFilter: newSetFilter, spotlight: newSpotlight } = parseDirectives(rawAccumulated)
      const displayText = text.trim() ? text : 'No response — please try again.'
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: displayText } : m)),
      )
      if (newHighlight) setHighlight(newHighlight)
      if (newSetFilter) setSetFilter(newSetFilter)
      if (newSpotlight) setSpotlight(newSpotlight)
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
  }, [messages])

  return { messages, isLoading, sendMessage, highlight, setFilter, spotlight }
}
