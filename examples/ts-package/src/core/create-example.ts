/**
 * core 层 —— 纯业务逻辑（无 React、无 DOM）。
 */

import { ValidationError } from './errors';
import type { CreateExampleInput, Example } from './types';

/**
 * 创建示例 —— 领域规则校验 + 构造。
 *
 * ⚠️ 纯函数，无副作用，可在任何环境运行。
 */
export function createExample(input: CreateExampleInput): Example {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ValidationError('name cannot be empty', { field: 'name' });
  }

  return {
    exampleId: `example-${Date.now()}`,
    name,
    createdAt: new Date(),
  };
}

/**
 * 格式化示例名称 —— 用于展示。
 */
export function formatExampleName(example: Example): string {
  return `${example.name} (${example.exampleId})`;
}
