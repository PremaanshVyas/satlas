// Friendly display names for abbreviated TLE catalog names.
export const DISPLAY_NAMES: Record<string, string> = {
  HST: 'Hubble Space Telescope',
  JWST: 'James Webb Space Telescope',
}

// Normalized alias pairs: (normalized key, catalog term to search for).
// Keys are already lowercase with no delimiters — same normalization as satellite names.
// Matching uses prefix logic: token "hubbl" is a prefix of "hubblespacetelescope" → "hst".
// Longer entries must come before shorter ones that share a prefix ("jameswebbspacetelescope"
// before "webb") so the most specific match wins on the joined-token path.
// To add a new entry: push [normalizedAlias, catalogAbbreviation].
export const NORMALIZED_ALIASES: [string, string][] = [
  ['hubblespacetelescope', 'hst'],      // hubbl / hubble / hubble sp / hubble space telescope
  ['jameswebbspacetelescope', 'jwst'],  // jam / james / james webb / james webb space telescope
  ['webb', 'jwst'],                     // webb typed standalone (not prefixed by "james")
  ['tiangong', 'tianhe'],               // tiango / tiangong → CSS (TIANHE-1) modules
  ['rocketbody', 'rb'],                 // rocket / rocket body / rocket bod → R/B entries
  ['debris', 'deb'],                    // debri / debris → DEB entries
]

export function getDisplayName(catalogName: string): string {
  return DISPLAY_NAMES[catalogName] ?? catalogName
}
