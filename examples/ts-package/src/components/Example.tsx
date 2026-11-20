/**
 * components 层 —— React 组件。
 *
 * ⚠️ 只依赖 core + @scholarspace/ui，不碰业务实现。
 */

import type { Example } from '../core';

export interface ExampleProps {
  /** 要展示的示例。 */
  example: Example;
  /** 是否显示创建时间。 */
  showCreatedAt?: boolean;
  /** 点击回调 —— 不传则不渲染按钮（G4 动作注入模式）。 */
  onSelect?: (example: Example) => void;
}

/**
 * 示例卡片 —— 演示组件层的写法。
 */
export function ExampleCard({ example, showCreatedAt = false, onSelect }: ExampleProps) {
  return (
    <article className="example-card">
      <h3 className="example-card__title">{example.name}</h3>
      {showCreatedAt ? (
        <time className="example-card__time" dateTime={example.createdAt.toISOString()}>
          {example.createdAt.toLocaleDateString()}
        </time>
      ) : null}
      {onSelect ? (
        <button type="button" className="example-card__action" onClick={() => onSelect(example)}>
          Select
        </button>
      ) : null}
    </article>
  );
}
