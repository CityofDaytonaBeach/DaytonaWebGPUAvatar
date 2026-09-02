import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    root: '.',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/testing/**',
        'src/roadmap/**',
        'src/index.ts',
        'src/**/*.d.ts',
      ],
      reportsDirectory: './coverage',
    },
  },
});
