import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { X, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../types/chat'

const SUGGESTED_PROMPTS = [
  'Where is the ISS right now?',
  'What satellites are over Melbourne tonight?',
  'Show only GPS satellites',
  'What is the Hubble Space Telescope doing?',
] as const

const MAX_CHARS = 200

interface AgentPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  sendMessage: (content: string) => void
  prefill?: string | null
  onClearPrefill?: () => void
  onClose?: () => void
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  const charsLeft = MAX_CHARS - input.length
  const showCounter = input.length > MAX_CHARS * 0.8

  return (
    <>
      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col h-full items-center justify-center gap-6">
            <p className="font-mono text-[11px] text-label text-center leading-relaxed px-4 uppercase tracking-[0.1em]">
              Ask about any satellite or the ISS.
              <br />
              <span className="text-[#555555] mt-1 block normal-case tracking-normal">
                e.g. "Where is the ISS right now?"
              </span>
            </p>
            <div className="flex flex-col gap-1.5 w-full px-2">
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => { sendMessage(prompt); onClearPrefill?.() }}
                  disabled={isLoading}
                  className="w-full text-left px-3 py-2 rounded-[3px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] font-mono text-[11px] text-label hover:text-secondary hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150 active:scale-[0.98] disabled:opacity-40 touch-manipulation"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
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
                    a:      ({ href, children }) => {
                      const safe = typeof href === 'string' && (href.startsWith('https://') || href.startsWith('http://'))
                      return safe
                        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{children}</a>
                        : <span className="text-accent">{children}</span>
                    },
                    h1:     ({ children }) => <p className="text-white font-medium mb-1">{children}</p>,
                    h2:     ({ children }) => <p className="text-white font-medium mb-1">{children}</p>,
                    h3:     ({ children }) => <p className="text-secondary font-medium mb-1">{children}</p>,
                    table:  ({ children }) => (
                      <div className="my-2 w-full overflow-x-auto [&_td:first-child]:whitespace-nowrap [&_td:first-child]:pr-4 [&_td:first-child]:text-[rgba(255,255,255,0.6)] [&_th:first-child]:pr-4">
                        <table className="w-full text-[12px] border-collapse">{children}</table>
                      </div>
                    ),
                    thead:  ({ children }) => <thead className="border-b border-[rgba(255,255,255,0.08)]">{children}</thead>,
                    tbody:  ({ children }) => <tbody>{children}</tbody>,
                    tr:     ({ children }) => <tr className="border-b border-[rgba(255,255,255,0.05)] last:border-0">{children}</tr>,
                    th:     ({ children }) => <th className="text-left text-[10px] uppercase tracking-[0.08em] text-label font-normal py-1.5">{children}</th>,
                    td:     ({ children }) => <td className="py-1.5 text-secondary align-top">{children}</td>,
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
            {msg.timestamp > 0 && !msg.streaming && (
              <span className="font-mono text-[9px] text-[#444] mt-0.5 px-1">
                {fmtTime(msg.timestamp)}
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-none border-t border-[rgba(255,255,255,0.04)] px-3 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {showCounter && (
          <div className={`font-mono text-[9px] text-right mb-1 ${charsLeft < 0 ? 'text-danger' : 'text-amber-400'}`}>
            {charsLeft < 0 ? `${Math.abs(charsLeft)} over limit` : `${charsLeft} left`}
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              onClick={onClose}
              className="flex-none w-8 h-8 flex items-center justify-center rounded-[3px] border border-[rgba(255,255,255,0.07)] text-label hover:text-secondary transition-colors active:scale-95 touch-manipulation"
              aria-label="Close chat"
            >
              <X size={12} />
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
            maxLength={MAX_CHARS + 20}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || charsLeft < 0}
            className="flex-none px-3 py-2 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.08em] border border-[rgba(0,212,255,0.2)] text-accent hover:border-[rgba(0,212,255,0.4)] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-75 active:scale-95 touch-manipulation flex items-center gap-1.5"
          >
            <Send size={11} />
            Send
          </button>
        </div>
      </div>
    </>
  )
}
