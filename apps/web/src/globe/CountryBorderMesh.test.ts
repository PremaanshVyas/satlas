import { describe, test, expect } from 'vitest'
import * as THREE from 'three'
import { CountryBorderMesh } from './CountryBorderMesh'
import type { GeoJSONCollection } from './CountryBorderMesh'

const SQUARE: GeoJSONCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    },
    properties: { NAME: 'Test', CONTINENT: 'Test', LABEL_X: 5, LABEL_Y: 5 },
  }],
}

const ANTIMERIDIAN: GeoJSONCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      // edges [170→-170] and [-170→170] cross antimeridian — should be skipped
      coordinates: [[[170, 0], [-170, 0], [-170, 10], [170, 10], [170, 0]]],
    },
    properties: { NAME: 'Test', CONTINENT: 'Test', LABEL_X: 175, LABEL_Y: 5 },
  }],
}

describe('CountryBorderMesh', () => {
  test('creates a LineSegments instance', () => {
    const m = new CountryBorderMesh(SQUARE)
    expect(m.mesh).toBeInstanceOf(THREE.LineSegments)
  })

  test('correct vertex count: 4 edges × 2 vertices = 8', () => {
    const m = new CountryBorderMesh(SQUARE)
    const pos = m.mesh.geometry.getAttribute('position')
    expect(pos.count).toBe(8)
  })

  test('no NaN in position buffer', () => {
    const m = new CountryBorderMesh(SQUARE)
    const arr = m.mesh.geometry.getAttribute('position').array as Float32Array
    expect(Array.from(arr).every(v => !isNaN(v))).toBe(true)
  })

  test('skips antimeridian edges (|Δlon| > 180)', () => {
    const m = new CountryBorderMesh(ANTIMERIDIAN)
    const pos = m.mesh.geometry.getAttribute('position')
    // only 2 edges survive: [-170,0]→[-170,10] and [170,10]→[170,0]
    expect(pos.count).toBe(4)
  })

  test('handles MultiPolygon features', () => {
    const multi: GeoJSONCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
            [[[10, 0], [15, 0], [15, 5], [10, 5], [10, 0]]],
          ],
        },
        properties: { NAME: 'Multi', CONTINENT: 'Test', LABEL_X: 7, LABEL_Y: 2 },
      }],
    }
    const m = new CountryBorderMesh(multi)
    const pos = m.mesh.geometry.getAttribute('position')
    // 4 edges per polygon × 2 polygons × 2 vertices = 16
    expect(pos.count).toBe(16)
  })
})
