import { describe, expect, it } from 'vitest';

import {
  buildLocaleTable,
  findPlaceholderMismatches,
  interpolate,
  measureCoverage,
  resolveMessage,
} from './resolver';

const BUILTIN = {
  'zh-CN': {
    'common.action.confirm': '确定',
    'paper.search.result.count': '共 {count} 条',
  },
  'en-US': {
    'common.action.confirm': 'Confirm',
    'paper.search.result.count': '{count} results',
  },
  'ja-JP': {
    'common.action.confirm': '確認',
  },
};

describe('resolveMessage — 5 级回退链', () => {
  it('① overrides 优先级最高', () => {
    const result = resolveMessage('zh-CN', 'common.action.confirm', BUILTIN, {
      'common.action.confirm': '覆盖',
    });
    expect(result).toBe('覆盖');
  });

  it('② 运行时注册的语言表', () => {
    const result = resolveMessage('tlh', 'common.action.confirm', BUILTIN, undefined, {
      tlh: { 'common.action.confirm': 'yImej' },
    });
    expect(result).toBe('yImej');
  });

  it('③ 平台内置', () => {
    expect(resolveMessage('ja-JP', 'common.action.confirm', BUILTIN)).toBe('確認');
  });

  it('④ 英文兜底（内置语言缺该 key）', () => {
    const result = resolveMessage('ja-JP', 'paper.search.result.count', BUILTIN);
    expect(result).toBe('{count} results');
  });

  it('⑤ key 本身（永不 undefined）', () => {
    const result = resolveMessage('zh-CN', 'never.defined.key', BUILTIN);
    expect(result).toBe('never.defined.key');
  });

  it('自定义语言缺 key 时回退到英文', () => {
    const result = resolveMessage('tlh', 'paper.search.result.count', BUILTIN, undefined, {
      tlh: { 'common.action.confirm': 'yImej' },
    });
    expect(result).toBe('{count} results');
  });
});

describe('interpolate — 占位符替换', () => {
  it('替换 {name}', () => {
    expect(interpolate('共 {count} 条', { count: 42 })).toBe('共 42 条');
  });

  it('多个占位符', () => {
    expect(interpolate('{current} / {total}', { current: 3, total: 10 })).toBe('3 / 10');
  });

  it('未提供的变量保留原样', () => {
    expect(interpolate('共 {count} 条', {})).toBe('共 {count} 条');
  });

  it('无 vars 时原样返回', () => {
    expect(interpolate('共 {count} 条')).toBe('共 {count} 条');
  });
});

describe('measureCoverage — 覆盖率', () => {
  it('L1 语言 100%', () => {
    const result = measureCoverage('en-US', BUILTIN);
    expect(result.ratio).toBe(1);
    expect(result.covered).toBe(result.total);
  });

  it('部分覆盖', () => {
    const result = measureCoverage('ja-JP', BUILTIN);
    expect(result.covered).toBe(1);
    expect(result.total).toBe(2);
    expect(result.ratio).toBeCloseTo(0.5);
  });

  it('空基准返回 100%', () => {
    expect(measureCoverage('zh-CN', {}).ratio).toBe(1);
  });
});

describe('findPlaceholderMismatches — 占位符一致性', () => {
  it('一致时不报错', () => {
    const table = {
      'en-US': { 'a.count': '{count} items' },
      'ja-JP': { 'a.count': '{count} 件' },
    };
    expect(findPlaceholderMismatches(table)).toEqual([]);
  });

  it('占位符缺失时报错', () => {
    const table = {
      'en-US': { 'a.count': '{count} items' },
      'ja-JP': { 'a.count': 'items' },
    };
    expect(findPlaceholderMismatches(table)).toEqual(['a.count (en-US vs ja-JP)']);
  });

  it('占位符名称不同时报错', () => {
    const table = {
      'en-US': { 'a.count': '{count} items' },
      'ja-JP': { 'a.count': '{total} 件' },
    };
    expect(findPlaceholderMismatches(table)).toHaveLength(1);
  });
});

describe('buildLocaleTable', () => {
  it('合并内置与自定义', () => {
    const table = buildLocaleTable(BUILTIN, { tlh: { 'common.action.confirm': 'yImej' } });
    expect(table.tlh?.['common.action.confirm']).toBe('yImej');
    expect(table['zh-CN']?.['common.action.confirm']).toBe('确定');
  });

  it('无自定义时返回内置', () => {
    expect(buildLocaleTable(BUILTIN)).toEqual(BUILTIN);
  });
});
