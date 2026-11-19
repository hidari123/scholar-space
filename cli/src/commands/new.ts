/**
 * `new` 命令 —— 创建新项目。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { syncConventions, writeLocalExtendsGuide } from '../core/sync';
import { render, type TemplateVars, toSnakeCase } from '../templates';
import { TEMPLATES } from '../templates/index';

const log = {
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
  info: (message: string) => console.log(`\x1b[36m›\x1b[0m ${message}`),
  step: (message: string) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`),
};

/**
 * 创建新项目。
 *
 * @param name 项目名（kebab-case）
 * @param templateId 模板 ID
 * @param targetRoot 目标根目录
 * @param overrides 模板变量覆盖
 * @param sourceRoot 主仓根（用于同步规范基座）
 */
export function runNew(
  name: string,
  templateId: string,
  targetRoot: string,
  overrides: Record<string, string> = {},
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
    ...overrides,
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
