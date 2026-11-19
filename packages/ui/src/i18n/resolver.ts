/**
 * 文案解析器 —— 5 级回退链。
 *
 * 顺序（优先级高 → 低）：
 *   ① overrides[key]              运行时覆盖
 *   ② locales[locale][key]        运行时注册（自定义语言）
 *   ③ BUILTIN[locale][key]        平台内置
 *   ④ BUILTIN['en-US'][key]       内置英文兜底
 *   ⑤ key 本身                    永不 undefined
 *
 * ⚠️ 第 4 级兜底英文而非中文：未配全的语言用中文会「中英混杂」，
 *    用英文至少是**一致的一种语言**。
 *
 * 设计源自 scholar-pdf-viewer 的 resolveMessage()（已验证），
 * 本实现增加命名空间与类型安全。
 */

/** 文案表 —— key → 文案。 */
export type MessageTable = Record<string, string>;

/** 部分文案表（宿主只需写关心的部分）。 */
export type PartialMessageTable = Record<string, string | undefined>;

/** 语言表 —— locale → 文案。 */
export type LocaleTable = Record<string, PartialMessageTable>;

/** 占位符变量。 */
export type MessageVars = Record<string, string | number>;

/**
 * 替换 `{name}` 占位符。
 *
 * 未提供的变量保留原样（便于发现遗漏）。
 */
export function interpolate(template: string, vars?: MessageVars): string {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * 解析文案。
 *
 * @param locale 当前语言
 * @param key 文案 key
 * @param builtin 内置文案表（locale → 文案）
 * @param overrides 当前 locale 的运行时覆盖
 * @param locales 运行时注册的语言表
 * @param vars 占位符变量
 */
export function resolveMessage(
  locale: string,
  key: string,
  builtin: LocaleTable,
  overrides?: PartialMessageTable,
  locales?: LocaleTable,
  vars?: MessageVars,
): string {
  const template =
    overrides?.[key] ??
    locales?.[locale]?.[key] ??
    builtin[locale]?.[key] ??
    builtin['en-US']?.[key] ??
    key;

  return interpolate(template, vars);
}

/**
 * 合并语言表（内置 + 运行时注册）。
 *
 * 纯函数 → 宿主可在运行时动态切换语言表。
 */
export function buildLocaleTable(builtin: LocaleTable, custom?: LocaleTable): LocaleTable {
  return { ...builtin, ...(custom ?? {}) };
}

/**
 * 统计某语言的覆盖率。
 *
 * @param locale 目标语言
 * @param builtin 内置文案表
 * @param baseline 基准语言（默认 en-US）
 */
export function measureCoverage(
  locale: string,
  builtin: LocaleTable,
  baseline = 'en-US',
): { covered: number; total: number; ratio: number } {
  const baseKeys = Object.keys(builtin[baseline] ?? {});
  if (baseKeys.length === 0) return { covered: 0, total: 0, ratio: 1 };

  const target = builtin[locale] ?? {};
  const covered = baseKeys.filter((key) => typeof target[key] === 'string').length;

  return {
    covered,
    total: baseKeys.length,
    ratio: covered / baseKeys.length,
  };
}

/**
 * 校验跨语言的占位符一致性。
 *
 * 同一 key 在不同语言的占位符集合必须相同：
 *   en: "共 {count} 条"  vs  ja: "合計 {count} 件"  ✅
 *   en: "共 {count} 条"  vs  ja: "合計 件"          ❌
 *
 * @returns 不一致的 key 列表
 */
export function findPlaceholderMismatches(builtin: LocaleTable, baseline = 'en-US'): string[] {
  const base = builtin[baseline] ?? {};
  const mismatches: string[] = [];

  const placeholderPattern = /\{(\w+)\}/g;
  const extract = (text: string): string[] =>
    [...text.matchAll(placeholderPattern)].map((match) => match[1] ?? '').sort();

  for (const [locale, table] of Object.entries(builtin)) {
    if (locale === baseline) continue;

    for (const [key, template] of Object.entries(table)) {
      const baseTemplate = base[key];
      if (baseTemplate === undefined) continue;

      const basePlaceholders = extract(baseTemplate);
      const targetPlaceholders = extract(template ?? '');

      if (
        basePlaceholders.length !== targetPlaceholders.length ||
        basePlaceholders.some((value, index) => value !== targetPlaceholders[index])
      ) {
        mismatches.push(`${key} (${baseline} vs ${locale})`);
      }
    }
  }

  return mismatches;
}
