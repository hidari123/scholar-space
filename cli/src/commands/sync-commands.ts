/**
 * `sync` 与 `check` 命令 —— 规范基座同步与探测。
 *
 * 从 sync.ts 拆出来，让 cli.ts 只负责命令分发。
 */

import { detectBrokenExtends, syncConventions, writeLocalExtendsGuide } from '../core/sync';

const log = {
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
  info: (message: string) => console.log(`\x1b[36m›\x1b[0m ${message}`),
  step: (message: string) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`),
};

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
