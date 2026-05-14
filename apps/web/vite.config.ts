import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js + satellite.js together exceed Vite's 500 kB default warning limit.
    // This is expected for a 3D WebGL app — raise the threshold rather than
    // attempting to split a library that has no meaningful dynamic-import boundary.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
