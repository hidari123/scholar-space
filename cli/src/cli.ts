/**
 * `@scholarspace/cli` —— 平台工具链。
 *
 * ⚠️ 架构：内核 + 插件
 *
 *   内核命令（所有独立仓通用）—— 住主仓，改一次所有仓受益
 *     new / sync / check / verify / contract / release / compose
 *
 *   插件命令（各仓自治）—— 住各仓自己，改 PPT 不影响社区
 *     slides → deck:new / deck:serve
 *     identity → signup / login
 *
 * ⚠️ shebang 由 tsup 的 banner 注入。
 */

import { resolve } from 'node:path';
import { runNew } from './commands/new';
import { runCheck, runSync } from './commands/sync-commands';
import { type Command, type CommandContext, KERNEL_COMMANDS } from './core/command';
import { discoverPlugins, type PluginCommand } from './core/plugin';
import { TEMPLATES } from './templates/index';

const log = {
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
  info: (message: string) => console.log(`\x1b[36m›\x1b[0m ${message}`),
  step: (message: string) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`),
};

/**
 * 解析命令行参数。
 */
export function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) continue;

    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[index + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { command, positional, flags };
}

/**
 * 内置命令表 —— sync / check 走独立模块（它们依赖 sync.ts）。
 */
const BUILTIN_COMMANDS: Command[] = [
  {
    name: 'sync',
    describe: '同步规范基座到目标仓',
    usage: 'scholarspace-cli sync --kind python|typescript [--target <dir>]',
    run(args, context) {
      const kind = args.includes('--kind') ? args[args.indexOf('--kind') + 1] : 'python';
      return runSync(
        context.projectRoot,
        context.target,
        kind === 'typescript' ? 'typescript' : 'python',
      );
    },
  },
  {
    name: 'check',
    describe: '检查 extends 引用是否失效',
    usage: 'scholarspace-cli check [--target <dir>]',
    run(_args, context) {
      return runCheck(context.target);
    },
  },
  {
    name: 'new',
    describe: '创建新项目（含规范基座同步）',
    usage: 'scholarspace-cli new <name> --template <id>',
    run(args, context) {
      const name = args[0];
      if (!name) {
        log.err('缺少项目名');
        return 1;
      }
      const templateId = args.includes('--template')
        ? args[args.indexOf('--template') + 1]
        : 'python-service';
      const overrides: Record<string, string> = {};
      if (args.includes('--description')) {
        overrides.description = args[args.indexOf('--description') + 1] ?? '';
      }
      return runNew(
        name,
        templateId ?? 'python-service',
        context.target,
        overrides,
        context.projectRoot,
      );
    },
  },
];

/**
 * 帮助。
 */
export function runHelp(plugins: PluginCommand[] = []): number {
  console.log(`
scholarspace-cli —— 平台工具链

用法：
  scholarspace-cli <命令> [参数] [--target <目录>]

内核命令（所有独立仓通用）：
${BUILTIN_COMMANDS.concat(KERNEL_COMMANDS)
  .map((command) => `  ${command.name.padEnd(10)} ${command.describe}`)
  .join('\n')}

${
  plugins.length > 0
    ? `插件命令（本仓提供）：
${plugins.map((command) => `  ${command.name.padEnd(10)} ${command.describe}`).join('\n')}\n`
    : ''
}
选项：
  --target <dir>       目标目录（默认当前目录）
  --kind <kind>        python | typescript
  --template <id>      模板 ID（见 list）
  --description <d>    项目描述
`);
  return 0;
}

/**
 * 列出模板。
 */
export function runList(): number {
  log.step('可用模板');
  for (const template of Object.values(TEMPLATES)) {
    console.log(`  ${template.id.padEnd(18)} ${template.description}`);
  }
  return 0;
}

/**
 * 命令分发。
 */
export async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);

  const targetRoot = typeof flags.target === 'string' ? resolve(flags.target) : process.cwd();
  // ⚠️ ESM 里没有 __dirname —— 用 import.meta.dirname（Node 20.11+）
  const projectRoot = resolve(import.meta.dirname, '..', '..');

  const context: CommandContext = {
    cwd: process.cwd(),
    projectRoot,
    target: targetRoot,
  };

  // 插件发现 —— 失败降级，不阻断
  const plugins: PluginCommand[] = [];
  try {
    const loaded = await discoverPlugins(context.cwd, projectRoot);
    for (const plugin of loaded) {
      if (plugin.error) {
        log.warn(`插件 ${plugin.provider} 加载失败：${plugin.error}`);
        continue;
      }
      plugins.push(...plugin.commands.values());
    }
  } catch (error) {
    log.warn(`插件发现失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (command === 'list') {
    return runList();
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    return runHelp(plugins);
  }

  // ① 内置命令
  const builtin = BUILTIN_COMMANDS.concat(KERNEL_COMMANDS);
  const builtinMatch = builtin.find((item) => item.name === command);
  if (builtinMatch) {
    return builtinMatch.run(positional, context);
  }

  // ② 插件命令
  const pluginMatch = plugins.find((item) => item.name === command);
  if (pluginMatch) {
    return pluginMatch.run(positional, context);
  }

  log.err(`未知命令：${command}`);
  log.info('用 `scholarspace-cli help` 看可用命令');
  return 1;
}

// 直接执行时
const entry = process.argv[1]?.replace(/\\/g, '/').split('/').pop();
if (entry === 'cli.js' || entry === 'cli.mjs') {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
