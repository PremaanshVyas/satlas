import { useState, useRef, useEffect, useCallback } from 'react'
import type { SearchResult } from '../globe/searchUtils'

interface SearchBarProps {
  onSearch: (query: string) => SearchResult[]
  onSelect: (noradId: string, name: string) => void
}

export default function SearchBar({ onSearch, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    const r = onSearch(val)
    setResults(r)
    setOpen(r.length > 0 && val.trim().length > 0)
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
      <div className="flex items-center gap-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700/80 rounded-lg px-3 py-2 shadow-lg w-64">
        <svg className="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
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
          className="bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none w-full"
          aria-label="Search satellites"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            className="text-gray-600 hover:text-gray-400 flex-shrink-0 leading-none"
            aria-label="Clear search"
          >×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-gray-900/95 backdrop-blur-sm border border-gray-700/80 rounded-lg shadow-2xl overflow-hidden z-50">
          {results.map((r, i) => (
            <button
              key={r.noradId}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${
                i === activeIdx ? 'bg-gray-700/80' : 'hover:bg-gray-800/80'
              }`}
              onMouseDown={e => { e.preventDefault(); handleSelect(r) }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="text-gray-200 truncate">{r.name}</span>
              <span className="text-gray-600 text-xs flex-shrink-0">{r.noradId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
