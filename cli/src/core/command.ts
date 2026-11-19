/**
 * 命令注册表 —— 内核命令。
 *
 * ⚠️ 内核命令 = 所有独立仓都能用的通用能力。
 *    领域命令由各仓通过插件提供。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 命令定义。 */
export interface Command {
  /** 命令名。 */
  name: string;
  /** 一句话说明。 */
  describe: string;
  /** 详细用法。 */
  usage?: string;
  /** 执行。 */
  run: (args: string[], context: CommandContext) => Promise<number> | number;
}

/** 命令上下文。 */
export interface CommandContext {
  /** 当前工作目录。 */
  cwd: string;
  /** 主仓根目录。 */
  projectRoot: string;
  /** 目标目录（--target）。 */
  target: string;
  /**
   * 命令行标志（`--key value` 或 `--key`）。
   *
   * ⚠️ 之前 flags 只在 parseArgs 里，**没有传给命令** ——
   *    导致 `sync --kind typescript` 里的 kind 丢失，
   *    静默降级成 python。
   */
  flags: Record<string, string | boolean>;
}

const log = {
  ok: (message: string) => console.log(`\x1b[32m✓\x1b[0m ${message}`),
  warn: (message: string) => console.log(`\x1b[33m!\x1b[0m ${message}`),
  err: (message: string) => console.error(`\x1b[31m✗\x1b[0m ${message}`),
  info: (message: string) => console.log(`\x1b[36m›\x1b[0m ${message}`),
  step: (message: string) => console.log(`\n\x1b[1m▸ ${message}\x1b[0m`),
};

/**
 * 读 package.json。
 */
function readManifest(dir: string): Record<string, unknown> | null {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 执行一条命令。
 */
function exec(command: string, args: string[], cwd: string): number {
  try {
    execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    return 0;
  } catch {
    return 1;
  }
}

/**
 * 探测项目类型。
 */
function detectKind(dir: string): 'python' | 'typescript' | 'unknown' {
  if (existsSync(join(dir, 'pyproject.toml'))) return 'python';
  if (existsSync(join(dir, 'package.json'))) return 'typescript';
  return 'unknown';
}

// ══════════════════════════════════════════════════════════
// quality —— 统一质量门禁入口
// ══════════════════════════════════════════════════════════
const quality: Command = {
  name: 'verify',
  describe: '跑完整质量门禁（typecheck + lint + test + build）',
  usage: 'scholarspace-cli verify [--skip <step>]',
  run(args, context) {
    const skip = args.includes('--skip') ? args[args.indexOf('--skip') + 1] : undefined;
    const kind = detectKind(context.target);

    if (kind === 'unknown') {
      log.err(`未识别的项目类型：${context.target}`);
      return 1;
    }

    const steps =
      kind === 'typescript'
        ? ['typecheck', 'lint', 'test', 'build']
        : ['lint', 'format', 'typecheck', 'contract', 'test'];

    log.step(`质量门禁（${kind}）→ ${context.target}`);

    for (const step of steps) {
      if (skip && step === skip) {
        log.warn(`跳过 ${step}`);
        continue;
      }

      log.info(`→ ${step}`);
      const code = runQualityStep(step, context.target, kind);
      if (code !== 0) {
        log.err(`${step} 失败`);
        return code;
      }
    }

    log.ok('全部通过');
    return 0;
  },
};

/**
 * 跑一个质量步骤。
 */
function runQualityStep(step: string, dir: string, kind: 'python' | 'typescript'): number {
  if (kind === 'typescript') {
    const manifest = readManifest(dir);
    const scripts = (manifest?.scripts ?? {}) as Record<string, string>;
    const scriptName = step === 'format' ? 'format' : step;

    if (scripts[scriptName]) {
      return exec('npm', ['run', scriptName], dir);
    }
    return exec('npx', [scriptName], dir);
  }

  const venv = process.platform === 'win32' ? '.venv\\Scripts' : '.venv/bin';
  const exe = (name: string) => join(venv, process.platform === 'win32' ? `${name}.exe` : name);

  switch (step) {
    case 'lint':
      return exec(exe('ruff'), ['check', 'src/', 'tests/'], dir);
    case 'format':
      return exec(exe('ruff'), ['format', '--check', 'src/', 'tests/'], dir);
    case 'typecheck':
      return exec(exe('mypy'), ['src/'], dir);
    case 'contract':
      return exec(exe('import-linter'), ['lint'], dir);
    case 'test':
      return exec(exe('python'), ['-m', 'pytest', 'tests/', '-q'], dir);
    default:
      return 1;
  }
}

// ══════════════════════════════════════════════════════════
// contract —— 契约相关
// ══════════════════════════════════════════════════════════
const contract: Command = {
  name: 'contract',
  describe: '契约操作（validate / diff / generate）',
  usage: 'scholarspace-cli contract <validate|diff|generate>',
  run(args, context) {
    const action = args[0] ?? 'validate';
    const codegenCli = join(context.projectRoot, 'tools', 'codegen', 'dist', 'cli.js');

    if (!existsSync(codegenCli)) {
      log.err('找不到 codegen 工具，请先构建：pnpm --filter @scholarspace/codegen build');
      return 1;
    }

    const mapping: Record<string, string[]> = {
      validate: ['validate'],
      diff: ['snapshot'],
      generate: ['generate'],
    };

    const cliArgs = mapping[action];
    if (!cliArgs) {
      log.err(`未知子命令：${action}`);
      log.info('可用：validate | diff | generate');
      return 1;
    }

    return exec('node', [codegenCli, ...cliArgs], context.cwd);
  },
};

// ══════════════════════════════════════════════════════════
// release —— 发版
// ══════════════════════════════════════════════════════════
const release: Command = {
  name: 'release',
  describe: '发版操作（check / bump / publish / tag）',
  usage: 'scholarspace-cli release <check|bump|publish|tag> [--version <v>]',
  run(args, context) {
    const action = args[0] ?? 'check';

    switch (action) {
      case 'check':
        return runReleaseCheck(context);
      case 'bump':
        return runBump(args, context);
      case 'publish':
        return runPublish(context);
      case 'tag':
        return runTag(args, context);
      default:
        log.err(`未知子命令：${action}`);
        log.info('可用：check | bump | publish | tag');
        return 1;
    }
  },
};

/**
 * 发版前检查。
 */
function runReleaseCheck(context: CommandContext): number {
  const codegenCli = join(context.projectRoot, 'tools', 'codegen', 'dist', 'cli.js');
  if (!existsSync(codegenCli)) {
    log.err('找不到 codegen 工具');
    return 1;
  }
  return exec('node', [codegenCli, 'release-check'], context.cwd);
}

/**
 * 版本号递增。
 */
function runBump(args: string[], context: CommandContext): number {
  const manifest = readManifest(context.target);
  if (!manifest) {
    log.err(`找不到 package.json：${context.target}`);
    return 1;
  }

  const current = String(manifest.version ?? '0.0.0');
  const level = args[1] ?? 'patch';

  const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    log.err(`无法解析版本号：${current}`);
    return 1;
  }

  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  const next =
    level === 'major'
      ? `${major + 1}.0.0`
      : level === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;

  manifest.version = next;
  writeFileSync(
    join(context.target, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  log.ok(`版本 ${current} → ${next}`);
  return 0;
}

/**
 * 发布到 GitHub Packages。
 */
function runPublish(context: CommandContext): number {
  const manifest = readManifest(context.target);
  if (!manifest) {
    log.err(`找不到 package.json`);
    return 1;
  }

  log.step('发布到 GitHub Packages');
  return exec('npm', ['publish', '--no-git-checks', '--access', 'restricted'], context.target);
}

/**
 * 打 tag。
 */
function runTag(_args: string[], context: CommandContext): number {
  const manifest = readManifest(context.target);
  if (!manifest) {
    log.err('找不到 package.json');
    return 1;
  }

  const version = String(manifest.version ?? '');
  const tag = `v${version}`;

  log.step(`打 tag ${tag}`);
  const code = exec('git', ['tag', '-a', tag, '-m', `release ${tag}`], context.target);
  if (code === 0) {
    log.ok(`已打 tag ${tag}（记得 git push origin ${tag}）`);
  }
  return code;
}

// ══════════════════════════════════════════════════════════
// 内核命令表
// ══════════════════════════════════════════════════════════
export const KERNEL_COMMANDS: Command[] = [quality, contract, release];
