import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../types/chat'

interface AgentPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (content: string) => void
  prefill?: string | null
  onClearPrefill?: () => void
  onClose?: () => void
}

export default function AgentPanel({ messages, isLoading, sendMessage, prefill, onClearPrefill, onClose }: AgentPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(prefill)
      inputRef.current?.focus()
    }
  }, [prefill])

  function handleSend() {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
    onClearPrefill?.()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-[11px] text-label text-center leading-relaxed px-4 uppercase tracking-[0.1em]">
              Ask about any satellite or the ISS.
              <br />
              <span className="text-[#555555] mt-1 block">
                e.g. "Where is the ISS right now?"
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
              className={`max-w-[88%] rounded-[3px] px-3 py-2 font-mono text-[13px] font-light leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.15)] text-white whitespace-pre-wrap'
                  : 'border border-[rgba(255,255,255,0.06)] text-secondary'
              }`}
            >
              {msg.role === 'user' ? (
                msg.content
              ) : msg.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul:     ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                    ol:     ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                    li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="text-white font-medium">{children}</strong>,
                    em:     ({ children }) => <em className="text-[#aaa]">{children}</em>,
                    code:   ({ children }) => <code className="bg-[rgba(255,255,255,0.07)] px-1 rounded text-accent text-[12px]">{children}</code>,
                    a:      ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{children}</a>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : msg.streaming ? (
                <span className="inline-flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-none border-t border-[rgba(255,255,255,0.04)] px-3 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-none w-8 h-8 flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.07)] font-mono text-label hover:text-secondary transition-colors touch-manipulation"
              aria-label="Close chat"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 bg-[rgba(9,9,9,0.72)] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 font-mono text-[13px] text-secondary placeholder:text-label outline-none focus:border-[rgba(0,212,255,0.3)] transition-colors disabled:opacity-50"
            placeholder="Ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex-none px-3 py-2 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent hover:border-[rgba(0,212,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-manipulation"
          >
            Send
          </button>
        </div>
      </div>
    </>
  )
}
