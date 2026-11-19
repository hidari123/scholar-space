/**
 * 命令是否**真的用**了 flags —— 回归测试。
 *
 * ⚠️ `cli.args.test.ts` 证明了 flags 到了 context；
 *    这组证明命令**读了** context.flags —— 两件事都要有。
 *
 *    之前的 bug 是两层都断了：
 *      ① 分发时没把 flags 传进 context
 *      ② 命令从 args 里找 flag（args 里根本没有 flag）
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { main } from './cli';

describe('sync 命令真的用 --kind', () => {
  /** sync 有两种 kind，产物完全不同。 */

  it('--kind typescript 同步 TS 基座', async () => {
    /** TS 基座应该包含 tsconfig.base.json。 */
    const dir = mkdtempSync(join(tmpdir(), 'sync-ts-'));

    try {
      await main(['sync', '--kind', 'typescript', '--target', dir]);

      expect(existsSync(join(dir, 'tsconfig.base.json'))).toBe(true);
      expect(existsSync(join(dir, 'ruff.toml'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--kind python 同步 Python 基座', async () => {
    /** Python 基座应该包含 ruff.toml。 */
    const dir = mkdtempSync(join(tmpdir(), 'sync-py-'));

    try {
      await main(['sync', '--kind', 'python', '--target', dir]);

      expect(existsSync(join(dir, 'ruff.toml'))).toBe(true);
      expect(existsSync(join(dir, 'tsconfig.base.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('默认是 python（没给 --kind 时）', async () => {
    /** 默认行为不变。 */
    const dir = mkdtempSync(join(tmpdir(), 'sync-def-'));

    try {
      await main(['sync', '--target', dir]);

      expect(existsSync(join(dir, 'ruff.toml'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('new 命令真的用 --template', () => {
  /** ⚠️ 这是最严重的一个 —— 之前要 ts-package 却生成 Python 项目。 */

  it('--template ts-package 生成 TS 项目', async () => {
    /** TS 项目有 tsconfig.json，没有 pyproject.toml。 */
    const root = mkdtempSync(join(tmpdir(), 'new-ts-'));

    try {
      await main(['new', 'my-ts-pkg', '--template', 'ts-package', '--target', root]);

      const projectDir = join(root, 'my-ts-pkg');
      expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'pyproject.toml'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('--template python-service 生成 Python 项目', async () => {
    /** Python 项目有 pyproject.toml。 */
    const root = mkdtempSync(join(tmpdir(), 'new-py-'));

    try {
      await main(['new', 'my-py-svc', '--template', 'python-service', '--target', root]);

      const projectDir = join(root, 'my-py-svc');
      expect(existsSync(join(projectDir, 'pyproject.toml'))).toBe(true);
      expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('默认是 python-service', async () => {
    /** 默认行为不变。 */
    const root = mkdtempSync(join(tmpdir(), 'new-def-'));

    try {
      await main(['new', 'my-default-svc', '--target', root]);

      const projectDir = join(root, 'my-default-svc');
      expect(existsSync(join(projectDir, 'pyproject.toml'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('生成的 tsconfig 指向本地 base 副本', async () => {
    /** ⚠️ 生成的子仓要能在独立 checkout 下工作 ——
     *    跨仓相对路径 extends 在子仓 CI 里会失效。
     */
    const root = mkdtempSync(join(tmpdir(), 'new-extends-'));

    try {
      await main(['new', 'my-ts-pkg2', '--template', 'ts-package', '--target', root]);

      const tsconfig = readFileSync(join(root, 'my-ts-pkg2', 'tsconfig.json'), 'utf8');

      expect(tsconfig).toContain('"extends": "./tsconfig.base.json"');
      expect(tsconfig).not.toContain('packages/conventions');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('生成的 tsconfig 声明自己的 paths', async () => {
    /** ⚠️ paths 必须由消费方声明 ——
     *    base 里的 paths 是相对 base 文件解析的，指向错误位置。
     */
    const root = mkdtempSync(join(tmpdir(), 'new-paths-'));

    try {
      await main(['new', 'my-ts-pkg3', '--template', 'ts-package', '--target', root]);

      const tsconfig = readFileSync(join(root, 'my-ts-pkg3', 'tsconfig.json'), 'utf8');

      expect(tsconfig).toContain('"paths"');
      expect(tsconfig).toContain('"@/*"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('同步后的 base 配置不含 baseUrl', () => {
  /** ⚠️ TypeScript 6.0 废弃、7.0 移除 baseUrl。 */

  it('tsconfig.base.json 没有 baseUrl 选项', async () => {
    /** 同步一份出来检查。 */
    const dir = mkdtempSync(join(tmpdir(), 'base-check-'));

    try {
      await main(['sync', '--kind', 'typescript', '--target', dir]);

      const base = readFileSync(join(dir, 'tsconfig.base.json'), 'utf8');

      // 去掉注释后检查是否真有 baseUrl 选项
      const withoutComments = base.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      expect(withoutComments).not.toMatch(/"baseUrl"\s*:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tsconfig.base.json 不含 paths（交给各包自己声明）', async () => {
    /** ⚠️ base 里的 paths 相对 base 文件解析，指向错误位置。 */
    const dir = mkdtempSync(join(tmpdir(), 'base-paths-'));

    try {
      await main(['sync', '--kind', 'typescript', '--target', dir]);

      const base = readFileSync(join(dir, 'tsconfig.base.json'), 'utf8');
      const withoutComments = base.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      expect(withoutComments).not.toMatch(/"paths"\s*:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
