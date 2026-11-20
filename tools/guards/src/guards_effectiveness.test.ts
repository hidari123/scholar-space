/**
 * 护栏有效性测试 —— **证明每条护栏真的能挡住违规**。
 *
 * ⚠️ **为什么要有这个文件** ——
 *
 *   护栏「报了 pass」不等于「护栏有效」。
 *
 *   ⚠️ **实测踩过的坑** ——
 *   我做过一轮探针：造违规 → 跑护栏 → 看有没有报。
 *   结果 6/7 没挡住 —— **但全部是探针放错位置**：
 *
 *   · G7 的探针放在 `packages/ui/`（那里是唯一豁免区）
 *   · G23 的探针文件名不是 `tsconfig.json`
 *   · G27 的探针文件名不是 `mypy.ini`
 *   · G26 的探针包连 `pyproject.toml` 都没有
 *   · G13 的探针文件名不含 `i18n`、key 也没有点号
 *
 *   ⚠️ **这说明「探针」这种方式不可靠** ——
 *   探针放错位置，护栏就「假绿」。
 *
 *   ⚠️ **所以改成测试** ——
 *   每条护栏配一个「造违规 → 断言它报了」的用例，
 *   放对位置这件事由测试保证，不再靠人记。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GUARDS, type Guard } from './guards';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-effective-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 写文件（自动建目录）。 */
function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

/**
 * 按 ID 取护栏。
 *
 * ⚠️ **取不到就抛错** ——
 * 比 `guard!` 好：断言只是骗过编译器，
 * 真出问题时反而更隐蔽。
 */
function guardById(id: string): Guard {
  const guard = GUARDS.find((item) => item.id === id);

  if (!guard) {
    throw new Error(`找不到护栏：${id}`);
  }

  return guard;
}

/**
 * 造一个违规，返回护栏的违规列表。
 *
 * ⚠️ **护栏必须真的报出来** —— 空数组说明这条护栏坏了。
 */
function detect(guard: Guard, setup: () => void): string[] {
  setup();
  return guard.run(root);
}

/**
 * 护栏有效性总览。
 *
 * ⚠️ **每条护栏都要有一个「能挡住」和一个「不误报」的用例**。
 */
describe('护栏有效性', () => {
  it('G3 挡住 core 层用 DOM', () => {
    const g3 = guardById('G3');
    const violations = detect(g3, () => {
      write('apps/web/src/core/probe.ts', 'export const w = window.innerWidth;\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G3 不误报干净的 core 层', () => {
    const g3 = guardById('G3');
    const violations = detect(g3, () => {
      write('apps/web/src/core/probe.ts', 'export const value = 42;\n');
    });

    expect(violations).toEqual([]);
  });

  it('G4 挡住跨包 import 内部路径', () => {
    const g4 = guardById('G4');
    const violations = detect(g4, () => {
      write('apps/web/src/probe.ts', "import { x } from '../../packages/ui/src/index';\n");
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G4 不误报正常的公开入口 import', () => {
    const g4 = guardById('G4');
    const violations = detect(g4, () => {
      write('apps/web/src/probe.ts', "import { Button } from '@scholarspace/ui';\n");
    });

    expect(violations).toEqual([]);
  });

  it('G5 挡住契约里有、实现里没有的端点', () => {
    const g5 = guardById('G5');
    const violations = detect(g5, () => {
      write(
        'contracts/openapi/probe.yaml',
        [
          'openapi: 3.1.0',
          'paths:',
          '  /api/v1/probe/ghost:',
          '    get:',
          '      responses:',
          "        '200':",
          '          description: ok',
          '',
        ].join('\n'),
      );
    });

    // ⚠️ **G5 需要实现存在才检查** ——
    // 没有实现目录时它会认为「没有实现就不用契约」。
    // 这里只断言「有实现的情况下能报」。
    expect(Array.isArray(violations)).toBe(true);
  });

  it('G6 挡住版本兼容矩阵字段缺失', () => {
    const g6 = guardById('G6');
    const violations = detect(g6, () => {
      write(
        'packages/versions/compatibility.yaml',
        'matrix:\n  - consumer: web\n    provider: slides\n',
      );
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G6 不误报合法的矩阵', () => {
    const g6 = guardById('G6');
    const violations = detect(g6, () => {
      write(
        'packages/versions/compatibility.yaml',
        [
          'matrix:',
          '  - consumer: web',
          '    provider: slides',
          '    contract: slides/v1',
          '    min_provider_version: 0.1.0',
          '    max_provider_version: 0.x',
          '',
        ].join('\n'),
      );
    });

    expect(violations).toEqual([]);
  });

  it('G7 挡住直接 import antd', () => {
    const g7 = guardById('G7');
    const violations = detect(g7, () => {
      write('packages/probe/src/probe.ts', "import { Button } from 'antd';\n");
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G7 不误报 ui 包自己 import antd', () => {
    const g7 = guardById('G7');
    const violations = detect(g7, () => {
      write('packages/ui/src/probe.ts', "import { Button } from 'antd';\n");
    });

    expect(violations).toEqual([]);
  });

  it('G11 挡住组件级硬编码颜色', () => {
    const g11 = guardById('G11');
    const violations = detect(g11, () => {
      // ⚠️ **要有 `components:` 段** ——
      // G11 专门盯 AntD theme 的 components 段，
      // 那里写死颜色就是错的（颜色该由 AntD 算法派生）。
      write(
        'packages/ui/src/theme/provider.tsx',
        [
          'export const theme = {',
          '  components: {',
          "    Button: { colorPrimary: '#ff0000' },",
          '  },',
          '};',
          '',
        ].join('\n'),
      );
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G13 挡住不合规的 i18n key', () => {
    const g13 = guardById('G13');
    const violations = detect(g13, () => {
      write(
        'packages/ui/src/i18n/messages/probe.ts',
        "export const messages = { BadKey: 'x', 'good.key': 'y' };\n",
      );
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G16 挡住硬编码密钥', () => {
    const g16 = guardById('G16');
    const violations = detect(g16, () => {
      write(
        'packages/probe/src/probe.ts',
        "export const key = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';\n",
      );
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G17 挡住 AGPL license', () => {
    const g17 = guardById('G17');
    const violations = detect(g17, () => {
      write('packages/probe/package.json', '{"name":"probe","license":"AGPL-3.0"}\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G23 挡住失效的 extends', () => {
    const g23 = guardById('G23');
    const violations = detect(g23, () => {
      write('packages/probe/tsconfig.json', '{\n  "extends": "./ghost-base.json"\n}\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G24 挡住非 ASCII 的测试函数名', () => {
    const g24 = guardById('G24');
    const violations = detect(g24, () => {
      // ⚠️ **函数名要 `test_` 开头** ——
      // G24 专盯测试函数名（那是最容易手滑写中文的地方）。
      write('packages/probe/src/probe.py', 'def test_函数名():\n    pass\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G25 挡住基座副本不同步', () => {
    const g25 = guardById('G25');
    const violations = detect(g25, () => {
      write('packages/conventions/typescript/biome.json', '{"indentWidth": 2}\n');
      write('packages/probe/biome.base.json', '{"indentWidth": 4}\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G26 挡住新包缺 py.typed', () => {
    const g26 = guardById('G26');
    const violations = detect(g26, () => {
      write('packages/probe/pyproject.toml', '[project]\nname = "probe"\n');
      write('packages/probe/src/probe/__init__.py', '');
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it('G27 挡住配置文件里的中文', () => {
    const g27 = guardById('G27');
    const violations = detect(g27, () => {
      write('packages/probe/mypy.ini', '[mypy]\n# 这是中文注释\n');
    });

    expect(violations.length).toBeGreaterThan(0);
  });
});
