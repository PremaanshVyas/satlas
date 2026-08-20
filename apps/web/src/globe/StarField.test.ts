import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { StarField } from './StarField'

describe('StarField', () => {
  it('adds every tier to the scene', () => {
    const scene = new THREE.Scene()
    const stars = new StarField()
    stars.addToScene(scene)
    // Three density tiers give the illusion of depth — all must be in the scene
    expect(scene.children.filter(c => c instanceof THREE.Points)).toHaveLength(3)
    stars.dispose()
  })

  it('is visible by default', () => {
    const scene = new THREE.Scene()
    const stars = new StarField()
    stars.addToScene(scene)
    expect(scene.children.every(c => c.visible)).toBe(true)
    stars.dispose()
  })

  it('setVisible(false) hides every tier, not just the first', () => {
    const scene = new THREE.Scene()
    const stars = new StarField()
    stars.addToScene(scene)
    stars.setVisible(false)
    expect(scene.children.some(c => c.visible)).toBe(false)
    stars.dispose()
  })

  it('setVisible(true) restores every tier', () => {
    const scene = new THREE.Scene()
    const stars = new StarField()
    stars.addToScene(scene)
    stars.setVisible(false)
    stars.setVisible(true)
    expect(scene.children.every(c => c.visible)).toBe(true)
    stars.dispose()
  })
})
