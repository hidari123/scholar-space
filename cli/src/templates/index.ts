/**
 * 模板注册表 —— 内置模板。
 *
 * ⚠️ 放在这里而不是 cli.ts —— 否则 cli.ts 要 import 模板，
 *    模板又要 import cli.ts（循环依赖）。
 */

import type { Template } from '../templates';
import { pythonServiceTemplate } from './python-service';
import { tsPackageTemplate } from './ts-package';

export { pythonServiceTemplate, tsPackageTemplate };

/** 全部内置模板。 */
export const TEMPLATES: Record<string, Template> = {
  [pythonServiceTemplate.id]: pythonServiceTemplate,
  [tsPackageTemplate.id]: tsPackageTemplate,
};
