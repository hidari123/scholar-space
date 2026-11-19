import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectBrokenExtends, syncConventions, writeLocalExtendsGuide } from './sync';

/** 建一个模拟的主仓（带 conventions base 文件）。 */
function makeSourceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cli-src-'));

  mkdirSync(join(root, 'packages', 'conventions', 'python'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'conventions', 'python', 'mypy.ini'),
    '[mypy]\nstrict = True\n',
    'utf8',
  );
  writeFileSync(
    join(root, 'packages', 'conventions', 'python', 'ruff.toml'),
    'line-length = 100\n',
    'utf8',
  );

  mkdirSync(join(root, 'packages', 'conventions', 'typescript'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'conventions', 'typescript', 'tsconfig.base.json'),
    '{ "compilerOptions": { "strict": true } }',
    'utf8',
  );
  writeFileSync(
    join(root, 'packages', 'conventions', 'typescript', 'biome.json'),
    '{ "linter": { "enabled": true } }',
    'utf8',
  );

  return root;
}

describe('syncConventions', () => {
  it('python 侧复制 mypy.ini', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    const result = syncConventions(sourceRoot, targetRoot, 'python');

    expect(result.failed).toEqual([]);
    expect(result.copied).toContain('mypy.ini');
    expect(result.changed).toBe(true);
    expect(existsSync(join(targetRoot, 'mypy.ini'))).toBe(true);
  });

  it('python 侧同时复制 ruff.toml（子仓 CI 独立 checkout 需要）', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    const result = syncConventions(sourceRoot, targetRoot, 'python');

    expect(result.copied).toContain('ruff.toml');
    expect(existsSync(join(targetRoot, 'ruff.toml'))).toBe(true);
  });

  it('typescript 侧复制两个 base 文件', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    const result = syncConventions(sourceRoot, targetRoot, 'typescript');

    expect(result.copied).toContain('tsconfig.base.json');
    expect(result.copied).toContain('biome.base.json');
    expect(existsSync(join(targetRoot, 'tsconfig.base.json'))).toBe(true);
    expect(existsSync(join(targetRoot, 'biome.base.json'))).toBe(true);
  });

  it('内容相同则不重复复制', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    syncConventions(sourceRoot, targetRoot, 'python');
    const second = syncConventions(sourceRoot, targetRoot, 'python');

    expect(second.changed).toBe(false);
    expect(second.copied).toEqual([]);
  });

  it('内容变化则重新复制', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    syncConventions(sourceRoot, targetRoot, 'python');

    // 改主仓的 base
    writeFileSync(
      join(sourceRoot, 'packages', 'conventions', 'python', 'mypy.ini'),
      '[mypy]\nstrict = True\nwarn_unused_ignores = True\n',
      'utf8',
    );

    const second = syncConventions(sourceRoot, targetRoot, 'python');

    expect(second.changed).toBe(true);
    expect(readFileSync(join(targetRoot, 'mypy.ini'), 'utf8')).toContain('warn_unused_ignores');
  });

  it('源文件缺失时记录失败而非崩溃', () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), 'cli-empty-'));
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));

    const result = syncConventions(sourceRoot, targetRoot, 'python');

    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.copied).toEqual([]);
  });

  it('创建缺失的父目录', () => {
    const sourceRoot = makeSourceRoot();
    const targetRoot = join(mkdtempSync(join(tmpdir(), 'cli-target-')), 'nested', 'deep');

    syncConventions(sourceRoot, targetRoot, 'python');

    expect(existsSync(join(targetRoot, 'mypy.ini'))).toBe(true);
  });
});

describe('detectBrokenExtends', () => {
  it('extends 指向存在的文件 → 无问题', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    writeFileSync(join(targetRoot, 'tsconfig.base.json'), '{}', 'utf8');
    writeFileSync(
      join(targetRoot, 'tsconfig.json'),
      '{ "extends": "./tsconfig.base.json" }',
      'utf8',
    );

    expect(detectBrokenExtends(targetRoot)).toEqual([]);
  });

  it('extends 指向不存在的文件 → 报问题', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    writeFileSync(
      join(targetRoot, 'tsconfig.json'),
      '{ "extends": "../../packages/conventions/typescript/tsconfig.base.json" }',
      'utf8',
    );

    const problems = detectBrokenExtends(targetRoot);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain('tsconfig.json');
  });

  it('biome 的数组形式 extends 也能检测', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    writeFileSync(
      join(targetRoot, 'biome.json'),
      '{ "extends": ["../packages/conventions/typescript/biome.json"] }',
      'utf8',
    );

    const problems = detectBrokenExtends(targetRoot);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain('biome.json');
  });

  it('没有配置文件 → 无问题', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    expect(detectBrokenExtends(targetRoot)).toEqual([]);
  });
});

describe('writeLocalExtendsGuide', () => {
  it('生成 python 说明', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    const path = writeLocalExtendsGuide(targetRoot, 'python');

    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('mypy.ini');
  });

  it('生成 typescript 说明并给出本地 extends 写法', () => {
    const targetRoot = mkdtempSync(join(tmpdir(), 'cli-target-'));
    const path = writeLocalExtendsGuide(targetRoot, 'typescript');

    const content = readFileSync(path, 'utf8');
    expect(content).toContain('tsconfig.base.json');
    expect(content).toContain('./tsconfig.base.json');
  });
});
