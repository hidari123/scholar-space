/**
 * 命令行参数传递 —— 回归测试。
 *
 * ⚠️ 这组测试是为了钉住一个**静默失败**的 bug：
 *
 *   `parseArgs` 正确解析了 flags，但分发时只传了 `positional`：
 *
 *       return builtinMatch.run(positional, context);   // ← flags 没进去
 *
 *   后果（全部是**静默**降级，不报错）：
 *     · `sync --kind typescript` → 跑成 python
 *     · `new x --template ts-package` → 生成 Python 项目
 *
 *   静默失败比崩溃难发现得多 —— 所以必须有测试钉住。
 */

import { describe, expect, it } from 'vitest';

import { parseArgs, resolveInvocation } from './cli';

describe('parseArgs', () => {
  it('解析命令与位置参数', () => {
    /** 基础解析。 */
    const result = parseArgs(['new', 'my-service']);
    expect(result.command).toBe('new');
    expect(result.positional).toEqual(['my-service']);
  });

  it('解析字符串标志', () => {
    /** --key value 形式。 */
    const result = parseArgs(['new', 'x', '--template', 'python-service']);
    expect(result.flags.template).toBe('python-service');
  });

  it('解析布尔标志', () => {
    /** --key 后面没有值 → true。 */
    const result = parseArgs(['check', '--strict']);
    expect(result.flags.strict).toBe(true);
  });

  it('标志在位置参数之前也能解析', () => {
    /** 顺序不应影响解析。 */
    const result = parseArgs(['--kind', 'typescript', 'sync']);
    expect(result.command).toBe('sync');
    expect(result.flags.kind).toBe('typescript');
  });

  it('默认命令是 help', () => {
    /** 空参数 → help。 */
    expect(parseArgs([]).command).toBe('help');
  });
});

describe('resolveInvocation —— flags 必须进 context', () => {
  /** ⚠️ 这组是核心回归测试。 */

  it('flags 出现在 context 里', () => {
    /** 之前 flags 只在 parseArgs 的返回值里，没进 context。 */
    const { context } = resolveInvocation(['sync', '--kind', 'typescript'], '/cwd', '/repo');

    expect(context.flags.kind).toBe('typescript');
  });

  it('sync 的 --kind typescript 不会退化成 python', () => {
    /** ⚠️ 这正是那个静默 bug。 */
    const { context } = resolveInvocation(['sync', '--kind', 'typescript'], '/cwd', '/repo');

    expect(context.flags.kind).toBe('typescript');
    expect(context.flags.kind).not.toBe('python');
  });

  it('new 的 --template 能取到', () => {
    /** ⚠️ 之前 `--template ts-package` 被忽略，生成 Python 项目。 */
    const { context } = resolveInvocation(
      ['new', 'x', '--template', 'ts-package'],
      '/cwd',
      '/repo',
    );

    expect(context.flags.template).toBe('ts-package');
  });

  it('new 的 --description 能取到', () => {
    /** 描述也要能传。 */
    const { context } = resolveInvocation(
      ['new', 'x', '--description', '我的项目'],
      '/cwd',
      '/repo',
    );

    expect(context.flags.description).toBe('我的项目');
  });

  it('--target 决定 context.target', () => {
    /** --target 指向的目标目录。 */
    const { context } = resolveInvocation(['sync', '--target', '/somewhere'], '/cwd', '/repo');

    expect(context.target).toContain('somewhere');
  });

  it('没有 --target 时用 cwd', () => {
    /** 默认目标是当前目录。 */
    const { context } = resolveInvocation(['sync'], '/cwd', '/repo');

    expect(context.target).toBe('/cwd');
  });

  it('位置参数与 flags 分开', () => {
    /** 位置参数进 positional，flags 进 flags。 */
    const { positional, context } = resolveInvocation(
      ['new', 'my-service', '--template', 'ts-package'],
      '/cwd',
      '/repo',
    );

    expect(positional).toEqual(['my-service']);
    expect(context.flags.template).toBe('ts-package');
  });

  it('布尔标志也能进 context', () => {
    /** --strict 这类无值标志。 */
    const { context } = resolveInvocation(['verify', '--strict'], '/cwd', '/repo');

    expect(context.flags.strict).toBe(true);
  });

  it('多个 flags 同时存在', () => {
    /** 多个标志互不干扰。 */
    const { context } = resolveInvocation(
      ['sync', '--kind', 'typescript', '--target', '/x', '--force'],
      '/cwd',
      '/repo',
    );

    expect(context.flags.kind).toBe('typescript');
    expect(context.flags.target).toBe('/x');
    expect(context.flags.force).toBe(true);
  });

  it('projectRoot 与 cwd 分开传递', () => {
    /** 主仓根与当前目录是两个不同的值。 */
    const { context } = resolveInvocation(['help'], '/cwd', '/repo');

    expect(context.cwd).toBe('/cwd');
    expect(context.projectRoot).toBe('/repo');
  });
});
