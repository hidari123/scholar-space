import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, TEMPLATES } from './cli';
import { PYTHON_SYNC_ITEMS, TYPESCRIPT_SYNC_ITEMS } from './sync';
import { render, toPascalCase, toSnakeCase } from './templates';
import { pythonServiceTemplate } from './templates/python-service';
import { tsPackageTemplate } from './templates/ts-package';

describe('parseArgs', () => {
  it('解析命令与位置参数', () => {
    const result = parseArgs(['new', 'my-service']);
    expect(result.command).toBe('new');
    expect(result.positional).toEqual(['my-service']);
  });

  it('解析字符串标志', () => {
    const result = parseArgs(['new', 'x', '--template', 'python-service']);
    expect(result.flags.template).toBe('python-service');
  });

  it('解析布尔标志', () => {
    const result = parseArgs(['check', '--strict']);
    expect(result.flags.strict).toBe(true);
  });

  it('默认命令是 help', () => {
    expect(parseArgs([]).command).toBe('help');
  });
});

describe('name conversions', () => {
  it('kebab → snake', () => {
    expect(toSnakeCase('my-service')).toBe('my_service');
  });

  it('kebab → Pascal', () => {
    expect(toPascalCase('my-service')).toBe('MyService');
  });
});

describe('render', () => {
  it('替换占位符', () => {
    const result = render('name={{name}} pkg={{packageName}}', {
      name: 'demo',
      packageName: 'demo_pkg',
    });
    expect(result).toBe('name=demo pkg=demo_pkg');
  });

  it('未知占位符原样保留', () => {
    expect(render('{{unknown}}', { name: 'x' })).toBe('{{unknown}}');
  });

  it('packageName 默认由 name 推导', () => {
    expect(render('{{packageName}}', { name: 'my-svc' })).toBe('my_svc');
  });
});

describe('templates', () => {
  it('两个模板都已注册', () => {
    expect(TEMPLATES['python-service']).toBeDefined();
    expect(TEMPLATES['ts-package']).toBeDefined();
  });

  it('python 模板覆盖四层结构', () => {
    const paths = pythonServiceTemplate.files.map((file) => file.path);
    expect(paths.some((path) => path.includes('domain/'))).toBe(true);
    expect(paths.some((path) => path.includes('application/'))).toBe(true);
    expect(paths.some((path) => path.includes('infrastructure/'))).toBe(true);
    expect(paths.some((path) => path.includes('interfaces/'))).toBe(true);
  });

  it('python 模板含 import-linter 契约', () => {
    const setupCfg = pythonServiceTemplate.files.find((file) => file.path === 'setup.cfg');
    expect(setupCfg?.content).toContain('G1 layers');
    expect(setupCfg?.content).toContain('G2 domain layer has zero external dependencies');
  });

  it('python 模板的 pyproject 指向本地同步副本', () => {
    const pyproject = pythonServiceTemplate.files.find((file) => file.path === 'pyproject.toml');
    // ⚠️ 必须指向本地副本 —— 子仓 CI 独立 checkout 时主仓路径不存在
    expect(pyproject?.content).toContain('extend = "./ruff.toml"');
    expect(pyproject?.content).not.toContain('../../packages/conventions');
  });

  it('python 同步清单包含 ruff.toml 与 mypy.ini', () => {
    const destinations = PYTHON_SYNC_ITEMS.map((item) => item.destination);
    expect(destinations).toContain('ruff.toml');
    expect(destinations).toContain('mypy.ini');
  });

  it('typescript 同步清单包含两个 base 文件', () => {
    const destinations = TYPESCRIPT_SYNC_ITEMS.map((item) => item.destination);
    expect(destinations).toContain('tsconfig.base.json');
    expect(destinations).toContain('biome.base.json');
  });

  it('ts 模板的 tsconfig 指向本地副本', () => {
    const tsconfig = tsPackageTemplate.files.find((file) => file.path === 'tsconfig.json');
    expect(tsconfig?.content).toContain('"./tsconfig.base.json"');
  });

  it('ts 模板的 biome 指向本地副本', () => {
    const biome = tsPackageTemplate.files.find((file) => file.path === 'biome.json');
    expect(biome?.content).toContain('"./biome.base.json"');
  });

  it('ts 模板不含 antd 直接依赖', () => {
    const manifest = tsPackageTemplate.files.find((file) => file.path === 'package.json');
    expect(manifest?.content).toContain('@scholarspace/ui');
    expect(manifest?.content).not.toContain('"antd"');
  });

  it('ts 模板含 publishConfig', () => {
    const manifest = tsPackageTemplate.files.find((file) => file.path === 'package.json');
    expect(manifest?.content).toContain('npm.pkg.github.com');
    expect(manifest?.content).toContain('restricted');
  });

  it('模板都有验证命令', () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.verifyCommands.length).toBeGreaterThan(0);
    }
  });

  it('模板文件路径的占位符可被正确渲染', () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const file of template.files) {
        // 路径里的占位符必须在渲染后消失
        const rendered = render(file.path, {
          name: 'demo-svc',
          packageName: 'demo_svc',
          scopeName: '@scholarspace/demo-svc',
        });
        expect(rendered).not.toContain('{{');
        expect(rendered).not.toContain('}}');
      }
    }
  });

  it('模板文件内容的占位符可被正确渲染', () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const file of template.files) {
        const rendered = render(file.content, {
          name: 'demo-svc',
          packageName: 'demo_svc',
          scopeName: '@scholarspace/demo-svc',
        });
        expect(rendered).not.toContain('{{');
      }
    }
  });
});

describe('template file integrity', () => {
  it('python 模板的 py.typed 是空文件', () => {
    const pyTyped = pythonServiceTemplate.files.find((file) => file.path.includes('py.typed'));
    expect(pyTyped).toBeDefined();
    expect(pyTyped?.content).toBe('');
  });

  it('生成的项目 README 含同步说明引用', () => {
    const readme = pythonServiceTemplate.files.find((file) => file.path === 'README.md');
    expect(readme?.content).toContain('SYNC.md');
  });

  it('测试文件用英文函数名', () => {
    const test = pythonServiceTemplate.files.find((file) => file.path.includes('test_'));
    expect(test?.content).toContain('def test_save_returns_id');
    expect(test?.content).not.toMatch(/def test_[^\n]*[\u4e00-\u9fff]/);
  });
});

describe('temp dir sanity', () => {
  it('能创建临时目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    expect(existsSync(dir)).toBe(true);
  });
});
