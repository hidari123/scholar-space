/**
 * `@scholarspace/cli` —— 项目脚手架。
 *
 * 命令：
 *   new <name> --template <id>   创建新项目
 *   sync --kind python|typescript  同步规范基座到目标仓
 *   check                        检查目标仓的 extends 是否失效
 *   list                         列出可用模板
 *
 * ⚠️ shebang 由 tsup 的 banner 注入。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { detectBrokenExtends, syncConventions, writeLocalExtendsGuide } from './sync';
import { render, type Template, type TemplateVars, toSnakeCase } from './templates';
import { pythonServiceTemplate } from './templates/python-service';
import { tsPackageTemplate } from './templates/ts-package';

/** 全部模板。 */
export const TEMPLATES: Record<string, Template> = {
  [pythonServiceTemplate.id]: pythonServiceTemplate,
  [tsPackageTemplate.id]: tsPackageTemplate,
};

const log = {
  info: (message: string) => console.log(`\x1b[36m›\x1b[0m ${message}`),
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
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
 * 创建新项目。
 *
 * @param sourceRoot 主仓根（用于同步规范基座）
 */
export function runNew(
  name: string,
  templateId: string,
  targetRoot: string,
  vars: Partial<TemplateVars> = {},
  sourceRoot: string = process.cwd(),
): number {
  const template = TEMPLATES[templateId];
  if (!template) {
    log.err(`未知模板：${templateId}`);
    log.info(`可用模板：${Object.keys(TEMPLATES).join(', ')}`);
    return 1;
  }

  const projectDir = join(targetRoot, name);
  if (existsSync(projectDir)) {
    log.err(`目标已存在：${projectDir}`);
    return 1;
  }

  log.step(`创建 ${name}（模板：${template.name}）`);

  const fullVars: TemplateVars = {
    name,
    packageName: toSnakeCase(name),
    scopeName: `@scholarspace/${name}`,
    description: `${name} —— scholarspace 子项目`,
    ...vars,
  };

  let count = 0;
  for (const file of template.files) {
    const relativePath = render(file.path, fullVars);
    const targetPath = join(projectDir, relativePath);

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, render(file.content, fullVars), 'utf8');
    count += 1;
  }

  log.ok(`已生成 ${count} 个文件 → ${projectDir}`);

  // 同步规范基座 —— 让子仓 CI 不依赖主仓在场
  const kind = template.language === 'python' ? 'python' : 'typescript';
  const syncResult = syncConventions(sourceRoot, projectDir, kind);
  if (syncResult.copied.length > 0) {
    log.ok(`已同步规范基座：${syncResult.copied.join(', ')}`);
  } else if (syncResult.failed.length > 0) {
    log.warn('规范基座同步失败 —— 手动执行 `cli sync` 补齐');
  }
  writeLocalExtendsGuide(projectDir, kind);

  log.step('后续步骤');
  for (const command of template.verifyCommands) {
    console.log(`    ${command}`);
  }

  return 0;
}

/**
 * 同步规范基座到目标仓。
 */
export function runSync(
  sourceRoot: string,
  targetRoot: string,
  kind: 'python' | 'typescript',
): number {
  log.step(`同步规范基座（${kind}）→ ${targetRoot}`);

  const result = syncConventions(sourceRoot, targetRoot, kind);

  for (const failure of result.failed) {
    log.err(failure);
  }

  if (result.changed) {
    log.ok(`已更新：${result.copied.join(', ')}`);
  } else {
    log.ok('已是最新，无需变更');
  }

  writeLocalExtendsGuide(targetRoot, kind);

  return result.failed.length > 0 ? 1 : 0;
}

/**
 * 检查 extends 是否失效。
 */
export function runCheck(targetRoot: string): number {
  log.step(`检查 extends 引用 → ${targetRoot}`);

  const problems = detectBrokenExtends(targetRoot);

  if (problems.length === 0) {
    log.ok('extends 引用全部有效');
    return 0;
  }

  for (const problem of problems) {
    log.err(problem);
  }
  log.err(`发现 ${problems.length} 个失效的 extends 引用`);
  log.info('修复：npx @scholarspace/cli sync --kind python|typescript');
  return 1;
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
 * 帮助。
 */
export function runHelp(): number {
  console.log(`
scholarspace-cli —— 项目脚手架

用法：
  scholarspace-cli new <name> --template <id>       创建新项目
  scholarspace-cli sync --kind <kind> --target <d> 同步规范基座
  scholarspace-cli check --target <d>              检查 extends 是否失效
  scholarspace-cli list                            列出可用模板

选项：
  --template <id>   模板 ID（见 list）
  --kind <kind>     python | typescript
  --target <dir>    目标目录（默认当前目录）
  --description <d> 项目描述
`);
  return 0;
}

/**
 * 命令分发。
 */
export function main(argv: string[]): number {
  const { command, positional, flags } = parseArgs(argv);

  const targetRoot = typeof flags.target === 'string' ? resolve(flags.target) : process.cwd();

  // ⚠️ ESM 里没有 __dirname —— 用 import.meta.dirname（Node 20.11+）
  //    主仓根 = cli/dist/../..  →  cli/ 的上一级
  const sourceRoot = resolve(import.meta.dirname, '..', '..');

  switch (command) {
    case 'new': {
      const name = positional[0];
      if (!name) {
        log.err('缺少项目名');
        return 1;
      }
      const templateId = typeof flags.template === 'string' ? flags.template : 'python-service';
      const overrides: Partial<TemplateVars> = {};
      if (typeof flags.description === 'string') {
        overrides.description = flags.description;
      }
      return runNew(name, templateId, targetRoot, overrides, sourceRoot);
    }

    case 'sync': {
      const kind = flags.kind === 'typescript' ? 'typescript' : 'python';
      return runSync(sourceRoot, targetRoot, kind);
    }

    case 'check':
      return runCheck(targetRoot);

    case 'list':
      return runList();

    default:
      // 含 'help' 与未知命令
      return runHelp();
  }
}

/**
 * 判断当前模块是否作为入口被执行。
 *
 * ⚠️ 不能用 `import.meta.url.endsWith(process.argv[1])` ——
 *    tsup 打包后入口文件与 chunk 分开，这种比较不可靠。
 *    改用「文件名匹配」：入口文件名固定为 cli.js / cli.mjs。
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;

  const fileName = entry.replace(/\\/g, '/').split('/').pop() ?? '';
  return fileName === 'cli.js' || fileName === 'cli.mjs';
}

// 直接执行时
if (isMainModule()) {
  process.exit(main(process.argv.slice(2)));
}
