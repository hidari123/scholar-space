/**
 * G27 护栏测试 —— 配置文件纯 ASCII 检查。
 *
 * ⚠️ **为什么需要这条护栏**：
 *   mypy / import-linter 用**系统 locale** 读 .ini 文件。
 *   Windows 中文环境是 GBK —— .ini 里有中文注释就崩：
 *
 *     UnicodeDecodeError: 'gbk' codec can't decode byte 0x80
 *
 *   这个坑主仓踩过一次，**独立仓没有护栏，又踩了一次**。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GUARDS, type Guard, runGuards } from './guards';

/**
 * 取 G27 护栏。
 *
 * ⚠️ **不用 `g27!` 非空断言** —— Biome 禁止（noNonNullAssertion）。
 *    找不到就是测试写错了，直接抛错更清楚。
 */
function getG27(): Guard {
  const guard = GUARDS.find((item) => item.id === 'G27');
  if (!guard) throw new Error('G27 护栏不存在');
  return guard;
}

describe('G27 —— 配置文件必须纯 ASCII', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'g27-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** 造一个包目录，带 pyproject.toml + mypy.ini。 */
  function makePackage(name: string, mypyContent: string): string {
    const dir = join(root, 'packages', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    writeFileSync(join(dir, 'mypy.ini'), mypyContent);
    return dir;
  }

  it('护栏存在', () => {
    expect(getG27().id).toBe('G27');
  });

  it('纯 ASCII 的 mypy.ini 通过', () => {
    makePackage('good', '[mypy]\nstrict = True\n# ASCII comment\n');

    const violations = getG27().run(root);

    expect(violations).toHaveLength(0);
  });

  it('⚠️ 含中文的 mypy.ini 被拦下', () => {
    makePackage('bad', '[mypy]\n# 这是中文注释\nstrict = True\n');

    const violations = getG27().run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('mypy.ini');
    expect(violations[0]).toContain('ASCII');
  });

  it('⚠️ 报错要说明「为什么会崩」', () => {
    makePackage('bad2', '[mypy]\n# 中文\n');

    const violations = getG27().run(root);

    expect(violations[0]).toMatch(/GBK|locale|解码/);
  });

  it('⚠️ 非 ASCII 的 BOM 也算违规', () => {
    makePackage('bom', '\uFEFF[mypy]\nstrict = True\n');

    const violations = getG27().run(root);

    expect(violations).toHaveLength(1);
  });

  it('没有 mypy.ini 不报错', () => {
    const dir = join(root, 'packages', 'nomy');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\n');

    expect(getG27().run(root)).toHaveLength(0);
  });

  it('⚠️ setup.cfg 也要查（import-linter 用它）', () => {
    const dir = join(root, 'packages', 'cfg');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'setup.cfg'), '[importlinter:contract:0]\n# 中文注释\n');

    const violations = getG27().run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('setup.cfg');
  });

  it('⚠️ .importlinter 也要查', () => {
    const dir = join(root, 'packages', 'il');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.importlinter'), '[importlinter]\n# 中文\n');

    expect(getG27().run(root)).toHaveLength(1);
  });

  it('⚠️ pyproject.toml 不查 —— TOML 解析器读 UTF-8', () => {
    // ⚠️ TOML 是 UTF-8 规范，中文注释没问题
    makePackage('toml', '[mypy]\n');
    const dir = join(root, 'packages', 'toml');
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\ndescription = "中文描述"\n');

    expect(getG27().run(root)).toHaveLength(0);
  });

  it('能通过 runGuards 跑', () => {
    makePackage('x', '[mypy]\n# 中文\n');

    const results = runGuards(root, ['G27']);

    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(false);
  });
});
