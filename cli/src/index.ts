export { main, parseArgs, TEMPLATES } from './cli';
export type { SyncItem, SyncResult, SyncStrategy } from './sync';
export {
  detectBrokenExtends,
  PYTHON_SYNC_ITEMS,
  syncConventions,
  TYPESCRIPT_SYNC_ITEMS,
  writeLocalExtendsGuide,
} from './sync';
export type { Template, TemplateFile, TemplateVars } from './templates';
export { render, toPascalCase, toSnakeCase } from './templates';
export { pythonServiceTemplate } from './templates/python-service';
export { tsPackageTemplate } from './templates/ts-package';
