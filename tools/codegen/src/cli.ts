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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ContractBundle, toYaml } from './loader';
import { findProjectRoot, openapiDir } from './paths';
import { checkAll } from './release-check';
import { generateTsClient } from './ts-generator';
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

/** 生成产物目录。 */
export function generatedDir(): string {
  // ⚠️ **主站在 `apps/web`** —— 不是 `packages/web`。
  return join(findProjectRoot(), 'apps', 'web', 'src', 'generated');
}

/**
 * 执行 TS 客户端生成。
 *
 * ⚠️ **逐个契约生成一个文件** ——
 * 一个服务一个文件，改一个契约不用重新生成全部。
 */
export function runGenerate(): number {
  const bundle = loadBundle();
  const outputDir = generatedDir();

  mkdirSync(outputDir, { recursive: true });

  let totalOperations = 0;
  let totalTypes = 0;
  let fileCount = 0;

  for (const { name, doc } of bundle.all()) {
    // ⚠️ **跳过公共片段** ——
    // `common.yaml` 只有 schema，没有路径，生成出来是空的。
    const paths = (doc as Record<string, unknown>).paths as Record<string, unknown> | undefined;
    if (!paths || Object.keys(paths).length === 0) continue;

    const moduleName = name.replace(/\.ya?ml$/, '');

    // ⚠️ **两份文档各司其职** ——
    //
    //   · `doc`（原始）—— 保留 `$ref`，
    //     这样响应/请求体能生成**命名类型**（`PaperResponse[]`），
    //     而不是把整个对象内联进去。
    //
    //   · `dereferenced`（解引用后）—— 路径参数要用，
    //     因为契约里写的是 `$ref: '#/components/parameters/PaperId'`，
    //     不解引用就读不到参数名。
    const dereferenced = bundle.dereference(name, doc) as Record<string, unknown>;

    const result = generateTsClient(doc, dereferenced, {
      contractName: name,
      moduleName,
      baseUrl: '/api',
    });

    const filePath = join(outputDir, `${moduleName}.ts`);
    writeFileSync(filePath, result.code, 'utf8');

    totalOperations += result.operationCount;
    totalTypes += result.typeCount;
    fileCount += 1;

    console.log(
      `  ${moduleName}.ts —— ${result.operationCount} 个操作，${result.typeCount} 个类型`,
    );
  }

  // ⚠️ **index.ts 也生成** ——
  // 手写的话，新增契约要记得手动加一行，
  // 忘了就会「客户端能生成但导不出来」。
  const indexLines: string[] = [
    '/**',
    ' * 生成的客户端汇总 —— 由契约生成，不要手改。',
    ' *',
    ' * ⚠️ **重新生成**：`node tools/codegen/dist/cli.js generate`',
    ' */',
    '',
  ];

  for (const { name } of bundle.all()) {
    const moduleName = name.replace(/\.ya?ml$/, '');
    const paths = (bundle.get(name) as Record<string, unknown> | undefined)?.paths as
      | Record<string, unknown>
      | undefined;
    if (!paths || Object.keys(paths).length === 0) continue;

    indexLines.push(`/** ${moduleName} 客户端。 */`);
    indexLines.push(`export * from './${moduleName}';`);
  }

  indexLines.push('');
  writeFileSync(join(outputDir, 'index.ts'), indexLines.join('\n'), 'utf8');

  console.log(`\n✓ 生成完成：${fileCount} 个文件，${totalOperations} 个操作，${totalTypes} 个类型`);
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
    case 'generate':
      return runGenerate();
    default:
      console.error(`未知命令：${command}`);
      console.error('可用命令：validate | snapshot | list | release-check | generate');
      return 1;
  }
}

// 直接执行时
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  process.exit(main(process.argv.slice(2)));
}
