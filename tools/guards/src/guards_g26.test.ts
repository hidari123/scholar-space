/**
 * G26 测试 —— 新建包必需文件齐全。
 *
 * ⚠️ 这条护栏对应两个实测踩过的坑：
 *   · 缺 `biome.json` → Biome 退回默认（tab），lint 一堆格式错
 *   · 缺 `py.typed` → 下游包 mypy 报 `import-untyped`
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GUARDS } from './guards';

/** 取护栏。 */
function guard(id: string) {
  const found = GUARDS.find((g) => g.id === id);
  if (!found) throw new Error(`护栏 ${id} 不存在`);
  return found;
}

/**
 * 建一个测试根目录。
 *
 * @param withBiomeJson TS 包是否带 biome.json
 * @param withPyTyped Python 包是否带 py.typed
 */
function makeRoot(options: { withBiomeJson?: boolean; withPyTyped?: boolean } = {}): string {
  const { withBiomeJson = true, withPyTyped = true } = options;
  const root = mkdtempSync(join(tmpdir(), 'guards-g26-'));

  // ── TS 包 ──────────────────────────────────────────
  const tsPkg = join(root, 'packages', 'ui');
  mkdirSync(tsPkg, { recursive: true });
  writeFileSync(join(tsPkg, 'package.json'), '{"name":"x"}', 'utf8');
  writeFileSync(join(tsPkg, 'tsconfig.json'), '{}', 'utf8');
  if (withBiomeJson) {
    writeFileSync(join(tsPkg, 'biome.json'), '{"extends":[]}', 'utf8');
  }

  // ── Python 包 ──────────────────────────────────────
  const pyPkg = join(root, 'packages', 'core');
  mkdirSync(join(pyPkg, 'src', 'core_pkg'), { recursive: true });
  writeFileSync(join(pyPkg, 'pyproject.toml'), '[project]\nname="x"\n', 'utf8');
  if (withPyTyped) {
    writeFileSync(join(pyPkg, 'src', 'core_pkg', 'py.typed'), '', 'utf8');
  }

  return root;
}

describe('G26 —— 新建包必需文件齐全', () => {
  it('文件齐全时通过', () => {
    const root = makeRoot();
    expect(guard('G26').run(root)).toEqual([]);
  });

  it('⚠️ TS 包缺 biome.json 时报错', () => {
    /** 缺了 Biome 会退回默认 tab 缩进 —— 与 conventions 冲突。 */
    const root = makeRoot({ withBiomeJson: false });
    const violations = guard('G26').run(root);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('biome.json');
  });

  it('⚠️ Python 包缺 py.typed 时报错', () => {
    /** 缺了下游包 mypy 会报 import-untyped。 */
    const root = makeRoot({ withPyTyped: false });
    const violations = guard('G26').run(root);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('py.typed');
  });

  it('报错信息带上包路径', () => {
    /** 要能定位是哪个包。 */
    const root = makeRoot({ withPyTyped: false });
    const violations = guard('G26').run(root);

    expect(violations[0]).toContain('packages/core');
  });

  it('conventions 目录不算包', () => {
    /** packages/conventions 是模板源 —— 它自己没有 biome.json 是正常的。 */
    const root = mkdtempSync(join(tmpdir(), 'guards-g26-conv-'));
    const conv = join(root, 'packages', 'conventions', 'typescript');
    mkdirSync(conv, { recursive: true });
    writeFileSync(join(conv, 'package.json'), '{"name":"conv"}', 'utf8');

    expect(guard('G26').run(root)).toEqual([]);
  });

  it('空目录不报错', () => {
    const root = mkdtempSync(join(tmpdir(), 'guards-g26-empty-'));
    expect(guard('G26').run(root)).toEqual([]);
  });
});
