/**
 * 内置文案表 —— 合并入口。
 *
 * 类型安全：MessageKey 由各包的文案表联合生成，
 * 缺 key → 编译期报错（而非运行时才发现）。
 *
 * 各业务包（paper / slides / orchestra / community）导出自己的命名空间，
 * 在主站启动时合并进来。
 */

import type { LocaleTable } from '../resolver';
import { enUS } from './common/en-US';
import { zhCN } from './common/zh-CN';

/** 通用文案 key。 */
export type CommonMessageKey = keyof typeof zhCN;

/**
 * 业务包文案表 —— 由主站在启动时注入。
 *
 * 例：paper 包导出 `paperMessages: LocaleTable`，主站合并进来。
 */
export type NamespaceMessages = Record<string, LocaleTable>;

/** 内置文案表（L1）。 */
export const BUILTIN_MESSAGES: LocaleTable = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

/**
 * 合并各业务包的命名空间。
 *
 * @param builtin 内置文案表
 * @param namespaces 业务包文案（形如 `{ paper: { 'zh-CN': {...} } }`）
 */
export function mergeMessages(builtin: LocaleTable, namespaces?: NamespaceMessages): LocaleTable {
  if (!namespaces) return builtin;

  const merged: LocaleTable = { ...builtin };

  for (const table of Object.values(namespaces)) {
    for (const [locale, messages] of Object.entries(table)) {
      merged[locale] = { ...merged[locale], ...messages };
    }
  }

  return merged;
}

/** 导出各语言表，便于类型检查与工具消费。 */
export { enUS, zhCN };
