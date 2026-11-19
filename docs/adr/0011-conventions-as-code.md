# ADR-0011：规范以可执行配置承载

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

项目涉及 13 个子项目、2 种语言、约 30 万行代码。若规范只存在于文档或口头约定，必然出现：

- 各包风格不一致
- 新人不知道边界在哪
- 规范演进后要逐包整改
- 评审依赖人的自觉

用户明确要求"代码规范化需要一开始就定义出来"。

---

## 决策

### 1. 规范载体 = `packages/conventions/` 下的可执行配置文件

```
packages/conventions/
├── python/{ruff.toml, mypy.ini, pytest.ini, import-linter.base.toml, pyproject.base.toml}
├── typescript/{tsconfig.base.json, biome.json, vitest.base.ts, eslint-boundaries.base.json, package.base.json}
├── api/{response.schema.json, error-codes.json, pagination.schema.json}
├── i18n/{messages.schema.json, key-patterns.json}
├── theme/{brand.schema.json, presets.json}
└── naming/{python.json, typescript.json}
```

### 2. 所有子项目 `extends` 这些 base

```toml
[tool.ruff]
extend = "../../packages/conventions/python/ruff.toml"
```
```json
{ "extends": "../../packages/conventions/typescript/tsconfig.base.json" }
```

### 3. 规范演进流程

```
① 改 conventions/base 文件
② CI 自动在所有子项目报违规
③ 逐包修复（或加带到期日的豁免）
④ 合并
```

**规范演进成本 = 改 1 个文件**，而不是改 N 个包 + N 份文档。

### 4. 文档与配置的关系

- **配置**（`conventions/`）= 怎么执行（机器可读）
- **文档**（`05-代码规范.md`）= 为什么（人可读）
- 两者必须同步，CI 检查文档引用的文件名存在

### 5. 豁免机制

允许有记录的例外，但必须：
- 带 `# TODO(owner): 移除条件` 注释
- 有到期日
- CI 检查豁免总数**不增长**（超基线报错）

---

## 理由

### 1. 文档规范必然腐化

文档不会被执行。半年后新代码会按当时理解写，而不是按文档写。

配置会**强制**。

### 2. base + extends 是唯一可规模化的方案

13 个包 × 2 语言 = 26 份配置副本 → 规范一改要改 26 次。

`extends` 机制下：改 1 个 base → 26 个包自动跟随。

### 3. 脚手架与规范同源（关键设计）

```
conventions/  ← 唯一规范来源
     ↑ extends
cli/templates/  ← 模板继承 base
     ↑ 生成
new-project/    ← 天生合规
```

**新项目不需要"事后整改"** —— 这是 Polyrepo 下最容易失控的地方。

### 4. 护栏是可执行的判断，不是主观判断

例："domain 层不能依赖 sqlalchemy" —— 用 `import-linter` 是二值判定，人工评审是主观判断。

### 5. 豁免机制防止"规范一刀切"

真实项目总有例外。硬堵会导致规范被整体绕过（"这个项目例外太多，算了"）。有记录的豁免是平衡。

---

## 备选方案

### A. 只写文档规范

**否决**：不会被执行，必然腐化。这是当前 `scholar-club-backend` 的状况（README 里有规范，但代码 173 处复制粘贴）。

### B. 每个包独立配置

**否决**：26 份副本，规范演进成本 O(N)。且各包会漂移。

### C. 中心化 lint 服务

**否决**：增加基础设施复杂度；本地开发体验差（要起服务才能 lint）。`extends` 是本地零依赖方案。

### D. 纯"最强规则"（不管例外）

**否决**：会导致规范被整体放弃。豁免机制是必要的现实主义。

---

## 后果

### 正面
- 规范**必然**被执行
- 规范演进出成本 = 改 1 个文件
- 新项目天生合规（脚手架继承）
- 判断客观（二值），评审聚焦设计而非风格
- 有例外空间，且例外可见可追踪

### 负面
- **需要额外的工具链配置工作**（约 3-5 天）
- 跨仓 `extends` 用相对路径，**需要约定目录结构**（`packages/conventions` 与子仓的相对位置）→ 用 `scholarspace dev setup` 统一布局解决
- base 文件变更会**同时影响所有仓** → 需要协调发版节奏
- 豁免管理本身有成本

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 跨仓相对路径脆弱 | `scholarspace dev setup` 统一把各子仓 clone 到固定相对位置；CI 中校验路径 |
| base 变更影响面大 | base 变更走独立 PR，附影响面清单；提供 `guards run --scope <pkg>` 局部试跑 |
| 规范过严阻塞开发 | 豁免机制 + 分级（阻断/警告）；初期只上阻断级，警告级逐步加 |
| 没人维护 base | base 归属主项目，变更需 ADR；`conventions/README.md` 写变更流程 |

---

## 落地顺序

规范必须**先于**第一个业务子项目落地，否则后续全部返工。

| 阶段 | 落地内容 |
|---|---|
| **M0** | `conventions/` 全量 + 脚手架继承 + 核心护栏（G7 G8 G12 G13 G14 G15 G16 G17 G19）|
| M1 | 依赖护栏（G1 G2 G3 G4 G5 G6）|
| M2 | 样式护栏（G9 G10 G11）|
| M3+ | 质量与发布护栏（G18 G20 G21 G22 G23）|
