/**
 * 项目模板 —— 脚手架的产出形状。
 *
 * ⚠️ 模板与 conventions 同源：
 *   生成的包天生合规，不需要事后整改。
 *
 * 每个模板声明：
 *   - 要生成哪些文件
 *   - 文件内容（占位符替换）
 *   - 后续要跑的验证命令
 */

/** 占位符替换表。 */
export interface TemplateVars {
  /** 项目名（kebab-case）。 */
  name: string;
  /** Python 包名（snake_case）。 */
  packageName?: string;
  /** npm 包名。 */
  scopeName?: string;
  /** 项目一句话描述。 */
  description?: string;
  /** 作者。 */
  author?: string;
  /** Python 版本。 */
  pythonVersion?: string;
}

/** 模板里的一个文件。 */
export interface TemplateFile {
  /** 目标路径（相对项目根）。 */
  path: string;
  /** 文件内容模板。 */
  content: string;
  /** 是否可执行（脚本）。 */
  executable?: boolean;
}

/** 模板定义。 */
export interface Template {
  /** 模板 ID。 */
  id: string;
  /** 模板名。 */
  name: string;
  /** 一句话说明。 */
  description: string;
  /** 语言。 */
  language: 'python' | 'typescript';
  /** 生成文件。 */
  files: TemplateFile[];
  /** 生成后要跑的验证命令。 */
  verifyCommands: string[];
}

/**
 * 占位符替换。
 *
 * 用 `{{name}}` 形式，避免与模板语法冲突。
 */
export function render(template: string, vars: TemplateVars): string {
  const replacements: Record<string, string> = {
    name: vars.name,
    packageName: vars.packageName ?? vars.name.replace(/-/g, '_'),
    scopeName: vars.scopeName ?? `@scholarspace/${vars.name}`,
    description: vars.description ?? `${vars.name} —— scholarspace 子项目`,
    author: vars.author ?? 'scholarspace',
    pythonVersion: vars.pythonVersion ?? '3.13',
  };

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => replacements[key] ?? match);
}

/**
 * kebab-case → snake_case。
 */
export function toSnakeCase(name: string): string {
  return name.replace(/-/g, '_');
}

/**
 * kebab-case → PascalCase。
 */
export function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
