import { describe, test, expect } from 'vitest'
import * as THREE from 'three'
import { CountryHighlightMesh } from './CountryHighlightMesh'

const SQUARE_FEATURE = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]],
  },
  properties: {},
}

const MULTI_FEATURE = {
  type: 'Feature' as const,
  geometry: {
    type: 'MultiPolygon' as const,
    coordinates: [
      [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]],
    ],
  },
  properties: {},
}

describe('CountryHighlightMesh', () => {
  test('update() adds 2 children to scene (fill + border)', () => {
    const scene = new THREE.Scene()
    const m = new CountryHighlightMesh(scene)
    m.update(SQUARE_FEATURE)
    expect(scene.children).toHaveLength(2)
  })

  test('first child is a Mesh (fill), second is LineSegments (border)', () => {
    const scene = new THREE.Scene()
    const m = new CountryHighlightMesh(scene)
    m.update(SQUARE_FEATURE)
    expect(scene.children[0]).toBeInstanceOf(THREE.Mesh)
    expect(scene.children[1]).toBeInstanceOf(THREE.LineSegments)
  })

  test('clear() removes all children from scene', () => {
    const scene = new THREE.Scene()
    const m = new CountryHighlightMesh(scene)
    m.update(SQUARE_FEATURE)
    m.clear()
    expect(scene.children).toHaveLength(0)
  })

  test('calling update() twice replaces previous selection', () => {
    const scene = new THREE.Scene()
    const m = new CountryHighlightMesh(scene)
    m.update(SQUARE_FEATURE)
    m.update(SQUARE_FEATURE)
    expect(scene.children).toHaveLength(2)
  })

  test('handles MultiPolygon without throwing', () => {
    const scene = new THREE.Scene()
    const m = new CountryHighlightMesh(scene)
    expect(() => m.update(MULTI_FEATURE)).not.toThrow()
    expect(scene.children).toHaveLength(4) // 2 polygons × (fill + border)
  })
})
