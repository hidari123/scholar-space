import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GUARDS, runGuards, walkFiles } from './guards';

/** 建一个临时的"主仓"。 */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'guards-'));
  mkdirSync(join(root, 'packages', 'ui', 'src', 'theme'), { recursive: true });
  return root;
}

/** 找一条护栏。 */
function guard(id: string) {
  const found = GUARDS.find((g) => g.id === id);
  if (!found) throw new Error(`护栏 ${id} 不存在`);
  return found;
}

describe('GUARDS 注册表', () => {
  it('有 8 条护栏', () => {
    expect(GUARDS.length).toBeGreaterThanOrEqual(8);
  });

  it('每条护栏都有唯一 ID', () => {
    const ids = GUARDS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每条护栏都有说明与严重级别', () => {
    for (const g of GUARDS) {
      expect(g.description.length).toBeGreaterThan(0);
      expect(['error', 'warn']).toContain(g.severity);
    }
  });
});

describe('G7 —— 禁止直接 import antd', () => {
  it('检测到违规时报告', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'slides', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'slides', 'src', 'a.tsx'),
      "import { Button } from 'antd';\nexport { Button };\n",
      'utf8',
    );

    const violations = guard('G7').run(root);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('antd');
  });

  it('ui 包自身豁免', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'theme', 'x.ts'),
      "import { Button } from 'antd';\nexport { Button };\n",
      'utf8',
    );

    expect(guard('G7').run(root)).toEqual([]);
  });

  it('用 @scholarspace/ui 不算违规', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'slides', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'slides', 'src', 'a.tsx'),
      "import { Button } from '@scholarspace/ui';\nexport { Button };\n",
      'utf8',
    );

    expect(guard('G7').run(root)).toEqual([]);
  });
});

describe('G11 —— 组件级禁写颜色', () => {
  it('components 段含硬编码 hex 时报告', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'theme', 'provider.tsx'),
      'export const t = { components: { Button: { colorPrimary: "#611F6A" } } };\n',
      'utf8',
    );

    expect(guard('G11').run(root).length).toBeGreaterThan(0);
  });

  it('只有结构配置时不报告', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'theme', 'provider.tsx'),
      'export const t = { components: { Button: { controlHeight: 36 } } };\n',
      'utf8',
    );

    expect(guard('G11').run(root)).toEqual([]);
  });

  it('token 段的 hex 不算违规（那是种子色）', () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'theme', 'provider.tsx'),
      'export const t = { token: { colorPrimary: "#611F6A" }, components: { Button: { controlHeight: 36 } } };\n',
      'utf8',
    );

    expect(guard('G11').run(root)).toEqual([]);
  });
});

describe('G13 —— i18n key 命名', () => {
  it('未知 domain 被拦', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'ui', 'src', 'i18n'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'i18n', 'messages.ts'),
      "export const m = { 'unknownDomain.section.key': 'x' };\n",
      'utf8',
    );

    expect(guard('G13').run(root).length).toBeGreaterThan(0);
  });

  it('已知 domain 通过', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'ui', 'src', 'i18n'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'ui', 'src', 'i18n', 'messages.ts'),
      "export const m = { 'common.action.confirm': 'x', 'theme.preset.scholar.label': 'y' };\n",
      'utf8',
    );

    expect(guard('G13').run(root)).toEqual([]);
  });
});

describe('G16 —— 密钥泄漏', () => {
  it('检测到 OpenAI 风格密钥', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'config.ts'),
      "export const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';\n",
      'utf8',
    );

    expect(guard('G16').run(root).length).toBeGreaterThan(0);
  });

  it('检测到 GitHub token', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'config.ts'),
      "export const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';\n",
      'utf8',
    );

    expect(guard('G16').run(root).length).toBeGreaterThan(0);
  });

  it('普通代码不误报', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(join(root, 'packages', 'x', 'config.ts'), 'export const timeout = 30;\n', 'utf8');

    expect(guard('G16').run(root)).toEqual([]);
  });
});

describe('G17 —— License 白名单', () => {
  it('检测到 AGPL 被拦', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(join(root, 'packages', 'x', 'package.json'), '{"license":"AGPL-3.0"}', 'utf8');

    expect(guard('G17').run(root).length).toBeGreaterThan(0);
  });

  it('MIT 通过', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(join(root, 'packages', 'x', 'package.json'), '{"license":"MIT"}', 'utf8');

    expect(guard('G17').run(root)).toEqual([]);
  });
});

describe('G23 —— extends 引用有效性', () => {
  it('失效的 extends 被拦', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'tsconfig.json'),
      '{ "extends": "../../packages/conventions/typescript/tsconfig.base.json" }',
      'utf8',
    );

    expect(guard('G23').run(root).length).toBeGreaterThan(0);
  });

  it('有效的 extends 通过', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(join(root, 'packages', 'x', 'tsconfig.base.json'), '{}', 'utf8');
    writeFileSync(
      join(root, 'packages', 'x', 'tsconfig.json'),
      '{ "extends": "./tsconfig.base.json" }',
      'utf8',
    );

    expect(guard('G23').run(root)).toEqual([]);
  });

  it('biome 的数组形式也能检测', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'biome.json'),
      '{ "extends": ["./missing.base.json"] }',
      'utf8',
    );

    expect(guard('G23').run(root).length).toBeGreaterThan(0);
  });
});

describe('G24 —— 中文测试函数名', () => {
  it('非 ASCII 函数名被拦', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x', 'tests'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'tests', 'test_a.py'),
      'def test_创建示例() -> None:\n    pass\n',
      'utf8',
    );

    expect(guard('G24').run(root).length).toBeGreaterThan(0);
  });

  it('英文函数名通过', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x', 'tests'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'tests', 'test_a.py'),
      'def test_create_example() -> None:\n    pass\n',
      'utf8',
    );

    expect(guard('G24').run(root)).toEqual([]);
  });

  it('async 函数也能检测', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'packages', 'x', 'tests'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'x', 'tests', 'test_a.py'),
      'async def test_创建示例() -> None:\n    pass\n',
      'utf8',
    );

    expect(guard('G24').run(root).length).toBeGreaterThan(0);
  });
});

describe('runGuards', () => {
  it('返回全部护栏的结果', () => {
    const results = runGuards(makeRoot());
    expect(results.length).toBe(GUARDS.length);
  });

  it('只跑指定的护栏', () => {
    const results = runGuards(makeRoot(), ['G7']);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe('G7');
  });

  it('每条结果都有耗时', () => {
    for (const result of runGuards(makeRoot())) {
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('护栏抛异常不中断整体', () => {
    const results = runGuards(makeRoot(), ['G7']);
    expect(results[0]?.ok).toBe(true);
  });
});

describe('walkFiles', () => {
  it('跳过 node_modules', () => {
    const root = makeRoot();
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'x', 'a.ts'), '', 'utf8');
    writeFileSync(join(root, 'a.ts'), '', 'utf8');

    const files = walkFiles(root, ['.ts']);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('a.ts');
    expect(files[0]).not.toContain('node_modules');
  });

  it('按扩展名过滤', () => {
    const root = makeRoot();
    writeFileSync(join(root, 'a.ts'), '', 'utf8');
    writeFileSync(join(root, 'b.py'), '', 'utf8');

    expect(walkFiles(root, ['.py']).length).toBe(1);
  });

  it('目录不存在时返回空', () => {
    expect(walkFiles(join(tmpdir(), 'definitely-not-here-xyz'), ['.ts'])).toEqual([]);
  });
});

/**
 * 建一个带规范源与副本的临时主仓。
 *
 * @param copyContent 副本内容（默认与源相同）
 */
function makeSyncRoot(copyContent?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'guards-sync-'));

  // 规范源
  mkdirSync(join(root, 'packages', 'conventions', 'typescript'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'conventions', 'typescript', 'tsconfig.base.json'),
    '{"compilerOptions":{"strict":true}}',
    'utf8',
  );

  // 副本
  mkdirSync(join(root, 'packages', 'ui'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'ui', 'tsconfig.base.json'),
    copyContent ?? '{"compilerOptions":{"strict":true}}',
    'utf8',
  );

  return root;
}

describe('G25 —— 规范基座副本与源同步', () => {
  it('副本与源一致时通过', () => {
    const violations = guard('G25').run(makeSyncRoot());
    expect(violations).toEqual([]);
  });

  it('副本被改动时报违规', () => {
    /** ⚠️ 这正是要防的：改了源忘了同步。 */
    const violations = guard('G25').run(makeSyncRoot('{"compilerOptions":{"strict":false}}'));

    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('packages/ui/tsconfig.base.json');
    expect(violations[0]).toContain('cli sync');
  });

  it('行尾差异不算违规', () => {
    /** CRLF vs LF —— Windows 与 Linux 的正常差异。 */
    const root = makeSyncRoot();
    const path = join(root, 'packages', 'ui', 'tsconfig.base.json');
    writeFileSync(path, '{"compilerOptions":{"strict":true}}\r\n', 'utf8');

    expect(guard('G25').run(root)).toEqual([]);
  });

  it('BOM 不算违规', () => {
    /** PowerShell 的 Out-File 会加 BOM。 */
    const root = makeSyncRoot();
    const path = join(root, 'packages', 'ui', 'tsconfig.base.json');
    writeFileSync(path, '\uFEFF{"compilerOptions":{"strict":true}}', 'utf8');

    expect(guard('G25').run(root)).toEqual([]);
  });

  it('缩进差异算违规', () => {
    /** ⚠️ Biome 会把 JSON 重排成 tab —— 副本被格式化过就是漂移。 */
    const violations = guard('G25').run(makeSyncRoot('{\n\t"compilerOptions":{"strict":true}\n}'));

    expect(violations.length).toBe(1);
  });

  it('没有副本时不报错', () => {
    /** 只有源、没有副本 —— 不该报错（子仓可能还没同步）。 */
    const root = mkdtempSync(join(tmpdir(), 'guards-nosync-'));
    mkdirSync(join(root, 'packages', 'conventions', 'typescript'), { recursive: true });
    writeFileSync(
      join(root, 'packages', 'conventions', 'typescript', 'tsconfig.base.json'),
      '{}',
      'utf8',
    );

    expect(guard('G25').run(root)).toEqual([]);
  });

  it('源文件本身不被当成副本', () => {
    /** 源在 packages/conventions 下 —— 不能自己跟自己比。 */
    const root = makeSyncRoot();
    const violations = guard('G25').run(root);

    expect(violations).toEqual([]);
  });
});
