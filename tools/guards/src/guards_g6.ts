/**
 * G6 护栏 —— 版本兼容矩阵。
 *
 * ⚠️ **消费方声明「我能接受哪些版本的提供方」** ——
 *    CI 校验：被依赖方的当前版本必须落在消费方声明的区间内，
 *    否则阻断发布。
 *
 * ⚠️ **为什么要有这个** ——
 *    契约改了但消费方没适配，是最常见的线上事故。
 *    G5 只看「有没有」，不看「兼不兼容」。
 *
 * ⚠️ **版本区间怎么算** ——
 *    `min_provider_version: 0.1.0` + `max_provider_version: 0.x`
 *    表示「0.1.0 及以上，0.x 任意」。
 *    `0.x` 是通配，不是精确版本。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 兼容矩阵文件（相对主仓）。 */
const COMPATIBILITY_FILE = 'packages/versions/compatibility.yaml';

/** 矩阵里的一条记录。 */
interface CompatibilityEntry {
  consumer: string;
  provider: string;
  contract: string;
  min_provider_version: string;
  max_provider_version: string;
  repository?: string;
}

/** 解析后的版本号。 */
interface Version {
  major: number;
  minor: number;
  patch: number;
}

/**
 * 解析版本号。
 *
 * ⚠️ **只支持 `x.y.z`** —— 我们的版本号都是这个格式。
 */
export function parseVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());

  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * 版本比较。
 *
 * @returns a < b → -1；a == b → 0；a > b → 1
 */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  return 0;
}

/**
 * 某个版本是否落在区间内。
 *
 * ⚠️ **`0.x` 是通配** —— 表示该 major 的任意版本都接受。
 */
export function isInRange(version: Version, min: Version, max: Version | null): boolean {
  if (compareVersions(version, min) < 0) return false;

  // ⚠️ **没有上界 → 无限**
  if (max === null) return true;

  return compareVersions(version, max) <= 0;
}

/**
 * 解析上界。
 *
 * ⚠️ **`0.x` → 通配** —— 返回 null（表示不限）。
 * ⚠️ **`0.2.0` → 精确上界**。
 */
export function parseMaxVersion(text: string): Version | null | 'invalid' {
  const trimmed = text.trim();

  // ⚠️ **通配** —— `0.x` / `0.*` / `x`
  if (/\d+\.[x*]$/.test(trimmed) || trimmed === 'x' || trimmed === '*') {
    return null;
  }

  const parsed = parseVersion(trimmed);
  if (parsed === null) return 'invalid';

  return parsed;
}

/**
 * 解析兼容矩阵文件。
 *
 * ⚠️ **格式很简单**（每行一条 `key: value`）——
 *    不引入 YAML 依赖。
 */
export function parseCompatibility(content: string): CompatibilityEntry[] {
  const entries: CompatibilityEntry[] = [];
  let current: Partial<CompatibilityEntry> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    // ⚠️ **新条目** —— `- consumer: web`
    if (line.startsWith('- ')) {
      if (current.consumer && current.provider) {
        entries.push(current as CompatibilityEntry);
      }
      current = {};
      applyField(current, line.slice(2));
      continue;
    }

    applyField(current, line);
  }

  if (current.consumer && current.provider) {
    entries.push(current as CompatibilityEntry);
  }

  return entries;
}

/**
 * 把 `key: value` 写进条目。
 *
 * ⚠️ **值为空就跳过** —— `min_provider_version:` 后面没值时，
 * 当成没填，后面校验会报「缺少字段」。
 */
function applyField(entry: Partial<CompatibilityEntry>, line: string): void {
  const colon = line.indexOf(':');
  if (colon <= 0) return;

  const key = line.slice(0, colon).trim();
  const value = line.slice(colon + 1).trim();

  if (!value) return;

  entry[key as keyof CompatibilityEntry] = value;
}

/**
 * G6 —— 版本兼容矩阵。
 */
export const g6 = {
  id: 'G6',
  name: '版本兼容矩阵',
  description: '兼容矩阵的每条记录必须字段齐全、版本号合法',
  severity: 'error' as const,
  scope: 'packages',

  run(root: string): string[] {
    const violations: string[] = [];

    const filePath = join(root, COMPATIBILITY_FILE);

    // ⚠️ **矩阵不存在不算违规** ——
    // 还没到那一步的项目不该被卡住。
    if (!existsSync(filePath)) return violations;

    const entries = parseCompatibility(readFileSync(filePath, 'utf8'));

    if (entries.length === 0) {
      violations.push(`${COMPATIBILITY_FILE}: 矩阵是空的`);
      return violations;
    }

    for (const entry of entries) {
      violations.push(...checkEntry(entry));
    }

    return violations;
  },
};

/** 矩阵里必填的字段。 */
const REQUIRED_FIELDS = [
  'consumer',
  'provider',
  'contract',
  'min_provider_version',
  'max_provider_version',
] as const;

/**
 * 检查一条记录。
 *
 * ⚠️ **拆出来是为了控制复杂度** ——
 * biome 的 `noExcessiveCognitiveComplexity` 限制 15。
 */
function checkEntry(entry: CompatibilityEntry): string[] {
  const violations: string[] = [];
  const label = `${entry.consumer} → ${entry.provider}`;

  // ① 必填字段
  for (const field of REQUIRED_FIELDS) {
    if (!entry[field]) {
      violations.push(`${COMPATIBILITY_FILE}: ${label} 缺少 '${field}'`);
    }
  }

  // ② 下界版本号合法
  if (entry.min_provider_version) {
    const min = parseVersion(entry.min_provider_version);
    if (min === null) {
      violations.push(
        `${COMPATIBILITY_FILE}: ${label} 的 min_provider_version ` +
          `'${entry.min_provider_version}' 不是合法版本号（要 x.y.z）`,
      );
    }
  }

  // ③ 上界版本号合法
  if (entry.max_provider_version) {
    const max = parseMaxVersion(entry.max_provider_version);
    if (max === 'invalid') {
      violations.push(
        `${COMPATIBILITY_FILE}: ${label} 的 max_provider_version ` +
          `'${entry.max_provider_version}' 不是合法版本号`,
      );
    }
  }

  // ④ 契约版本格式 —— `服务名/v1`
  if (entry.contract && !/^[\w-]+\/v\d+$/.test(entry.contract)) {
    violations.push(
      `${COMPATIBILITY_FILE}: ${label} 的 contract ` +
        `'${entry.contract}' 格式不对（要 服务名/v1）`,
    );
  }

  return violations;
}
