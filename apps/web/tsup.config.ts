/**
 * tsup 配置。
 *
 * ⚠️ **不打包 React** —— 走 externals，
 *    避免跟主站用两份 React。
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'zustand'],
});
