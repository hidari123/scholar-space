import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractCommands, readPluginManifest } from './plugin';

/** 建一个带插件声明的包。 */
function makePluginPackage(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return dir;
}

describe('readPluginManifest', () => {
  it('读取 scholarspace.commands 声明', () => {
    const dir = makePluginPackage({
      name: '@scholarspace/slides',
      scholarspace: { commands: './src/cli-commands.js' },
    });

    const manifest = readPluginManifest(dir);
    expect(manifest?.scholarspace?.commands).toBe('./src/cli-commands.js');
  });

  it('没有声明时返回 null', () => {
    const dir = makePluginPackage({ name: '@scholarspace/plain' });
    expect(readPluginManifest(dir)?.scholarspace).toBeUndefined();
  });

  it('package.json 不存在时返回 null', () => {
    expect(readPluginManifest(join(tmpdir(), 'definitely-not-here-xyz'))).toBeNull();
  });

  it('package.json 损坏时返回 null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-broken-'));
    writeFileSync(join(dir, 'package.json'), '{ not valid json', 'utf8');
    expect(readPluginManifest(dir)).toBeNull();
  });
});

describe('extractCommands', () => {
  it('name 取自 key', () => {
    const commands = extractCommands({
      commands: {
        'deck:new': { describe: '创建 PPT', run: () => 0 },
      },
    });

    expect(commands.get('deck:new')?.describe).toBe('创建 PPT');
  });

  it('显式 name 优先', () => {
    const commands = extractCommands({
      commands: {
        'deck:new': { name: 'custom', describe: 'x', run: () => 0 },
      },
    });

    expect(commands.has('custom')).toBe(true);
    expect(commands.has('deck:new')).toBe(false);
  });

  it('空插件返回空表', () => {
    expect(extractCommands({}).size).toBe(0);
    expect(extractCommands({ commands: {} }).size).toBe(0);
  });

  it('保留 run 函数', () => {
    const commands = extractCommands({
      commands: { 'x:y': { describe: 'd', run: () => 42 } },
    });

    expect(commands.get('x:y')?.run([], { cwd: '', projectRoot: '' })).toBe(42);
  });
});

describe('插件命令契约', () => {
  it('插件命令名应带命名空间前缀（避免与内核冲突）', () => {
    // 这是一条**约定**而非强制 —— 但文档里写明了
    const kernelNames = new Set(['new', 'sync', 'check', 'verify', 'contract', 'release']);

    const commands = extractCommands({
      commands: {
        'deck:new': { describe: '创建 PPT', run: () => 0 },
      },
    });

    for (const name of commands.keys()) {
      expect(kernelNames.has(name)).toBe(false);
      expect(name).toContain(':');
    }
  });
});

describe('插件包结构', () => {
  it('插件声明的路径应指向 JS/TS 文件', () => {
    const dir = makePluginPackage({
      name: '@scholarspace/slides',
      scholarspace: { commands: './src/cli-commands.ts' },
    });

    const manifest = readPluginManifest(dir);
    expect(manifest?.scholarspace?.commands).toMatch(/\.(ts|js|mjs)$/);
  });

  it('插件目录结构符合约定', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plugin-struct-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'cli-commands.ts'), 'export const commands = {};', 'utf8');
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@scholarspace/x',
        scholarspace: { commands: './src/cli-commands.ts' },
      }),
      'utf8',
    );

    expect(readPluginManifest(dir)?.scholarspace?.commands).toBe('./src/cli-commands.ts');
  });
});
