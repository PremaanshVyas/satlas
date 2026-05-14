import { useState, useCallback } from 'react'
import type { ChatMessage, HighlightDirective, GroupHighlightDirective } from '../types/chat'

const HIGHLIGHT_MARKER = '\n__HIGHLIGHT__:'
const GROUP_HIGHLIGHT_MARKER = '\n__GROUP_HIGHLIGHT__:'

function parseDirectives(accumulated: string): {
  text: string
  highlight: HighlightDirective | null
  groupHighlight: GroupHighlightDirective | null
} {
  let text = accumulated
  let highlight: HighlightDirective | null = null
  let groupHighlight: GroupHighlightDirective | null = null

  // Process __HIGHLIGHT__ first (emitted before __GROUP_HIGHLIGHT__ in the stream)
  const hIdx = text.indexOf(HIGHLIGHT_MARKER)
  if (hIdx !== -1) {
    const jsonStr = text.slice(hIdx + HIGHLIGHT_MARKER.length).replace(/\n$/, '')
    try {
      highlight = JSON.parse(jsonStr) as HighlightDirective
      text = text.slice(0, hIdx)  // only strip when parse succeeds
    } catch { /* malformed: keep raw text so user sees it */ }
  }

  const ghIdx = text.indexOf(GROUP_HIGHLIGHT_MARKER)
  if (ghIdx !== -1) {
    const jsonStr = text.slice(ghIdx + GROUP_HIGHLIGHT_MARKER.length).replace(/\n$/, '')
    try {
      groupHighlight = JSON.parse(jsonStr) as GroupHighlightDirective
      text = text.slice(0, ghIdx)
    } catch { /* malformed: keep raw text */ }
  }

  return { text, highlight, groupHighlight }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlight, setHighlight] = useState<HighlightDirective | null>(null)
  const [groupHighlight, setGroupHighlight] = useState<GroupHighlightDirective | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    // Reset directives at the start of every new message
    setHighlight(null)
    setGroupHighlight(null)

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
        body: JSON.stringify({ message: content, history }),
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
      const { text, highlight: newHighlight, groupHighlight: newGroupHighlight } = parseDirectives(rawAccumulated)
      const displayText = text.trim() ? text : 'No response — please try again.'
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: displayText } : m)),
      )
      if (newHighlight) setHighlight(newHighlight)
      if (newGroupHighlight) setGroupHighlight(newGroupHighlight)
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

  return { messages, isLoading, sendMessage, highlight, groupHighlight }
}
