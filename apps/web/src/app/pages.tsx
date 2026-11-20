/**
 * 页面 —— 五个模块的占位页。
 *
 * ⚠️ **占位页也要能跑** ——
 * 先把壳子搭起来，各模块的页面后续填。
 *
 * ⚠️ **用 `useI18n` 而不是硬编码文案** ——
 * 但**语言包还没做好**，所以先写死并在注释里说明。
 */

import { Card, Empty, Flex, Typography } from '@scholarspace/ui';

/** 页面 Props。 */
interface PageProps {
  /** 页面标题。 */
  title: string;
  /** 页面描述。 */
  description: string;
}

/**
 * 占位页。
 */
function PlaceholderPage({ title, description }: PageProps) {
  return (
    <Flex vertical gap="large" style={{ width: '100%' }}>
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Text type="secondary">{description}</Typography.Text>
      <Card>
        <Empty description="该模块即将上线" />
      </Card>
    </Flex>
  );
}

/** 首页。 */
export function HomePage() {
  return (
    <PlaceholderPage
      title="ScholarSpace"
      description="学术工作空间 —— 论文检索、演示文稿生成、学术社区、流程编排。"
    />
  );
}

/** 论文库。 */
export function PapersPage() {
  return (
    <PlaceholderPage title="论文库" description="检索 arXiv / Crossref，支持四级查重与全文解析。" />
  );
}

/** 演示文稿。 */
export function SlidesPage() {
  return (
    <PlaceholderPage
      title="演示文稿"
      description="从论文或主题生成 PPTX，8 套学术主题、14 种版式、溢出四级降级。"
    />
  );
}

/** 社区。 */
export function CommunityPage() {
  return (
    <PlaceholderPage
      title="社区"
      description="三种时间线、AI 内容审核、发帖奖励（每日上限 300 币）。"
    />
  );
}

/** 编排。 */
export function OrchestraPage() {
  return (
    <PlaceholderPage title="编排" description="流程编排引擎 —— 节点市场、运行调度、SSE 事件流。" />
  );
}
