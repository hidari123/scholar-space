/**
 * 工作台页 —— 主仓（集成壳）的首页。
 *
 * ⚠️ **这里不放业务数据** ——
 *    论文库 / 演示文稿 / 编排 / 社区都在各自的独立站里。
 *    工作台只做两件事：
 *      ① 展示各独立站是否在线
 *      ② 提供跳转入口
 *
 * ⚠️ **不聚合业务数据** ——
 *    要聚合就得主仓装 5 个 Python 服务，
 *    那就破坏了「独立部署」的意义。
 *    各站自己有自己的首页。
 */

import {
  Badge,
  Button,
  Card,
  Col,
  Flex,
  Row,
  Space,
  Tag,
  Typography,
  useTranslate,
} from '@scholarspace/ui';

import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { SITES, useSiteStatus } from '../../data/queries';

/**
 * 工作台页。
 */
export function DashboardPage() {
  const t = useTranslate();

  const status = useSiteStatus();

  return (
    <Flex vertical gap="large" style={{ width: '100%' }}>
      <PageHeader
        title={t('app.page.dashboard.title')}
        description={t('app.page.dashboard.description')}
      />

      <QueryState
        loading={status.isPending}
        error={status.error}
        empty={false}
        onRetry={() => void status.refetch()}
        skeletonRows={3}
      >
        <Row gutter={[16, 16]}>
          {SITES.map((site) => {
            const live = status.data?.find((item) => item.id === site.id);

            return (
              <Col xs={24} md={12} lg={8} key={site.id}>
                <Card
                  size="small"
                  title={
                    <Space>
                      {/* ⚠️ **文案走 i18n** —— 不硬编码中文 */}
                      <span>{t(site.labelKey)}</span>
                      <Badge
                        status={live?.available ? 'success' : 'default'}
                        text={
                          live?.available
                            ? t('app.dashboard.site.online')
                            : t('app.dashboard.site.offline')
                        }
                      />
                    </Space>
                  }
                  extra={<Tag>{site.id}</Tag>}
                >
                  <Flex vertical gap="small">
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t('app.dashboard.site.description', { label: t(site.labelKey) })}
                    </Typography.Text>
                    <div>
                      <Button
                        type="primary"
                        disabled={!live?.available}
                        onClick={() => {
                          if (live?.url) window.open(live.url, '_blank', 'noopener');
                        }}
                      >
                        {t('app.dashboard.site.open')}
                      </Button>
                    </div>
                  </Flex>
                </Card>
              </Col>
            );
          })}
        </Row>
      </QueryState>
    </Flex>
  );
}
