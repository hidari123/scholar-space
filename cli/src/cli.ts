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
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = 'help';

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token.startsWith('--')) {
      // `--key value` 或 `--key`（布尔）
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }

    // ⚠️ 第一个**非 flag** 的 token 是命令。
    //    之前用 `argv[0]` 当命令 —— `--kind typescript sync` 会把
    //    "--kind" 当成命令名。
    if (command === 'help') {
      command = token;
      continue;
    }

    positional.push(token);
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
    usage:
      'scholarspace-cli sync --kind python|typescript [--target <dir>] [--check] [--with-exceptions]',
    run(_args, context) {
      // ⚠️ 从 context.flags 取 —— flags 之前没传给命令，
      //    导致 `sync --kind typescript` 的 kind 丢失，静默降级成 python。
      const kindValue = context.flags.kind;
      const checkOnly = context.flags.check === true;
      // ⚠️ `--with-exceptions` —— 应用本地偏离。
      //    比如 core 需要启用 pydantic.mypy 插件（base 里没有）。
      const withExceptions = context.flags['with-exceptions'] === true;

      return runSync(
        context.projectRoot,
        context.target,
        kindValue === 'typescript' ? 'typescript' : 'python',
        checkOnly,
        withExceptions,
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

      // ⚠️ 从 context.flags 取 —— flags 之前没传给命令，
      //    导致 `--template ts-package` 被忽略，静默用默认模板。
      const templateId =
        typeof context.flags.template === 'string' ? context.flags.template : 'python-service';

      const overrides: Record<string, string> = {};
      if (typeof context.flags.description === 'string') {
        overrides.description = context.flags.description;
      }

      return runNew(name, templateId, context.target, overrides, context.projectRoot);
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
  // ⚠️ ESM 里没有 __dirname —— 用 import.meta.dirname（Node 20.11+）
  const projectRoot = resolve(import.meta.dirname, '..', '..');
  const { command, positional, context } = resolveInvocation(argv, process.cwd(), projectRoot);

  // 插件发现 —— 失败降级，不阻断
  const plugins: PluginCommand[] = [];
  try {
    const loaded = await discoverPlugins(context.cwd, projectRoot, context.flags);
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

/**
 * 把 argv 解析成命令分发所需的全部信息。
 *
 * ⚠️ 单独抽出来是为了**可测** ——
 *    之前 flags 只在 parseArgs 里、没传给命令，
 *    导致 `sync --kind typescript` / `new x --template ts-package`
 *    静默降级成默认值。
 *    把「解析 → 组装 context」这一步独立出来后就能直接断言。
 */
export function resolveInvocation(
  argv: string[],
  cwd: string,
  projectRoot: string,
): {
  command: string;
  positional: string[];
  context: CommandContext;
} {
  const { command, positional, flags } = parseArgs(argv);

  const targetRoot = typeof flags.target === 'string' ? resolve(flags.target) : cwd;

  const context: CommandContext = {
    cwd,
    projectRoot,
    target: targetRoot,
    flags,
  };

  return { command, positional, context };
}

// 直接执行时
const entry = process.argv[1]?.replace(/\\/g, '/').split('/').pop();
if (entry === 'cli.js' || entry === 'cli.mjs') {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
