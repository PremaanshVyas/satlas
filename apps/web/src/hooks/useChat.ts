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
    // Reset highlight at the start of every new message
    setHighlight(null)

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
  }, [messages])

  return { messages, isLoading, sendMessage, highlight }
}
