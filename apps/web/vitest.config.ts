/**
 * Vitest 配置。
 *
 * ⚠️ **jsdom 环境** —— 组件测试需要 DOM。
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: false,
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
	},
});
