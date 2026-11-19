/**
 * 插件机制 —— 让每个独立仓贡献自己的命令。
 *
 * ⚠️ 设计目标（回应「我希望独立仓库都能利用起来这个」）：
 *
 *   内核命令（所有仓通用）
 *     sync / check / contract / release / quality / new / compose
 *     → 住在主仓，改一次所有仓受益
 *
 *   插件命令（各仓自治）
 *     slides 提供 deck:new / deck:serve
 *     community 提供 post:create / mod:review
 *     → 住在各仓自己，改 PPT 不影响社区
 *
 * 插件声明方式（各仓 package.json）：
 *   {
 *     "scholarspace": {
 *       "commands": "./src/cli-commands.ts"
 *     }
 *   }
 *
 * 加载失败**降级**为「只跑内核命令 + 警告」，不阻断 —— 插件坏了不该让
 * 整个工具链不可用。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 插件命令定义。 */
export interface PluginCommand {
  /** 命令名（不含前缀）。 */
  name: string;
  /** 一句话说明。 */
  describe: string;
  /** 执行。 */
  run: (args: string[], context: PluginContext) => Promise<number> | number;
}

/** 插件上下文。 */
export interface PluginContext {
  /** 当前工作目录。 */
  cwd: string;
  /** 主仓根目录。 */
  projectRoot: string;
}

/** 插件导出形状。 */
export interface PluginModule {
  /** 命令表。 */
  commands?: Record<string, Omit<PluginCommand, 'name'> | PluginCommand>;
}

/** 加载结果。 */
export interface PluginLoadResult {
  /** 插件提供方（包名）。 */
  provider: string;
  /** 命令表。 */
  commands: Map<string, PluginCommand>;
  /** 加载错误。 */
  error?: string;
}

/** package.json 里的插件声明。 */
interface PluginManifest {
  name?: string;
  scholarspace?: {
    commands?: string;
  };
}

/**
 * 读 package.json。
 *
 * ⚠️ 必须容忍 BOM —— Windows PowerShell 的 `Out-File -Encoding utf8`
 *    会写 BOM，导致 JSON.parse 直接抛错。真实踩过。
 */
function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path, 'utf8');
    // 去掉 UTF-8 BOM（U+FEFF）
    const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从包的 package.json 读取插件声明。
 */
export function readPluginManifest(packageDir: string): PluginManifest | null {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) return null;

  return readJsonFile(manifestPath) as PluginManifest | null;
}

/**
 * 从已加载的模块提取命令。
 *
 * 兼容两种写法：
 *   { 'deck:new': { describe, run } }            —— name 取自 key
 *   { 'deck:new': { name: 'deck:new', ... } }    —— name 显式给出
 */
export function extractCommands(module: PluginModule): Map<string, PluginCommand> {
  const commands = new Map<string, PluginCommand>();

  for (const [key, value] of Object.entries(module.commands ?? {})) {
    const name = 'name' in value && value.name ? value.name : key;
    commands.set(name, {
      name,
      describe: value.describe,
      run: value.run as PluginCommand['run'],
    });
  }

  return commands;
}

/**
 * 加载一个目录里的插件。
 *
 * @param packageDir 包目录
 * @param context 插件上下文（传给插件命令执行时）
 */
export async function loadPlugin(
  packageDir: string,
  _context: PluginContext,
): Promise<PluginLoadResult | null> {
  const manifest = readPluginManifest(packageDir);
  if (!manifest?.scholarspace?.commands) return null;

  const provider = manifest.name ?? packageDir;

  try {
    const entry = join(packageDir, manifest.scholarspace.commands);
    if (!existsSync(entry)) {
      return {
        provider,
        commands: new Map(),
        error: `插件入口不存在：${manifest.scholarspace.commands}`,
      };
    }

    // 动态 import —— 插件是 TS 源码时需要 tsx/构建产物，这里只处理 JS
    // ⚠️ 用 file:// URL —— Windows 上直接 import 绝对路径会失败
    const loaded = (await import(pathToFileURL(entry).href)) as PluginModule;
    return { provider, commands: extractCommands(loaded) };
  } catch (error) {
    return {
      provider,
      commands: new Map(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 收集所有可用插件。
 *
 * 插件来源（按优先级）：
 *   ① 当前目录的 package.json 声明（在自己仓里跑，自动加载本仓插件）
 *   ② 主仓 packages/* 与 tools/* 中声明了 scholarspace.commands 的包
 */
export async function discoverPlugins(
  cwd: string,
  projectRoot: string,
): Promise<PluginLoadResult[]> {
  const results: PluginLoadResult[] = [];
  const context: PluginContext = { cwd, projectRoot };

  // ① 当前仓
  const current = await loadPlugin(cwd, context);
  if (current) results.push(current);

  // ② 主仓里的包
  for (const group of ['packages', 'tools']) {
    const groupDir = join(projectRoot, group);
    if (!existsSync(groupDir)) continue;

    const { readdirSync, statSync } = await import('node:fs');
    for (const entry of readdirSync(groupDir)) {
      const dir = join(groupDir, entry);
      if (!statSync(dir).isDirectory()) continue;

      const loaded = await loadPlugin(dir, context);
      if (loaded) results.push(loaded);
    }
  }

  return results;
}
