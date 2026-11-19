export { main, parseArgs, runHelp, runList } from './cli';
export { runNew } from './commands/new';
export { runCheck, runSync } from './commands/sync-commands';
export type { Command, CommandContext } from './core/command';
export { KERNEL_COMMANDS } from './core/command';
export type {
  PluginCommand,
  PluginContext,
  PluginLoadResult,
  PluginModule,
} from './core/plugin';
export {
  discoverPlugins,
  extractCommands,
  loadPlugin,
  readPluginManifest,
} from './core/plugin';
export type { SyncItem, SyncResult, SyncStrategy } from './core/sync';
export {
  detectBrokenExtends,
  PYTHON_SYNC_ITEMS,
  syncConventions,
  TYPESCRIPT_SYNC_ITEMS,
  writeLocalExtendsGuide,
} from './core/sync';
export type { Template, TemplateFile, TemplateVars } from './templates';
export { render, toPascalCase, toSnakeCase } from './templates';
export { pythonServiceTemplate } from './templates/python-service';
export { tsPackageTemplate } from './templates/ts-package';
