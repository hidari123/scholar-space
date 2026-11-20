# web

scholarspace 主站前端。

## ⚠️ 组件只能从 `@scholarspace/ui` 拿

```tsx
import { Button, Select } from '@scholarspace/ui';
```

**不能** `import { Button } from 'antd'` —— 护栏 G7 会阻断。

⚠️ **为什么** —— 换组件库时只改一处；
业务包不直接依赖 antd → 版本不冲突。

## ⚠️ 只跟网关说话

```ts
import { request } from './core/api-client';

const papers = await request<Paper[]>('/v1/papers/search', { method: 'POST', body: {...} });
```

⚠️ **前端不知道各个独立服务在哪** ——
网关负责路由映射，这样切流时前端零改动。

## 统一响应信封

```ts
interface ApiResponse<T> {
  code: number;      // 业务错误码，0 = 成功
  message: string;   // 优先是 i18n key
  data: T | null;
  request_id: string;
  timestamp: string;
}
```

⚠️ **HTTP 200 不代表成功** —— 业务错误码在信封里。

⚠️ **HTTP 层错误和业务层错误分开**：
HTTP 5xx 是服务挂了，业务 `code != 0` 是业务拒绝。

## 偏好持久化

⚠️ **只存「用户选了啥」，不存「算出来的结果」** ——
比如不存 AntD 的 locale 对象，只存 `'zh-CN'`。

⚠️ **localStorage 存不下就当没存** ——
隐私模式下会抛异常，不能让整个应用崩掉。

## 主题

⚠️ **预设 + 用户自定义色** ——
自定义色优先于预设的 `colorPrimary`。

⚠️ **`'system'` 对应 AntD 的 `'auto'`** ——
两套命名不一样，这里做一次映射。

## 目录

```
src/
├── api/            API 客户端
├── components/     业务组件
├── core/           客户端核心（API / 偏好）
├── app/            路由 + 外壳 + 页面
└── main.tsx        浏览器入口
```
