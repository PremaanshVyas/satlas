// Space-Track alpha-5 NORAD ids.
//
// The catalog passed 99,999 objects, so Space-Track now encodes ids above that as a letter
// followed by four digits: A0000 = 100000, T0000 = 270000. The letter replaces the first
// two digits, and I and O are skipped so they can't be misread as 1 and 0.
//
// This broke every lookup that crossed a data-source boundary, silently:
//   • parseInt('A0001') is NaN, and NaN never equals anything — not even itself — so an
//     id comparison against an alpha-5 record could never match.
//   • satcat.json stores the decoded integer ('100001') while the TLE carries the encoded
//     form ('A0001'), so Map lookups keyed on the raw string missed and the info card came
//     up empty for real satellites that did have metadata.
//
// The alphabet is identical to norad_to_int in apps/orbital/satellites.py, so the frontend
// and the refresh job agree on what any given id means.
const ALPHA5_DIGITS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/**
 * Decode a NORAD id (plain or alpha-5) to its integer value.
 * Returns NaN when the id is unparseable, so callers can tell "no id" from "id zero".
 */
export function noradToInt(raw: string | null | undefined): number {
  const s = (raw ?? '').trim().toUpperCase()
  if (s === '') return NaN
  if (/^\d+$/.test(s)) return parseInt(s, 10)

  const first = ALPHA5_DIGITS.indexOf(s[0])
  const rest = s.slice(1)
  if (first >= 10 && /^\d{1,4}$/.test(rest)) return first * 10000 + parseInt(rest, 10)

  return NaN
}

/**
 * Canonical string key for a NORAD id, for use on both sides of a Map.
 *
 * Everything normalises to the decoded integer as a string, which collapses all three
 * encodings of the same object: '06707', '6707' and 'A0001'. That replaces the old
 * padStart(5,'0') approach, which handled leading zeros but could never reconcile an
 * alpha-5 id with its decoded form because neither string is five characters after padding.
 *
 * Unparseable ids fall back to the trimmed original rather than being dropped, so a record
 * with an odd id is still addressable instead of silently vanishing.
 */
export function noradKey(raw: string | null | undefined): string {
  const n = noradToInt(raw)
  return Number.isNaN(n) ? (raw ?? '').trim() : String(n)
}

/** True when a search string looks like a NORAD id rather than a satellite name. */
export function looksLikeNoradId(raw: string): boolean {
  return !Number.isNaN(noradToInt(raw))
}
