/**
 * core 层 —— 纯逻辑，零 React、零 DOM。
 *
 * ⚠️ 可被 Node / Worker / SSR 直接 import。
 *    见 packages/conventions/typescript/eslint-boundaries.base.json 的 G3-1。
 */

/** 示例实体。 */
export interface Example {
  readonly exampleId: string;
  readonly name: string;
  readonly createdAt: Date;
}

/** 创建示例的输入。 */
export interface CreateExampleInput {
  readonly name: string;
}
