/**
 * G6 护栏测试 —— 版本兼容矩阵。
 *
 * ⚠️ **重点验证「版本区间计算」**：
 *     · `0.x` 是通配
 *     · 版本比较
 *     · 矩阵字段检查
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  compareVersions,
  g6,
  isInRange,
  parseCompatibility,
  parseMaxVersion,
  parseVersion,
} from './guards_g6';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-g6-'));
  mkdirSync(join(root, 'packages', 'versions'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 写矩阵文件。 */
function writeMatrix(content: string): void {
  writeFileSync(join(root, 'packages', 'versions', 'compatibility.yaml'), content, 'utf8');
}

describe('parseVersion', () => {
  it('解析 x.y.z', () => {
    expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it('非法版本返回 null', () => {
    expect(parseVersion('0.1')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('按 major → minor → patch 比', () => {
    const a = { major: 1, minor: 2, patch: 3 };
    const b = { major: 1, minor: 2, patch: 4 };

    expect(compareVersions(a, b)).toBe(-1);
    expect(compareVersions(b, a)).toBe(1);
    expect(compareVersions(a, a)).toBe(0);
  });
});

describe('parseMaxVersion', () => {
  it('⚠️ 0.x 是通配 → null（不限）', () => {
    expect(parseMaxVersion('0.x')).toBeNull();
    expect(parseMaxVersion('0.*')).toBeNull();
  });

  it('精确版本', () => {
    expect(parseMaxVersion('0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 });
  });

  it('非法版本', () => {
    expect(parseMaxVersion('abc')).toBe('invalid');
  });
});

describe('isInRange', () => {
  const min = { major: 0, minor: 1, patch: 0 };

  it('低于下界 → 不在范围内', () => {
    expect(isInRange({ major: 0, minor: 0, patch: 9 }, min, null)).toBe(false);
  });

  it('等于下界 → 在范围内', () => {
    expect(isInRange({ major: 0, minor: 1, patch: 0 }, min, null)).toBe(true);
  });

  it('⚠️ 没有上界 → 无限', () => {
    expect(isInRange({ major: 9, minor: 9, patch: 9 }, min, null)).toBe(true);
  });

  it('超过上界 → 不在范围内', () => {
    const max = { major: 0, minor: 2, patch: 0 };

    expect(isInRange({ major: 0, minor: 3, patch: 0 }, min, max)).toBe(false);
    expect(isInRange({ major: 0, minor: 2, patch: 0 }, min, max)).toBe(true);
  });
});

describe('parseCompatibility', () => {
  it('解析多条记录', () => {
    const entries = parseCompatibility(
      [
        'matrix:',
        '  - consumer: web',
        '    provider: slides',
        '    contract: slides/v1',
        '    min_provider_version: 0.1.0',
        '    max_provider_version: 0.x',
        '  - consumer: gateway',
        '    provider: paper',
        '    contract: paper/v1',
        '    min_provider_version: 0.1.0',
        '    max_provider_version: 0.x',
      ].join('\n'),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.consumer).toBe('web');
    expect(entries[1]?.provider).toBe('paper');
  });
});

describe('G6 版本兼容矩阵', () => {
  it('矩阵不存在 → 不算违规', () => {
    expect(g6.run(root)).toEqual([]);
  });

  it('矩阵合法 → 通过', () => {
    writeMatrix(
      [
        'matrix:',
        '  - consumer: web',
        '    provider: slides',
        '    contract: slides/v1',
        '    min_provider_version: 0.1.0',
        '    max_provider_version: 0.x',
      ].join('\n'),
    );

    expect(g6.run(root)).toEqual([]);
  });

  it('⚠️ 缺少字段 → 违规', () => {
    writeMatrix(['matrix:', '  - consumer: web', '    provider: slides'].join('\n'));

    const violations = g6.run(root);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('contract');
  });

  it('⚠️ 版本号非法 → 违规', () => {
    writeMatrix(
      [
        'matrix:',
        '  - consumer: web',
        '    provider: slides',
        '    contract: slides/v1',
        '    min_provider_version: 0.1',
        '    max_provider_version: 0.x',
      ].join('\n'),
    );

    const violations = g6.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('min_provider_version');
  });

  it('⚠️ 契约格式不对 → 违规', () => {
    writeMatrix(
      [
        'matrix:',
        '  - consumer: web',
        '    provider: slides',
        '    contract: slides',
        '    min_provider_version: 0.1.0',
        '    max_provider_version: 0.x',
      ].join('\n'),
    );

    const violations = g6.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('contract');
  });

  it('⚠️ 矩阵为空 → 违规', () => {
    writeMatrix('# 只有注释\n');

    const violations = g6.run(root);

    expect(violations).toHaveLength(1);
  });
});
