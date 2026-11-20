/**
 * Vite 配置 —— 开发服务器 + 构建。
 *
 * ⚠️ **开发服务器要代理 API** ——
 *    前端跑在 5173，后端跑在别的端口。
 *    不配代理的话前端会请求 5173 上的 API（拿不到）。
 *
 * ⚠️ **代理目标是环境变量** ——
 *    各独立站的后端地址不一样，用 `VITE_API_BASE_URL` 配。
 */

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // ⚠️ **默认代理到本地 8000** ——
  //    各服务的实际端口在 docs/11-执行计划.md 里有规划。
  const apiTarget = env.VITE_API_BASE_URL ?? 'http://localhost:8000';

  return {
    plugins: [react()],

    server: {
      // ⚠️ **端口规划** ——
      //    5173 容易被占用（其他开发工具常用）。
      //    主仓集成壳用 5173，各独立站往后排（5271~5275）。
      port: Number(env.VITE_DEV_PORT ?? 5173),
      // ⚠️ **允许跨域访问** —— 各独立站是不同端口。
      host: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
