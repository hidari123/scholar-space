import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  banner: { js: '#!/usr/bin/env node' },
  // ⚠️ cli.ts 是可执行入口，必须自带全部逻辑 ——
  //    若被抽成 chunk，入口只剩 re-export，直接执行时什么都不发生。
  //    splitting: false 保证入口是自包含的。
  splitting: false,
});
