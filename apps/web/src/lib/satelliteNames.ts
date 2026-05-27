// Friendly display names for abbreviated TLE catalog names.
// Only add entries you are certain about — wrong mappings break search.
export const DISPLAY_NAMES: Record<string, string> = {
  HST: 'Hubble Space Telescope',
  JWST: 'James Webb Space Telescope',
}

// Phrase-level aliases applied to the search query BEFORE tokenization.
// Patterns consume the whole common phrase so no stray tokens remain.
// Examples:
//   "hubble"                    → "hst"
//   "hubble space telescope"    → "hst"
//   "webb" / "james webb"       → "jwst"
//   "james webb space telescope"→ "jwst"
//   "tiangong"                  → "tianhe" (matches CSS TIANHE-1 modules)
export const PHRASE_ALIASES: [RegExp, string][] = [
  [/james\s*webb(\s+space\s+telescope)?/gi, 'jwst'],
  [/hubble(\s+space\s+telescope)?/gi, 'hst'],
  [/\bwebb\b/gi, 'jwst'],
  [/\btiangong\b/gi, 'tianhe'],
]

export function getDisplayName(catalogName: string): string {
  return DISPLAY_NAMES[catalogName] ?? catalogName
}
