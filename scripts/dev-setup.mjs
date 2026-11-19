#!/usr/bin/env node
/**
 * dev-setup — 本地多仓联调准备
 *
 * 作用：
 *   1. 把 13 个独立子项目克隆到固定相对位置（../scholarspace-<name>）
 *   2. 生成 .env（从 .env.example 复制）
 *   3. 安装依赖（pnpm + uv）
 *   4. 校验跨仓 extends 路径可用
 *
 * 用法：
 *   node scripts/dev-setup.mjs            # 完整初始化
 *   node scripts/dev-setup.mjs --check    # 只校验，不改动
 *   node scripts/dev-setup.mjs --skip-install
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PARENT = resolve(ROOT, '..');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const SKIP_INSTALL = args.has('--skip-install');

/** 13 个独立子项目 —— 与 docs/README.md 的项目总表一致 */
const SUBPROJECTS = [
  'core',
  'auth',
  'llm',
  'storage',
  'events',
  'billing',
  'paper',
  'slides',
  'orchestra',
  'community',
  'federation',
  'ui',
  'pdf-viewer',
];

const log = {
  info: (m) => console.log(`\x1b[36m›\x1b[0m ${m}`),
  ok: (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[33m!\x1b[0m ${m}`),
  err: (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m▸ ${m}\x1b[0m`),
};

function run(cmd, args, opts = {}) {
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd ?? ROOT, ...opts });
    return true;
  } catch {
    return false;
  }
}

// ── 1. 检查环境 ────────────────────────────────────────
log.step('检查工具链');
const TOOLS = [
  ['git', ['--version'], 'git'],
  ['node', ['--version'], 'node'],
  ['pnpm', ['--version'], 'pnpm'],
];
let toolsOk = true;
for (const [cmd, cmdArgs, name] of TOOLS) {
  if (run(cmd, cmdArgs, { stdio: 'pipe' })) {
    log.ok(`${name} 已安装`);
  } else {
    log.err(`${name} 未安装 —— 请先安装`);
    toolsOk = false;
  }
}
if (!toolsOk) {
  log.err('工具链不完整，退出');
  process.exit(1);
}

// ── 2. 子项目目录 ──────────────────────────────────────
log.step('检查子项目目录');
const missing = [];
const present = [];
for (const name of SUBPROJECTS) {
  const dir = join(PARENT, `scholarspace-${name}`);
  if (existsSync(dir)) {
    present.push(name);
  } else {
    missing.push(name);
  }
}
log.ok(`已就位 ${present.length}/${SUBPROJECTS.length} 个`);
if (missing.length) {
  log.warn(`缺失：${missing.join(', ')}`);
  log.info('克隆命令（需先在 GitHub 建好空仓）：');
  for (const name of missing) {
    console.log(`    git clone <your-org>/scholarspace-${name} ${join(PARENT, `scholarspace-${name}`)}`);
  }
  if (CHECK_ONLY) {
    process.exit(missing.length ? 1 : 0);
  }
}

// ── 3. 环境变量 ────────────────────────────────────────
log.step('环境变量');
const envPath = join(ROOT, '.env');
const envExample = join(ROOT, '.env.example');
if (existsSync(envPath)) {
  log.ok('.env 已存在，跳过');
} else if (existsSync(envExample)) {
  writeFileSync(envPath, readFileSync(envExample, 'utf8'), 'utf8');
  log.ok('.env 已从 .env.example 生成 —— 请填入真实密钥');
} else {
  log.warn('找不到 .env.example');
}

// ── 4. 依赖安装 ────────────────────────────────────────
if (!SKIP_INSTALL && !CHECK_ONLY) {
  log.step('安装依赖');
  if (run('pnpm', ['install'], { stdio: 'inherit' })) {
    log.ok('pnpm install 完成');
  } else {
    log.err('pnpm install 失败');
  }
}

// ── 5. 跨仓 extends 路径校验 ───────────────────────────
log.step('校验跨仓规范引用');
const CONVENTIONS = join(ROOT, 'packages', 'conventions');
const CHECKS = [
  ['python/ruff.toml', join(CONVENTIONS, 'python', 'ruff.toml')],
  ['python/import-linter.base.toml', join(CONVENTIONS, 'python', 'import-linter.base.toml')],
  ['typescript/tsconfig.base.json', join(CONVENTIONS, 'typescript', 'tsconfig.base.json')],
  ['typescript/biome.json', join(CONVENTIONS, 'typescript', 'biome.json')],
  ['i18n/key-patterns.json', join(CONVENTIONS, 'i18n', 'key-patterns.json')],
  ['theme/brand.schema.json', join(CONVENTIONS, 'theme', 'brand.schema.json')],
  ['api/response.schema.json', join(CONVENTIONS, 'api', 'response.schema.json')],
];
let allOk = true;
for (const [label, path] of CHECKS) {
  if (existsSync(path)) {
    log.ok(`${label}`);
  } else {
    log.warn(`${label} 缺失 —— ${path}`);
    allOk = false;
  }
}

// ── 6. 目录结构校验 ────────────────────────────────────
log.step('校验主项目目录');
const DIRS = [
  'packages/conventions',
  'packages/ui',
  'packages/core',
  'contracts',
  'apps',
  'infra',
  'docs',
  'tools',
  'cli',
  'versions',
];
for (const d of DIRS) {
  const p = join(ROOT, d);
  if (existsSync(p)) {
    log.ok(`${d}`);
  } else {
    log.info(`${d} 待创建`);
  }
}

// ── 7. 汇总 ────────────────────────────────────────────
log.step('汇总');
const missingCount = missing.length;
if (allOk && missingCount === 0) {
  log.ok('本地环境就绪 —— 可以开始 M0');
  process.exit(0);
} else {
  log.warn(`子项目缺失 ${missingCount} 个；规范文件${allOk ? '齐全' : '有缺失'}`);
  log.info('下一步：按 docs/11-执行计划.md 的 Step 0 继续');
  process.exit(missingCount ? 1 : 0);
}
