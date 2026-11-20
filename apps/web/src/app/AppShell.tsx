/**
 * 应用外壳 —— 顶栏 + 侧栏 + 内容区。
 *
 * ⚠️ **主仓是「集成壳」** ——
 *    侧栏的导航项是**到各独立站的跳转**，
 *    不是主仓内部的路由。
 *
 * ⚠️ **为什么用跳转而不是 iframe** ——
 *    各站是独立部署的完整工具（不是页面片段），
 *    iframe 会带来跨域、主题同步、焦点管理一堆问题，
 *    反而把「独立上线」的优势全抵消了。
 *
 * ⚠️ **统一身份靠 token，不靠嵌入** ——
 *    各站自己验 identity 发的 JWT。
 */

import {
  Avatar,
  Button,
  Drawer,
  Layout,
  Menu,
  Space,
  Typography,
  useTranslate,
} from '@scholarspace/ui';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { SettingsPanel } from '../components/SettingsPanel';

/**
 * 应用外壳。
 */
export function AppShell() {
  const t = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ⚠️ **导航项放在组件里** —— 文案要过 t()。
  //
  // ⚠️ **`href` 为空的项暂时只留在主仓** ——
  //    各独立站还没部署，URL 还没定。
  //    配好了就能跳转。
  const navItems = [
    { key: '/', label: t('app.nav.dashboard'), href: '' },
    { key: '/papers', label: t('app.nav.papers'), href: '' },
    { key: '/slides', label: t('app.nav.slides'), href: '' },
    { key: '/orchestra', label: t('app.nav.orchestra'), href: '' },
    { key: '/community', label: t('app.nav.community'), href: '' },
    { key: '/identity', label: t('app.nav.identity'), href: '' },
  ];

  // ⚠️ **选中项按最长前缀匹配** ——
  // `/papers/123` 也要高亮 `/papers`。
  const selectedKey =
    navItems.find((item) => item.key !== '/' && location.pathname.startsWith(item.key))?.key ??
    (location.pathname === '/' ? '/' : '');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 24,
        }}
      >
        <Typography.Text strong style={{ fontSize: 18, color: 'inherit' }}>
          {t('app.name')}
        </Typography.Text>

        <Space>
          <Button type="text" onClick={() => setSettingsOpen(true)}>
            {t('common.action.edit')}
          </Button>
          <Avatar size="small">SS</Avatar>
        </Space>
      </Layout.Header>

      <Layout>
        <Layout.Sider width={200}>
          <Menu
            mode="inline"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={navItems.map((item) => ({
              key: item.key,
              label: item.label,
              onClick: () => {
                // ⚠️ **有独立站地址就跳转，没有就留在主仓** ——
                //    等各站部署好，填上 URL 即可。
                if (item.href) {
                  window.open(item.href, '_blank', 'noopener');
                  return;
                }
                navigate(item.key);
              },
            }))}
          />
        </Layout.Sider>

        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>

      <Drawer
        title={t('common.action.edit')}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width={360}
      >
        <SettingsPanel />
      </Drawer>
    </Layout>
  );
}
