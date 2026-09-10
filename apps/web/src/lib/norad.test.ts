import { describe, test, expect } from 'vitest'
import { noradToInt, noradKey, looksLikeNoradId } from './norad'

describe('noradToInt', () => {
  test('plain numeric ids decode to themselves', () => {
    expect(noradToInt('25544')).toBe(25544)
    expect(noradToInt('5')).toBe(5)
  })

  test('leading zeros are irrelevant', () => {
    expect(noradToInt('06707')).toBe(6707)
    expect(noradToInt('6707')).toBe(6707)
  })

  test('alpha-5 decodes: the letter replaces the first two digits', () => {
    expect(noradToInt('A0000')).toBe(100000)
    expect(noradToInt('A0001')).toBe(100001)
    expect(noradToInt('T0000')).toBe(270000)
  })

  test('I and O are skipped in the alphabet', () => {
    // ...G H J K... — H is 17, so J must be 18, not 19. They are omitted so they cannot be
    // misread as the digits 1 and 0.
    expect(noradToInt('H0000')).toBe(170000)
    expect(noradToInt('J0000')).toBe(180000)
    expect(noradToInt('I0000')).toBeNaN()
    expect(noradToInt('O0000')).toBeNaN()
  })

  test('case is ignored', () => {
    expect(noradToInt('a0001')).toBe(100001)
  })

  test('unparseable ids are NaN, not 0', () => {
    // 0 would be a real NORAD id, so a parse failure must be distinguishable from it.
    expect(noradToInt('STARLINK-1234')).toBeNaN()
    expect(noradToInt('')).toBeNaN()
    expect(noradToInt(null)).toBeNaN()
    expect(noradToInt(undefined)).toBeNaN()
  })
})

describe('noradKey', () => {
  test('every encoding of one object collapses to the same key', () => {
    expect(noradKey('6707')).toBe(noradKey('06707'))
  })

  test('THE BUG: alpha-5 and its decoded form now share a key', () => {
    // satcat.json stores '100001'; the TLE carries 'A0001'. Keyed on the raw string these
    // never met, so the info card was empty for every satellite above NORAD 99999.
    expect(noradKey('A0001')).toBe(noradKey('100001'))
    expect(noradKey('A0001')).toBe('100001')
    expect(noradKey('T0000')).toBe('270000')
  })

  test('unparseable ids keep their original form rather than vanishing', () => {
    expect(noradKey('WEIRD-ID')).toBe('WEIRD-ID')
    expect(noradKey('  x  ')).toBe('x')
  })
})

describe('looksLikeNoradId', () => {
  test('accepts numeric and alpha-5, rejects names', () => {
    expect(looksLikeNoradId('25544')).toBe(true)
    expect(looksLikeNoradId('A0001')).toBe(true)
    expect(looksLikeNoradId('STARLINK-38128')).toBe(false)
    expect(looksLikeNoradId('ISS')).toBe(false)
  })
})
