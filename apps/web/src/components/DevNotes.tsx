import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface DevNote {
  id: string
  title: string
  body: string
}

// Add future developer notes here — newest first
const DEV_NOTES: DevNote[] = [
  {
    id: 'catalog-names',
    title: 'Satellite name parsing',
    body: 'Some satellites appear with catalog-style IDs instead of common names. If a name search comes up empty, try searching by NORAD ID — we\'re working on improving name coverage.',
  },
]

interface DevNotesProps { hidden?: boolean }

export default function DevNotes({ hidden = false }: DevNotesProps) {
  const [open, setOpen] = useState(true)
  if (hidden) return null

  return (
    <>
      {/* Panel — anchored above the "i" button */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="devnotes-panel"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-20 z-30 w-72"
            style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
          >
            <div className="bg-[rgba(9,9,9,0.92)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.07)] rounded-[3px] shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-label">From the developer</span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close developer notes"
                  className="w-5 h-5 flex items-center justify-center font-mono text-label hover:text-secondary transition-colors leading-none touch-manipulation"
                >×</button>
              </div>

              {/* Notes */}
              {DEV_NOTES.map((note, i) => (
                <div
                  key={note.id}
                  className={`px-3 py-2.5 ${i < DEV_NOTES.length - 1 ? 'border-b border-[rgba(255,255,255,0.04)]' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-accent flex-shrink-0 mt-1.5 opacity-60" />
                    <div>
                      <div className="font-mono text-[10px] text-secondary mb-1">{note.title}</div>
                      <div className="font-mono text-[10px] text-label leading-relaxed">{note.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "i" button — below the chat button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close developer notes' : 'Open developer notes'}
        className={`absolute right-4 z-30 w-9 h-9 rounded-full bg-[rgba(9,9,9,0.9)] border shadow-lg flex items-center justify-center touch-manipulation transition-colors font-mono text-[13px] font-medium ${
          open
            ? 'border-[rgba(255,255,255,0.15)] text-secondary'
            : 'border-[rgba(255,255,255,0.07)] text-label hover:border-[rgba(255,255,255,0.15)] hover:text-secondary'
        }`}
        style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
      >
        i
      </button>
    </>
  )
}
