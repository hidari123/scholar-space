/**
 * G5 护栏测试 —— 契约一致性。
 *
 * ⚠️ **重点验证「双向检查」**：
 *   ① 契约里有、实现里没有 → 违规
 *   ② 实现里有、契约里没有 → 违规
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { g5, setServiceImpls } from './guards_g5';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-g5-'));
  mkdirSync(join(root, 'contracts', 'openapi'), { recursive: true });

  // ⚠️ **注入假的服务列表** ——
  // 真实列表指向独立仓（不在这个临时目录里），
  // 测试要用自己的目录。
  setServiceImpls({
    'packages/services/auth': 'auth',
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 写一个契约文件。 */
function writeContract(service: string, paths: string[]): void {
  const content = [
    'openapi: 3.1.0',
    'info:',
    '  title: Test',
    '  version: 1.0.0',
    'paths:',
    ...paths.map((path) => `  ${path}:`),
    '    get:',
    '      responses:',
    "        '200':",
    '          description: ok',
    '',
  ].join('\n');

  writeFileSync(join(root, 'contracts', 'openapi', `${service}.yaml`), content);
}

/** 写一个实现文件。 */
function writeImpl(service: string, routes: string[]): void {
  const dir = join(root, 'packages', 'services', service);
  mkdirSync(dir, { recursive: true });

  const content = [
    'from fastapi import APIRouter',
    '',
    "router = APIRouter(prefix='/api/v1/test')",
    '',
    // ⚠️ **路由路径是相对的** —— prefix 由 router 提供
    //    （跟真实代码一致）
    ...routes.map((route) => `@router.get("${route.replace('/api/v1/test', '')}")`),
    'async def handler():',
    '    return {}',
    '',
  ].join('\n');

  writeFileSync(join(dir, 'routes.py'), content);
}

describe('G5 契约一致性', () => {
  it('实现和契约一致时通过', () => {
    writeContract('auth', ['/api/v1/test/users']);
    writeImpl('auth', ['/api/v1/test/users']);

    expect(g5.run(root)).toEqual([]);
  });

  it('契约里有、实现里没有 → 违规', () => {
    writeContract('auth', ['/api/v1/test/users', '/api/v1/test/ghost']);
    writeImpl('auth', ['/api/v1/test/users']);

    const violations = g5.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('/api/v1/test/ghost');
  });

  it('实现里有、契约里没有 → 违规', () => {
    writeContract('auth', ['/api/v1/test/users']);
    writeImpl('auth', ['/api/v1/test/users', '/api/v1/test/extra']);

    const violations = g5.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('/api/v1/test/extra');
  });

  it('有实现但没契约 → 违规', () => {
    writeImpl('auth', ['/api/v1/test/users']);

    const violations = g5.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('没有契约');
  });

  it('没有实现也没有契约 → 不算违规', () => {
    expect(g5.run(root)).toEqual([]);
  });

  it('契约目录不存在 → 报明确的错', () => {
    rmSync(join(root, 'contracts'), { recursive: true });

    const violations = g5.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('契约目录不存在');
  });

  it('识别多种 HTTP 方法', () => {
    const dir = join(root, 'packages', 'services', 'auth');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'routes.py'),
      [
        '@router.get("/a")',
        '@router.post("/b")',
        '@router.put("/c")',
        '@router.delete("/d")',
        'async def handler():',
        '    pass',
        '',
      ].join('\n'),
    );

    writeContract('auth', ['/a', '/b', '/c', '/d']);

    expect(g5.run(root)).toEqual([]);
  });

  it('跳过 __pycache__ 里的文件', () => {
    const dir = join(root, 'packages', 'services', 'auth');
    mkdirSync(join(dir, '__pycache__'), { recursive: true });

    // ⚠️ **缓存里的假路由** —— 不该被算进去
    writeFileSync(join(dir, '__pycache__', 'fake.pyc.py'), '@router.get("/api/v1/test/fake")\n');

    writeImpl('auth', ['/api/v1/test/real']);
    writeContract('auth', ['/api/v1/test/real']);

    expect(g5.run(root)).toEqual([]);
  });

  it('⚠️ components 里的 schema 键不被当成 path', () => {
    // ⚠️ **这是实测发现的坑** ——
    // 往契约的 `components:` 后面加一个 `/xxx:`，
    // 解析器不应该把它当成 path
    //（否则「契约里有、实现里没有」这个方向的检查会漏）。
    const content = [
      'openapi: 3.1.0',
      'paths:',
      '  /api/v1/test/real:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: ok',
      'components:',
      '  schemas:',
      '    /api/v1/test/not-a-path:',
      '      type: object',
      '',
    ].join('\n');

    writeFileSync(join(root, 'contracts', 'openapi', 'auth.yaml'), content);
    writeImpl('auth', ['/api/v1/test/real']);

    // ⚠️ **不该报违规** —— `/not-a-path` 不是契约里的端点
    expect(g5.run(root)).toEqual([]);
  });

  it('⚠️ paths 里多一个端点 → 违规（真实场景）', () => {
    const content = [
      'openapi: 3.1.0',
      'paths:',
      '  /api/v1/test/real:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: ok',
      '  /api/v1/test/ghost:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: ok',
      '',
    ].join('\n');

    writeFileSync(join(root, 'contracts', 'openapi', 'auth.yaml'), content);
    writeImpl('auth', ['/api/v1/test/real']);

    const violations = g5.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('/api/v1/test/ghost');
  });
});
