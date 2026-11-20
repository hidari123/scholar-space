/**
 * G3 / G4 护栏测试。
 *
 * ⚠️ **重点验证「能抓到违规」** ——
 *     护栏一旦没效果，比没有护栏更危险
 *     （人会以为有保护）。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractImports, g3, g4 } from './guards_g3_g4';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'guard-g34-'));
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

describe('extractImports', () => {
  it('提取普通 import', () => {
    const imports = extractImports("import { Button } from '@scholarspace/ui';");

    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe('@scholarspace/ui');
  });

  it('提取 type import', () => {
    const imports = extractImports("import type { Foo } from './foo';");

    expect(imports).toHaveLength(1);
  });

  it('提取多行 import', () => {
    const imports = extractImports(['import {', '  a,', '  b,', "} from './multi';"].join('\n'));

    expect(imports).toHaveLength(1);
    expect(imports[0]?.module).toBe('./multi');
  });

  it('提取 export ... from', () => {
    const imports = extractImports("export { x } from './x';");

    expect(imports).toHaveLength(1);
  });

  it('记录行号', () => {
    const imports = extractImports(['// 注释', "import { a } from './a';"].join('\n'));

    expect(imports[0]?.line).toBe(2);
  });
});

describe('G3 TS 目录边界', () => {
  it('core 层干净时通过', () => {
    write('apps/web/src/core/thing.ts', 'export const value = 42;\n');

    expect(g3.run(root)).toEqual([]);
  });

  it('⚠️ core 层 import UI 包 → 违规', () => {
    write('apps/web/src/core/thing.ts', "import { Button } from '@scholarspace/ui';\n");

    const violations = g3.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('@scholarspace/ui');
  });

  it('⚠️ core 层 import React → 违规', () => {
    write('apps/web/src/core/thing.ts', "import { useState } from 'react';\n");

    expect(g3.run(root)).toHaveLength(1);
  });

  it('⚠️ core 层用 window → 违规', () => {
    write('apps/web/src/core/thing.ts', 'export const w = window.innerWidth;\n');

    const violations = g3.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('window');
  });

  it('⚠️ core 层用 localStorage → 违规', () => {
    write('apps/web/src/core/thing.ts', "localStorage.setItem('a', 'b');\n");

    expect(g3.run(root)).toHaveLength(1);
  });

  it('⚠️ 注释里提到 window 不算违规', () => {
    write(
      'apps/web/src/core/thing.ts',
      ['/**', ' * ⚠️ core 层不能用 window', ' */', 'export const v = 1;'].join('\n'),
    );

    expect(g3.run(root)).toEqual([]);
  });

  it('⚠️ myWindow 不算 window（词边界）', () => {
    write('apps/web/src/core/thing.ts', 'export const myWindow = 1;\n');

    expect(g3.run(root)).toEqual([]);
  });

  it('⚠️ core 层 import 上层目录 → 违规', () => {
    write('apps/web/src/core/thing.ts', "import { Button } from '../components/Button';\n");

    expect(g3.run(root)).toHaveLength(1);
  });

  it('components 层用 React 不违规', () => {
    write('apps/web/src/components/Button.tsx', "import { useState } from 'react';\n");

    expect(g3.run(root)).toEqual([]);
  });
});

describe('G4 跨包只走公开 API', () => {
  it('正常 import 通过', () => {
    write('apps/web/src/app/thing.ts', "import { Button } from '@scholarspace/ui';\n");

    expect(g4.run(root)).toEqual([]);
  });

  it('⚠️ import 别的包的 src → 违规', () => {
    write('apps/web/src/app/thing.ts', "import { x } from '../../packages/core/src/internal';\n");

    const violations = g4.run(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('src');
  });

  it('⚠️ import 别的包的 dist/internal → 违规', () => {
    write(
      'apps/web/src/app/thing.ts',
      "import { x } from '../../packages/core/dist/internal/thing';\n",
    );

    expect(g4.run(root)).toHaveLength(1);
  });

  it('node_modules 里的不违规（不是业务代码）', () => {
    write(
      'apps/web/node_modules/@scholarspace/core/src/thing.ts',
      "import { x } from './other';\n",
    );

    expect(g4.run(root)).toEqual([]);
  });
});
