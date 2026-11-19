# packages/conventions — 规范唯一来源

> 所有子项目 `extends` 这些 base 配置。**规范演进 = 改这里一处。**

---

## 为什么在这里

Polyrepo 的最大风险是 **13 个仓各自为政**。规范如果只写在文档里，必然腐化。

本目录把规范变成**可执行配置文件**：

```
子项目 A                    conventions/                  子项目 B
├── pyproject.toml ──┐   ┌── ruff.toml        ┌── tsconfig.json
│   extend = ────────┼───┘   mypy.ini          └── biome.json
├── ruff.toml     ───┘
```

---

## 目录

```
packages/conventions/
├── python/
│   ├── ruff.toml                    lint + format 规则
│   ├── mypy.ini                     类型检查（strict）
│   ├── pytest.ini                   测试配置
│   ├── import-linter.base.toml       ⭐ 依赖护栏
│   └── pyproject.base.toml          包元数据模板
├── typescript/
│   ├── tsconfig.base.json           ⭐ 类型配置（strict）
│   ├── biome.json                   lint + format
│   ├── vitest.base.ts               测试配置
│   ├── eslint-boundaries.base.json  ⭐ 目录边界
│   └── package.base.json            package.json 模板
├── api/
│   ├── response.schema.json         统一响应信封
│   ├── error-codes.json             错误码分段表
│   └── pagination.schema.json       游标分页
├── i18n/
│   ├── messages.schema.json         ⭐ 文案 key 规范
│   └── key-patterns.json            正则 + 状态白名单
├── theme/
│   ├── brand.schema.json            ⭐ 品牌配置契约
│   └── presets.json                 5 套学术预设
└── naming/
    ├── python.json                  命名规则
    └── typescript.json              命名规则
```

---

## 怎么被引用

### Python

```toml
# pyproject.toml
[tool.ruff]
extend = "../../packages/conventions/python/ruff.toml"

[tool.mypy]
extends = ["../../packages/conventions/python/mypy.ini"]

[tool.pytest.ini_options]
# 见 pytest.ini
```

```toml
# import-linter.ini
[importlinter]
root_package = "my_service"
include_external_packages = true

[[importlinter:contract]]
name = "分层：interfaces → application → domain"
type = "layers"
layers = [
    "my_service.interfaces",
    "my_service.infrastructure",
    "my_service.application",
    "my_service.domain",
]
```

### TypeScript

```json
// tsconfig.json
{
  "extends": "../../packages/conventions/typescript/tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" }
}
```

```json
// biome.json
{
  "extends": "../../packages/conventions/typescript/biome.json"
}
```

---

## 跨仓引用怎么办

子项目是**独立仓库**，`../../packages/conventions/` 这个相对路径在独立仓里不存在。

**解法：`scripts/dev-setup.mjs` 统一布局**

```
C:\work\
├── scholarspace\                    ← 主项目
│   └── packages\conventions\        ← 规范
└── scholarspace-core\               ← 子项目（独立仓）
```

子项目内的相对路径改为 `../scholarspace/packages/conventions/...`：

```toml
[tool.ruff]
extend = "../scholarspace/packages/conventions/python/ruff.toml"
```

**或者**（更稳）：把 conventions 做成一个可发布的包：

```
@scholarspace/conventions-py     ← PyPI
@scholarspace/conventions-ts     ← npm
```

子项目 `extends` 的是**包内导出的配置**：

```toml
[tool.ruff]
extend = "@scholarspace/conventions-py/ruff.toml"
```

> **决策待定**：M0 时二选一。倾向后者（版本化、可独立升级、不依赖目录布局）。

---

## 变更流程

```
① 改本目录的 base 文件
② 提交 PR 到主项目（附影响面清单）
③ CI 在所有子项目跑 guards → 报违规
④ 逐包修复（或加带到期日的豁免）
⑤ 合并
```

**豁免要求**：
- 必须带 `# TODO(owner): 移除条件` 注释
- 必须有到期日
- CI 检查豁免总数**不增长**（超基线报错）

---

## 相关文档

- [代码规范](../../docs/05-代码规范.md) —— 规范"为什么"
- [架构护栏](../../docs/06-架构护栏.md) —— 护栏"是什么"
- [执行计划](../../docs/11-执行计划.md) —— 什么时候做
