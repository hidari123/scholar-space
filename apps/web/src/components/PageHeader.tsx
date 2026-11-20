/**
 * 页头 —— 标题 + 描述 + 右侧操作区。
 *
 * ⚠️ **为什么要统一** ——
 *   每个页面的顶部结构都一样（标题、描述、右边按钮），
 *   不统一的话每个页面都要重写一遍间距。
 */

import { Flex, Space, Typography } from '@scholarspace/ui';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** 页面标题。 */
  title: string;
  /** 页面描述（一句话说明这个页面能干什么）。 */
  description?: string | undefined;
  /** 右侧操作区。 */
  actions?: ReactNode;
  /** 标题下的额外内容（比如筛选区）。 */
  extra?: ReactNode;
}

/**
 * 页头。
 */
export function PageHeader({ title, description, actions, extra }: PageHeaderProps) {
  return (
    <Flex vertical gap="middle">
      <Flex justify="space-between" align="flex-start" gap="middle" wrap>
        <Space direction="vertical" size={0}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
        </Space>
        {actions ? <Flex gap="small">{actions}</Flex> : null}
      </Flex>
      {extra}
    </Flex>
  );
}
