import { useState, useRef, useEffect, useCallback } from 'react'
import type { SearchResult, SearchResults } from '../globe/searchUtils'

interface SearchBarProps {
  onSearch: (query: string) => SearchResults
  onSelect: (noradId: string, name: string) => void
}

export default function SearchBar({ onSearch, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    const trimmed = val.trim()
    if (!trimmed) {
      setResults([]); setTotal(0); setOpen(false); setNoResults(false); setActiveIdx(-1); return
    }
    const { results: r, total: t } = onSearch(val)
    setResults(r)
    setTotal(t)
    setNoResults(r.length === 0)
    setOpen(true)
    setActiveIdx(-1)
  }, [onSearch])

  const handleSelect = useCallback((result: SearchResult) => {
    onSelect(result.noradId, result.name)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.blur()
  }, [onSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); const r = results[activeIdx]; if (r) handleSelect(r) }
    if (e.key === 'Escape')    { setQuery(''); setResults([]); setOpen(false); inputRef.current?.blur() }
  }, [open, results, activeIdx, handleSelect])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 bg-[rgba(9,9,9,0.72)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] px-3 py-2 shadow-lg w-36 sm:w-64">
        <svg className="w-3.5 h-3.5 text-label flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          placeholder="Search satellites…"
          className="bg-transparent font-mono text-[11px] text-secondary placeholder:text-label outline-none w-full"
          aria-label="Search satellites"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            className="font-mono text-label hover:text-secondary flex-shrink-0 leading-none transition-colors"
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-[rgba(9,9,9,0.95)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden z-50">
          {results.length > 0 ? (
            <>
              {results.map((r, i) => (
                <button
                  key={r.noradId}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.04)] transition-colors ${
                    i === activeIdx ? 'bg-[rgba(255,255,255,0.04)]' : ''
                  }`}
                  onMouseDown={e => { e.preventDefault(); handleSelect(r) }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="font-mono text-[12px] text-secondary truncate">{r.name}</span>
                  <span className="font-mono text-[10px] text-label flex-shrink-0">{r.noradId}</span>
                </button>
              ))}
              {total > results.length && (
                <div className="px-3 py-1.5 font-mono text-[10px] text-[rgba(255,255,255,0.25)] select-none border-t border-[rgba(255,255,255,0.04)]">
                  +{total - results.length} more — refine your search
                </div>
              )}
            </>
          ) : noResults ? (
            <div className="px-3 py-2.5">
              <div className="font-mono text-[11px] text-label">No results for "{query}"</div>
            </div>
          ) : null}
          <div className="px-3 py-2 font-mono text-[9px] text-[rgba(255,255,255,0.18)] select-none border-t border-[rgba(255,255,255,0.04)] leading-relaxed">
            Some satellites use catalog names — try their NORAD ID if a name search misses.
          </div>
        </div>
      )}
    </div>
  )
}
