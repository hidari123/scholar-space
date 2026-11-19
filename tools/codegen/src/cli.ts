/**
 * codegen CLI —— 契约工具入口。
 *
 * 命令：
 *   validate       校验契约（G5 / G6）
 *   snapshot       导出扁平化契约快照（用于 diff）
 *   list           列出已加载的契约
 *   release-check  发布前检查（拦截 file: 依赖等会破坏发布的问题）
 *
 * ⚠️ shebang 由 tsup 的 banner 注入，这里不要重复写。
 */

import { ContractBundle, toYaml } from './loader';
import { findProjectRoot, openapiDir } from './paths';
import { checkAll } from './release-check';
import { validateContracts } from './validator';

/** 加载全部契约。 */
export function loadBundle(): ContractBundle {
  const root = findProjectRoot();
  return new ContractBundle(root).loadAll(openapiDir(root));
}

/** 执行校验。 */
export function runValidate(): number {
  const bundle = loadBundle();
  const result = validateContracts(bundle);

  console.log(
    `契约校验：${result.stats.files} 个文件，${result.stats.operations} 个端点，${result.stats.schemas} 个 schema`,
  );

  for (const warning of result.warnings) {
    console.warn(`  ⚠ ${warning}`);
  }

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }
    console.error(`\n契约校验失败：${result.errors.length} 个错误`);
    return 1;
  }

  console.log('✓ 契约校验通过');
  return 0;
}

/** 执行快照。 */
export function runSnapshot(): number {
  const bundle = loadBundle();
  const output: Record<string, unknown> = {};

  for (const { name, doc } of bundle.all()) {
    output[name] = bundle.dereference(name, doc);
  }

  console.log(toYaml(output));
  return 0;
}

/** 列出契约。 */
export function runList(): number {
  const bundle = loadBundle();
  for (const { name } of bundle.all()) {
    console.log(`  ${name}`);
  }
  return 0;
}

/** 发布前检查。 */
export function runReleaseCheck(): number {
  const result = checkAll();

  for (const warning of result.warnings) {
    console.warn(`  ⚠ ${warning}`);
  }

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`  ✗ ${error}`);
    }
    console.error(`\n发布前检查失败：${result.errors.length} 个错误`);
    return 1;
  }

  console.log(`✓ 发布前检查通过（${result.packages.length} 个包）`);
  return 0;
}

/** 命令分发。 */
export function main(argv: string[]): number {
  const command = argv[0] ?? 'validate';

  switch (command) {
    case 'validate':
      return runValidate();
    case 'snapshot':
      return runSnapshot();
    case 'list':
      return runList();
    case 'release-check':
      return runReleaseCheck();
    default:
      console.error(`未知命令：${command}`);
      console.error('可用命令：validate | snapshot | list | release-check');
      return 1;
  }
}

// 直接执行时
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exit(main(process.argv.slice(2)));
}
