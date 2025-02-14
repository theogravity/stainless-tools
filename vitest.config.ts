import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./setup-vitest.ts'],
    include: ['src/**/*.test.ts'],
  },
}); 
