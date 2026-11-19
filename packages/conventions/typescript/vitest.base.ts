// vitest — 测试配置基座
// 规范唯一来源：scholarspace/packages/conventions/typescript/vitest.base.ts
//
// 用法（子包 vitest.config.ts）：
//   import { defineConfig, mergeConfig } from 'vitest/config';
//   import base from '@scholarspace/conventions-ts/vitest.base';
//   export default mergeConfig(base, defineConfig({ /* 包特有 */ }));

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],

    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'e2e/**',
      '**/*.d.ts',
      '**/__tests__/fixtures/**',
    ],

    // ── 覆盖率门禁（见 docs/06-架构护栏.md G20）────────
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/index.ts',
        'src/**/generated/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        // 整体 ≥75%；core 层应更高
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
    },

    // ── 性能 ─────────────────────────────────────────
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 5_000,

    // ── 隔离 ─────────────────────────────────────────
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});
