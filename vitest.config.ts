import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only run source tests — never the compiled copies in dist/
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.git/**'],
  },
})
