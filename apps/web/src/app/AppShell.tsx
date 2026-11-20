/**
 * 应用外壳 —— 顶栏 + 侧栏 + 内容区。
 *
 * ⚠️ **所有页面共用这一个外壳** ——
 * 语言切换、主题切换、导航都在这里，
 * 各页面只管自己的内容。
 */

import { Avatar, Button, Drawer, Layout, Menu, Space, Typography } from '@scholarspace/ui';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { SettingsPanel } from '../components/SettingsPanel';

/** 导航项。 */
const NAV_ITEMS = [
  { key: '/', label: '首页' },
  { key: '/papers', label: '论文库' },
  { key: '/slides', label: '演示文稿' },
  { key: '/community', label: '社区' },
  { key: '/orchestra', label: '编排' },
];

/**
 * 应用外壳。
 */
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ⚠️ **选中项按最长前缀匹配** ——
  // `/papers/123` 也要高亮 `/papers`。
  const selectedKey =
    NAV_ITEMS.find((item) => item.key !== '/' && location.pathname.startsWith(item.key))?.key ??
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
          ScholarSpace
        </Typography.Text>

        <Space>
          <Button type="text" onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
          <Avatar size="small">SS</Avatar>
        </Space>
      </Layout.Header>

      <Layout>
        <Layout.Sider width={200}>
          <Menu
            mode="inline"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={NAV_ITEMS.map((item) => ({
              key: item.key,
              label: item.label,
              onClick: () => navigate(item.key),
            }))}
          />
        </Layout.Sider>

        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>

      <Drawer title="设置" open={settingsOpen} onClose={() => setSettingsOpen(false)} width={360}>
        <SettingsPanel />
      </Drawer>
    </Layout>
  );
}
