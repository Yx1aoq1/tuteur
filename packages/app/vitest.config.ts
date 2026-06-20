import { defineConfig, configDefaults } from 'vitest/config';

// Tests live in tests/ mirroring src/ (CLAUDE.md test layout). Scope discovery there;
// keep excluding Next build output (standalone may copy src) as a belt-and-suspenders guard.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
});
