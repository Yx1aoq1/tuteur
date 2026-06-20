import { defineConfig } from 'vitest/config';

// Tests live in tests/ mirroring src/ (CLAUDE.md test layout); scope discovery there
// so compiled dist/ artifacts are never picked up as suites.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
