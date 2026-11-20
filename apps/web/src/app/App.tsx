/**
 * 应用根组件 —— Provider + 路由。
 *
 * ⚠️ **Provider 顺序不能反** ——
 * 主题 Provider 在外，i18n 在内：
 * AntD 的 locale 依赖 i18n 的 locale 值。
 */

import {
  BRAND_PRESETS,
  type BrandConfig,
  DEFAULT_BRAND,
  ScholarSpaceProvider,
} from '@scholarspace/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { usePreferences } from '../core/preferences';
import { APP_MESSAGES } from '../i18n';

import { AppShell } from './AppShell';
import { DashboardPage } from './pages';

/**
 * 路由表。
 *
 * ⚠️ **主仓是「集成壳」** ——
 *    业务功能都在各自的独立仓里（各自独立部署）。
 *    这里只保留工作台，以及到各独立站的跳转入口。
 */
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <DashboardPage /> }],
  },
]);

/**
 * 应用根组件。
 */
export function App() {
  const preferences = usePreferences();

  // ⚠️ **预设 + 用户自定义色** ——
  // 自定义色优先于预设的 colorPrimary。
  //
  // ⚠️ **索引访问可能是 undefined** ——
  // `noUncheckedIndexedAccess` 开启后，
  // `BRAND_PRESETS[xxx]` 的类型是 `BrandPreset | undefined`。
  //
  // ⚠️ **不用 `!` 断言** ——
  // 断言只是骗过编译器，真出问题时反而更隐蔽。
  // 这里显式处理 undefined。
  const preset = BRAND_PRESETS[preferences.preset];

  // ⚠️ **BrandConfig.colorPrimary 是必填** ——
  // 预设里的 `brand` 是 Partial，
  // 所以要么用预设的值，要么用默认品牌的值。
  const brand: BrandConfig = {
    ...DEFAULT_BRAND,
    ...preset?.brand,
    ...(preferences.brandColor ? { colorPrimary: preferences.brandColor } : {}),
  };

  return (
    <ScholarSpaceProvider
      brand={brand}
      locale={preferences.locale}
      // ⚠️ **主站文案** —— 通过 namespaces 合并，
      //    这样 `common.*` 那些公共文案不会丢。
      namespaces={{ app: APP_MESSAGES }}
      preferences={{
        // ⚠️ **'system' 对应 AntD 的 'auto'** ——
        // 两套命名不一样，这里做一次映射。
        mode: preferences.colorMode === 'system' ? 'auto' : preferences.colorMode,
        density: preferences.density === 'compact' ? 'compact' : 'default',
      }}
    >
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: {
                // ⚠️ **重试 2 次** —— 网络抖动不该直接报错
                retry: 2,
                // ⚠️ **不自动刷新** —— 学术数据不会秒级变化
                staleTime: 30_000,
              },
            },
          })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ScholarSpaceProvider>
  );
}
