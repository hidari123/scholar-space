/**
 * 发布前检查 —— 拦截会破坏发布的配置。
 *
 * 检查项：
 *   R1  package.json 不能有 `file:` 依赖（无法发布到 npm）
 *   R2  必须有 publishConfig.access = restricted（GitHub Packages 私有包）
 *   R3  publishConfig.registry 必须指向 GitHub Packages
 *   R4  files 字段必须包含构建产物
 *   R5  版本号必须是合法 semver
 *   R6  必须有 LICENSE / license 字段
 *   R7  private: true 的包不能发布
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findProjectRoot } from './paths';

/** 检查结果。 */
export interface ReleaseCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** 检查的包。 */
  packages: string[];
}

/** GitHub Packages 的 npm registry。 */
const GH_NPM_REGISTRY = 'https://npm.pkg.github.com';

/** 语义化版本正则。 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * 检查一个 npm 包是否可发布。
 */
export function checkNpmPackage(packageDir: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    return { errors: [`${packageDir}: 找不到 package.json`], warnings };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const name = typeof manifest.name === 'string' ? manifest.name : packageDir;

  checkPublishable(name, manifest, errors);
  checkVersion(name, manifest, errors);
  checkLicense(name, packageDir, manifest, errors, warnings);
  checkLocalDependencies(name, manifest, errors);
  checkPublishConfig(name, manifest, errors);
  checkFiles(name, manifest, errors, warnings);

  return { errors, warnings };
}

/** R7：private 包不能发布。 */
function checkPublishable(name: string, manifest: Record<string, unknown>, errors: string[]): void {
  if (manifest.private === true) {
    errors.push(`${name}: private=true 的包不能发布到 registry`);
  }
}

/** R5：版本号必须是合法 semver。 */
function checkVersion(name: string, manifest: Record<string, unknown>, errors: string[]): void {
  const version = typeof manifest.version === 'string' ? manifest.version : '';
  if (!SEMVER_PATTERN.test(version)) {
    errors.push(`${name}: 版本号 "${version}" 不是合法 semver`);
  }
}

/** R6：必须有 license 字段或 LICENSE 文件。 */
function checkLicense(
  name: string,
  packageDir: string,
  manifest: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  const license = manifest.license;
  const hasLicenseFile = existsSync(join(packageDir, 'LICENSE'));

  if (!license && !hasLicenseFile) {
    errors.push(`${name}: 缺少 license 字段或 LICENSE 文件`);
  } else if (license === 'UNLICENSED' && !hasLicenseFile) {
    warnings.push(`${name}: license 为 UNLICENSED 且无 LICENSE 文件`);
  }
}

/** R1：file:/link:/workspace: 依赖无法发布。 */
function checkLocalDependencies(
  name: string,
  manifest: Record<string, unknown>,
  errors: string[],
): void {
  const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0';

  for (const field of fields) {
    const deps = manifest[field] as Record<string, string> | undefined;
    if (!deps) continue;

    for (const [depName, range] of Object.entries(deps)) {
      if (range.startsWith('file:') || range.startsWith('link:') || range.includes('workspace:')) {
        errors.push(
          `${name}: 依赖 "${depName}" 使用了 "${range}" —— 发布前必须换成版本号（如 "^${version}"）`,
        );
      }
    }
  }
}

/** R2 / R3：publishConfig 指向 GitHub Packages 且 access=restricted。 */
function checkPublishConfig(
  name: string,
  manifest: Record<string, unknown>,
  errors: string[],
): void {
  const publishConfig = manifest.publishConfig as Record<string, unknown> | undefined;

  if (!publishConfig) {
    errors.push(`${name}: 缺少 publishConfig（GitHub Packages 需要 access + registry）`);
    return;
  }

  if (publishConfig.access !== 'restricted') {
    errors.push(`${name}: publishConfig.access 必须是 "restricted"`);
  }
  if (publishConfig.registry !== GH_NPM_REGISTRY) {
    errors.push(`${name}: publishConfig.registry 必须是 "${GH_NPM_REGISTRY}"`);
  }
}

/** R4：files 必须声明，避免打包整个目录。 */
function checkFiles(
  name: string,
  manifest: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  const files = manifest.files as string[] | undefined;

  if (!files || files.length === 0) {
    errors.push(`${name}: 缺少 files 字段 —— npm 会打包整个目录`);
  } else if (!files.includes('dist')) {
    warnings.push(`${name}: files 未包含 "dist" —— 确认构建产物会被发布`);
  }
}

/**
 * 检查主仓里所有待发布的包。
 */
export function checkAll(): ReleaseCheckResult {
  const root = findProjectRoot();
  const errors: string[] = [];
  const warnings: string[] = [];
  const packages: string[] = [];

  const candidates = [join(root, 'packages', 'ui'), join(root, 'packages', 'ui')];

  for (const dir of candidates) {
    if (!existsSync(join(dir, 'package.json'))) continue;
    if (packages.includes(dir)) continue;

    packages.push(dir);
    const result = checkNpmPackage(dir);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { ok: errors.length === 0, errors, warnings, packages };
}
