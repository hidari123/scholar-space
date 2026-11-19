/**
 * `@scholarspace/guards` —— 统一护栏入口。
 *
 * 用法：
 *   guards run                    跑全部护栏
 *   guards run --only G7,G13      只跑指定护栏
 *   guards list                  列出全部护栏
 *
 * ⚠️ shebang 由 tsup 的 banner 注入。
 */

import { resolve } from 'node:path';

import { GUARDS, type GuardResult, runGuards } from './guards';

const log = {
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
  step: (message: string) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`),
};

/**
 * 打印护栏结果。
 */
export function report(results: GuardResult[]): void {
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    if (result.ok) {
      log.ok(`${result.id} ${result.name} (${result.durationMs}ms)`);
      continue;
    }

    if (result.severity === 'error') {
      errors += result.violations.length;
      log.err(`${result.id} ${result.name} —— ${result.violations.length} 处违规`);
      for (const violation of result.violations) {
        console.error(`    ${violation}`);
      }
    } else {
      warnings += result.violations.length;
      log.warn(`${result.id} ${result.name} —— ${result.violations.length} 处提醒`);
      for (const violation of result.violations) {
        console.log(`    ${violation}`);
      }
    }
  }

  log.step('汇总');
  const passed = results.filter((result) => result.ok).length;
  console.log(`  ${passed}/${results.length} 条护栏通过`);
  if (errors > 0) console.log(`  ${errors} 个错误（阻断）`);
  if (warnings > 0) console.log(`  ${warnings} 个警告（不阻断）`);
}

/**
 * 命令分发。
 */
export function main(argv: string[]): number {
  const command = argv[0] ?? 'run';

  if (command === 'list') {
    log.step('全部护栏');
    for (const guard of GUARDS) {
      const level = guard.severity === 'error' ? '阻断' : '提醒';
      console.log(`  ${guard.id.padEnd(5)} ${guard.name.padEnd(24)} [${level}]`);
      console.log(`        ${guard.description}`);
    }
    return 0;
  }

  if (command !== 'run') {
    log.err(`未知命令：${command}`);
    log.err('可用命令：run | list');
    return 1;
  }

  const onlyIndex = argv.indexOf('--only');
  const onlyValue = onlyIndex !== -1 ? argv[onlyIndex + 1] : undefined;
  const only = onlyValue ? onlyValue.split(',').map((id) => id.trim().toUpperCase()) : undefined;

  const root = resolve(process.cwd());

  log.step(only ? `运行护栏（${only.join(', ')}）` : '运行全部护栏');

  const results = runGuards(root, only);
  report(results);

  const hasErrors = results.some((result) => !result.ok && result.severity === 'error');

  return hasErrors ? 1 : 0;
}

// 直接执行时
// ⚠️ 入口文件名是 cli.js（package.json 的 bin 指向它）
const entry = process.argv[1]?.replace(/\\/g, '/').split('/').pop();
if (entry === 'cli.js' || entry === 'cli.mjs' || entry === 'scholarspace-guards') {
  process.exit(main(process.argv.slice(2)));
}
