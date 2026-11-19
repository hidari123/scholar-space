/**
 * `ts-package` 模板 —— 三层 TS 库。
 *
 * ⚠️ 结构与 examples/ts-package 一致 —— Step 0.3 实测验证过的形状。
 */

import type { Template } from '../templates';

export const tsPackageTemplate: Template = {
  id: 'ts-package',
  name: 'TypeScript Package',
  description: '三层 TS 库（core / components / hooks）',
  language: 'typescript',
  verifyCommands: [
    'pnpm install',
    'pnpm run typecheck',
    'pnpm run lint',
    'pnpm run test',
    'pnpm run build',
  ],

  files: [
    {
      path: 'package.json',
      content: `{
  "name": "{{scopeName}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "license": "UNLICENSED",
  "type": "module",
  "sideEffects": false,
  "engines": {
    "node": ">=22.13.0"
  },

  "publishConfig": {
    "access": "restricted",
    "registry": "https://npm.pkg.github.com"
  },

  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },

  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],

  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest run",
    "verify": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
  },

  "dependencies": {
    "@scholarspace/ui": "^0.1.0"
  },

  "peerDependencies": {
    "react": ">=18.0.0 <20",
    "react-dom": ">=18.0.0 <20"
  },

  "devDependencies": {
    "@biomejs/biome": "^2.6.4",
    "@types/react": "^19.3.0",
    "jsdom": "^26.0.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "tsup": "^9.0.0",
    "typescript": "^5.9.3",
    "vitest": "^5.0.5"
  }
}
`,
    },

    {
      path: 'tsconfig.json',
      content: `{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
`,
    },

    {
      path: 'biome.json',
      content: `{
  "extends": ["./biome.base.json"],
  "files": {
    "includes": ["src/**", "*.json", "*.ts"]
  }
}
`,
    },

    {
      path: 'tsup.config.ts',
      content: `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['react', 'react-dom', '@scholarspace/ui'],
});
`,
    },

    {
      path: 'vitest.config.ts',
      content: `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/index.ts'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
    },
  },
});
`,
    },

    {
      path: 'src/core/types.ts',
      content: `/**
 * core 层 —— 纯逻辑，零 React、零 DOM。
 *
 * ⚠️ 可被 Node / Worker / SSR 直接 import。
 */

export interface Example {
  readonly exampleId: string;
  readonly name: string;
  readonly createdAt: Date;
}
`,
    },

    {
      path: 'src/core/create-example.ts',
      content: `/**
 * core 层 —— 纯业务逻辑（无 React、无 DOM）。
 */

import type { Example } from './types';

export interface CreateExampleInput {
  readonly name: string;
}

/**
 * 创建示例 —— 领域规则校验 + 构造。
 */
export function createExample(input: CreateExampleInput): Example {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error('name cannot be empty');
  }

  return {
    exampleId: \`example-\${Date.now()}\`,
    name,
    createdAt: new Date(),
  };
}
`,
    },

    {
      path: 'src/core/create-example.test.ts',
      content: `import { describe, expect, it } from 'vitest';

import { createExample } from './create-example';

describe('createExample', () => {
  it('creates a valid example', () => {
    const example = createExample({ name: 'demo' });

    expect(example.name).toBe('demo');
    expect(example.exampleId).toMatch(/^example-/);
  });

  it('trims whitespace', () => {
    expect(createExample({ name: '  padded  ' }).name).toBe('padded');
  });

  it('rejects an empty name', () => {
    expect(() => createExample({ name: '   ' })).toThrow();
  });
});
`,
    },

    {
      path: 'src/core/index.ts',
      content: `export type { CreateExampleInput } from './create-example';
export { createExample } from './create-example';
export type { Example } from './types';
`,
    },

    {
      path: 'src/index.ts',
      content: `/**
 * {{scopeName}} —— 唯一公开入口。
 *
 * ⚠️ 消费者只能从这里 import。
 */

export type { CreateExampleInput, Example } from './core';
export { createExample } from './core';
`,
    },

    {
      path: '.gitignore',
      content: `node_modules/
dist/
coverage/
*.tsbuildinfo
.env
`,
    },

    {
      path: 'README.md',
      content: `# {{name}}

> {{description}}

---

## 快速开始

\`\`\`bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
\`\`\`

---

## 架构

三层结构：

\`\`\`
core/         纯逻辑，零 React、零 DOM
components/   React 组件
hooks/        React hooks
\`\`\`

**共享 UI**：所有组件从 \`@scholarspace/ui\` 取，**禁止直接 import antd**。

**规范基座**：\`tsconfig.base.json\` / \`biome.base.json\` 是从主仓复制来的本地副本
（见 \`SYNC.md\`）。更新方式：\`npx @scholarspace/cli sync --kind typescript\`。
`,
    },
  ],
};
