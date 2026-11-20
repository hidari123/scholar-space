/**
 * 三态容器 —— 加载中 / 出错了 / 空数据。
 *
 * ⚠️ **为什么需要它** ——
 *   每个列表页面都要处理这三种状态。
 *   写三遍必然写错，漏一处就出现「白屏」——
 *   用户看到一片空白，以为没数据，其实是请求失败了。
 *
 * ⚠️ **错误必须能被人看到** ——
 *   静默失败比报错更糟。
 */

import {
  Alert,
  Button,
  Empty,
  Result,
  Skeleton,
  Space,
  Typography,
  useTranslate,
} from '@scholarspace/ui';
import type { ReactNode } from 'react';

export interface QueryStateProps {
  /** 是不是正在加载。 */
  loading: boolean;
  /** 错误对象（`null` 表示没错误）。 */
  error: unknown;
  /** 是不是空数据。 */
  empty: boolean;
  /** 重新拉取。 */
  onRetry?: (() => void) | undefined;
  /** 空状态的主文案。 */
  emptyText?: string | undefined;
  /** 空状态的补充说明。 */
  emptyHint?: string | undefined;
  /** 加载时显示几行骨架。 */
  skeletonRows?: number | undefined;
  /** 正常内容。 */
  children: ReactNode;
}

/**
 * 三态容器。
 */
export function QueryState({
  loading,
  error,
  empty,
  onRetry,
  emptyText,
  emptyHint,
  skeletonRows = 4,
  children,
}: QueryStateProps) {
  const t = useTranslate();

  // ⚠️ **错误优先于加载** ——
  //    请求失败后 `isPending` 会变成 false，
  //    但如果先判 loading，失败的瞬间会闪一下骨架。
  if (error) {
    return (
      <Result
        status="error"
        title={t('app.state.error')}
        subTitle={describeError(error)}
        extra={
          onRetry ? (
            <Button type="primary" onClick={onRetry}>
              {t('app.state.retry')}
            </Button>
          ) : null
        }
      />
    );
  }

  if (loading) {
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Skeleton active paragraph={{ rows: skeletonRows }} />
      </Space>
    );
  }

  if (empty) {
    return (
      <Empty
        description={
          <Space direction="vertical" size="small">
            <Typography.Text type="secondary">{emptyText ?? t('app.state.empty')}</Typography.Text>
            {emptyHint ? <Typography.Text type="secondary">{emptyHint}</Typography.Text> : null}
          </Space>
        }
      />
    );
  }

  return <>{children}</>;
}

/**
 * 把错误转成能给人看的文案。
 *
 * ⚠️ **别把原始异常直接扔给用户** ——
 *    但也别藏起来（「操作失败」等于没说）。
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    // ⚠️ **API 客户端的错误信息已经是人话** ——
    //    它把状态码翻译成了「服务暂时不可用」之类。
    return error.message;
  }

  if (typeof error === 'string') return error;

  return '未知错误';
}

/**
 * 行内错误提示 —— 用于「表格加载出来了，但某一块失败了」的场景。
 */
export function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslate();

  if (!error) return null;

  return (
    <Alert
      type="error"
      showIcon
      message={describeError(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            {t('app.state.retry')}
          </Button>
        ) : null
      }
    />
  );
}
