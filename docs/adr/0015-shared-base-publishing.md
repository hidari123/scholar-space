# ADR-0015：共享底座的归属与发布通道

- **状态**：已接受
- **日期**：2026-11-19
- **相关**：[ADR-0001 Polyrepo](./0001-polyrepo.md)、[ADR-0002 AntD 基座](./0002-antd-foundation.md)

---

## 背景

用户明确要求：

> 「PPT / Flow / 社区这类功能都是单独 Git 仓库单独能用的，
> 所有项目共用一套 UI 组件库」

这带来三个必须回答的问题：

1. 独立仓怎么拿到共享的 UI 组件库？
2. Python 侧有没有对应的共享机制？
3. `ui` / `core` 到底是独立仓还是主仓的一部分？

ADR-0001 确立了 polyrepo，但没回答发布通道 —— 这是 polyrepo 的头号风险（版本漂移）。

---

## 决策

### 1. 私有 registry：GitHub Packages

```
npm:  @scholarspace/ui    → https://npm.pkg.github.com
pip:  scholarspace-core  → https://pypi.pkg.github.com/<org>
```

**理由**：
- **零运维** —— 不需要自建 Verdaccio（要维护数据库、备份、升级）
- 与 GitHub Org 同处 —— 权限、包可见性、审计日志一处管完
- CI 原生支持 —— `GITHUB_TOKEN` 直接用
- 支持 npm 与 PyPI 两种生态 —— 一套方案覆盖 TS 和 Python

**代价**：
- 私有包有存储/带宽配额
- GitHub 私有包默认**不公开**（符合「内部闭源」定位）
- 需要 GitHub Org（计划中的 `scholarspace`）

### 2. `ui` 与 `core` 都住主仓

```
scholarspace/                 ← 主仓
├── packages/
│   ├── conventions/           规范唯一来源
│   ├── ui/                    ⭐ 发布到 npm.pkg.github.com
│   ├── core/                  ⭐ 发布到 pypi.pkg.github.com
│   └── contracts/             契约唯一来源
├── apps/                      组装应用
└── cli/                       脚手架

12 个独立子仓：auth llm storage events billing paper slides
                orchestra community federation pdf-viewer
```

**理由**：
1. **省 2 个仓的维护成本** —— 团队 2 人，仓越少越好
2. **规范与底座同仓演进** —— `conventions` 与 `core`/`ui` 有天然耦合
   （core 的分层要匹配 conventions 的 import-linter 契约），
   同仓改一处、一起提交、一起发版
3. **发布产物完全一样** —— 住哪不影响独立仓怎么用
4. **独立仓照样能单独用** —— 装的是发布后的包，不是 git submodule

**关键澄清**：「住主仓」≠「必须 clone 主仓才能用」。

```
独立仓 clone 出来 → npm i @scholarspace/ui → 直接用
                不需要主仓在场
```

### 3. 两种依赖模式

| 模式 | 场景 | 写法 |
|---|---|---|
| **开发态** | 本地多仓联调，改 UI 要立刻在下游生效 | `file:../scholarspace/packages/ui` 或 pnpm workspace 链接 |
| **发布态** | CI / 对外分发 | `"@scholarspace/ui": "^0.1.0"` |

> ⚠️ `file:` 依赖**无法发布**到 npm —— 发布前必须替换为版本号。
> `cli release check` 拦截（Step 0.7 实现）。

---

## 理由（为什么不是其他方案）

### A. 自建 Verdaccio

**否决**：要多养一个服务（数据库、备份、升级、监控）。
GitHub Packages 覆盖同样的需求且零运维。

> 如果将来包数量暴增（>100）或需要跨 Org 分发，再评估自建。

### B. `ui` / `core` 做成完全独立的仓

**否决**：
- 多 2 个仓 = 多 2 套 CI 配置、多 2 个 changelog、多 2 次版本协调
- `core` 的分层必须匹配 `conventions` 的 import-linter 契约 —— 拆仓后
  改契约要跨仓提 PR，容易漂移
- 收益仅是「仓库列表好看一点」

**保留的可能**：若 `ui` 将来要对**外部开源**（如 pdf-viewer 是 MIT），
可以单独把它拆出去 —— 届时它已经是标准 npm 包，拆仓不影响任何消费方。

### C. 用 git submodule / subtree 引用主仓

**否决**：
- submodule 在 CI 上极易出问题（忘了 `--recursive` 就构建失败）
- 消费方被迫持有整个主仓历史
- 与「独立发布」的目标冲突

### D. 纯 monorepo

**否决**：与 ADR-0001 冲突。用户明确要求「每一个都是单独可以成为一个项目」。

---

## 后果

### 正面

- 满足「独立仓单独能用 + 共用一套 UI」的全部要求
- 发布通道明确，无版本漂移隐患
- 规范、底座、契约同仓 —— 演进原子化

### 负面

- 需要 GitHub Org 与 Packages 配置（一次性）
- 主仓变重（承载 2 个发布包）—— 可接受
- 私有包对外部使用者不可见 —— 符合「内部闭源」定位

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| GitHub Packages 配额不够 | 监控用量；>80% 时评估自建 Verdaccio |
| 忘了把 `file:` 换成版本号就发布 | `cli release check` 拦截 |
| 独立仓引用了主仓未发布的 UI 版本 | `cli sync` + 兼容矩阵（`versions/compatibility.yaml`）|
| 主仓 CI 挂了阻塞所有独立仓 | 主仓 CI 只跑共享包的质量门禁；独立仓 CI 跑自己的 |

---

## 待办

| # | 事项 | 何时 |
|---|---|---|
| 1 | 建 GitHub Org `scholarspace` + 12 个空仓 | Step 0.1 |
| 2 | 配置 Packages（npm + PyPI） | Step 0.8 CI |
| 3 | `cli release check` 拦截 `file:` 依赖 | Step 0.7 |
| 4 | `cli sync` 跨仓同步规范 | Step 0.7 |
| 5 | `versions/compatibility.yaml` 兼容矩阵 | Step 0.8 |
