/**
 * G28 护栏测试 —— Python 四层架构边界。
 *
 * ⚠️ **重点验证「四种违规都能抓到」**：
 *     ① domain 层 import 外部依赖
 *     ② application 层 import infrastructure
 *     ③ interfaces 层 import infrastructure
 *     ④ domain 层 import application（单向依赖）
 *
 * ⚠️ **还要验证「干净的不误报」** ——
 *     护栏太敏感同样是有害的。
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkPythonLayers, findPython, layerOf } from './guards_py_layers';

let root: string;
let python: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-g28-'));

  const found = findPython(root);
  if (!found) {
    throw new Error('找不到 Python —— G28 测试无法运行');
  }
  python = found;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 写文件（自动建目录）。 */
function write(relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

/** 检查一个探针包。 */
function check(packageRel: string): string[] {
  return checkPythonLayers(join(root, packageRel), python, root);
}

describe('G28 Python 四层架构边界', () => {
  it('① 挡住 domain 层 import 外部依赖', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/domain/__init__.py', '');
    write('pkg/src/probe/domain/thing.py', 'import fastapi\n\n\ndef f():\n    pass\n');

    const violations = check('pkg/src/probe');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('fastapi');
  });

  it('② 挡住 application 层 import infrastructure', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/application/__init__.py', '');
    write(
      'pkg/src/probe/application/svc.py',
      'from probe.infrastructure.db import Repo\n\n\ndef f():\n    pass\n',
    );

    const violations = check('pkg/src/probe');

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('infrastructure');
  });

  it('③ 挡住 interfaces 层 import infrastructure', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/interfaces/__init__.py', '');
    write(
      'pkg/src/probe/interfaces/http.py',
      'from probe.infrastructure.db import Repo\n\n\ndef f():\n    pass\n',
    );

    const violations = check('pkg/src/probe');

    expect(violations.length).toBeGreaterThan(0);
  });

  it('④ 挡住 domain 层 import application', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/domain/__init__.py', '');
    write(
      'pkg/src/probe/domain/thing.py',
      'from probe.application.svc import Svc\n\n\ndef f():\n    pass\n',
    );

    const violations = check('pkg/src/probe');

    expect(violations.length).toBeGreaterThan(0);
  });

  it('不误报干净的四层结构', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/domain/__init__.py', '');
    write('pkg/src/probe/domain/thing.py', 'def f():\n    pass\n');
    write('pkg/src/probe/application/__init__.py', '');
    write(
      'pkg/src/probe/application/svc.py',
      'from probe.domain.thing import f\n\n\ndef g():\n    pass\n',
    );

    expect(check('pkg/src/probe')).toEqual([]);
  });

  it('不误报 application 层 import domain（合法方向）', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/domain/__init__.py', '');
    write('pkg/src/probe/domain/thing.py', 'def f():\n    pass\n');
    write('pkg/src/probe/application/__init__.py', '');
    write(
      'pkg/src/probe/application/svc.py',
      'from probe.domain.thing import f\n\n\ndef g():\n    pass\n',
    );

    expect(check('pkg/src/probe')).toEqual([]);
  });

  it('不误报别的包的 import', () => {
    write('pkg/src/probe/__init__.py', '');
    write('pkg/src/probe/domain/__init__.py', '');
    // ⚠️ **跨包引用不算违反本包的架构** ——
    // 跨包约束是另一条规则（护栏 G4 那类）。
    write('pkg/src/probe/domain/thing.py', 'from other_pkg.infrastructure.db import Repo\n');

    expect(check('pkg/src/probe')).toEqual([]);
  });

  it('⚠️ 真实的 auth 包不再有违规', () => {
    // ⚠️ **这条断言防止回归** ——
    // auth 的 admin 路由曾直接 import infrastructure.memory。
    const authPkg = join(root, '..', '..', '..', 'scholarspace', 'packages', 'services', 'auth');
    if (!existsSync(authPkg)) return;

    const violations = checkPythonLayers(join(authPkg, 'src', 'scholar_auth'), python, authPkg);

    expect(violations).toEqual([]);
  });
});

describe('layerOf', () => {
  it('按路径段判断层', () => {
    expect(layerOf('/pkg/src/probe/domain/thing.py', '/pkg/src/probe')).toBe('domain');
    expect(layerOf('/pkg/src/probe/application/svc.py', '/pkg/src/probe')).toBe('application');
    expect(layerOf('/pkg/src/probe/interfaces/http.py', '/pkg/src/probe')).toBe('interfaces');
  });

  it('⚠️ 不是层目录返回 null', () => {
    expect(layerOf('/pkg/src/probe/utils.py', '/pkg/src/probe')).toBeNull();
  });

  it('⚠️ `my_domain_utils.py` 不算 domain 层', () => {
    expect(layerOf('/pkg/src/probe/my_domain_utils.py', '/pkg/src/probe')).toBeNull();
  });
});
