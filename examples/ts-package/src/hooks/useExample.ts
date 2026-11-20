/**
 * hooks 层 —— React hooks。
 */

import { useCallback, useMemo, useState } from 'react';
import type { Example } from '../core';
import { createExample } from '../core';

export interface UseExampleResult {
  readonly example: Example | null;
  readonly create: (name: string) => void;
  readonly reset: () => void;
}

/**
 * 管理一个示例的创建与重置。
 */
export function useExample(initialName = ''): UseExampleResult {
  const [example, setExample] = useState<Example | null>(null);

  const create = useCallback(
    (name: string) => {
      setExample(createExample({ name: name || initialName }));
    },
    [initialName],
  );

  const reset = useCallback(() => {
    setExample(null);
  }, []);

  return useMemo(() => ({ example, create, reset }), [example, create, reset]);
}
