# ADR-0018：G1 闸门评审 —— 规范可用性评估

| 项 | 值 |
|---|---|
| 状态 | ✅ 已接受 |
| 日期 | 2026-11-19 |
| 决策者 | 项目负责人 |
| 关联 | ADR-0011（规范以代码承载）、ADR-0016（4+1+1 布局） |

---

## 背景

`docs/06-架构护栏.md` 定义了 **G1 闸门**：

> **G1** —— M1 结束时评审规范是否**真的可用**。
> 不是「文档写完了」，而是「**独立仓能拿这套规范真的把东西做出来**」。

为什么单独设一个闸门：

规范文档写完 ≠ 规范可用。

之前在 `scholar-club` 上踩过的坑：

- ruff 的 `per-file-ignores` 跨仓 `extends` **静默失效** —— 不报错，规则全没
- mypy 根本没有配置继承 —— 复制粘贴才是唯一办法
- biome 的 `extends` 路径不对时**静默失效** —— CI 照样绿灯
- `.ini` 文件用系统 locale 读取 —— Windows 上 GBK 崩溃

**这四个坑都在主仓测不出来** —— 主仓的目录结构和独立仓不一样。

所以 G1 的验收标准必须是：

> **让一个独立仓真的用这套规范把功能做出来，看会不会炸。**

---

## 评审方法

不是「读一遍文档觉得没问题」，而是**真刀真枪跑一遍**：

| # | 场景 | 验证什么 |
|---|---|---|
| ① | 在 `scholarspace-identity` 建 `ui/` 包 | 独立仓能不能用主仓的 `@scholarspace/ui` |
| ② | 在主仓建 `packages/services/llm/` | 新建 Python 服务能不能零摩擦落地 |
| ③ | 在 `packages/services/auth` 加 HTTP 层 | 已有服务能不能增量加一层 |
| ④ | 跑全部护栏 + CI 检查 | 规范本身有没有自相矛盾 |

---

## 评审结果

### ✅ 通过项

| 项 | 证据 |
|---|---|
| TypeScript 规范可用 | 5 个包 / 183 个测试通过，TS 5.9 / 6.0 / 7.0 三版本都过 |
| Python 规范可用 | 2 个服务 / 152 个测试通过，ruff + mypy --strict 全绿 |
| 独立仓能消费主仓共享包 | `scholarspace-identity/ui/` 48 个测试通过 |
| 护栏体系有效 | 9 条护栏通过，G25 实测能抓到漂移 |
| CLI 同步机制有效 | 8 个包的 base 副本与源一致，`--check` 能检出过期 |
| 领域层零依赖可行 | auth / llm / identity-core 都能独立复用 |

### ❌ 评审中发现并已修复的问题

**这才是 G1 的真正价值** —— 不做这次评审，这些问题会留到 M3、M4 才炸。

| # | 问题 | 影响 | 状态 |
|---|---|---|---|
| 1 | **`packages/ui` 没有再导出 AntD 组件** | 「业务代码只能 import from @scholarspace/ui」的铁律**根本无法执行** —— 业务代码除了直接 import antd 别无选择，G7 护栏形同虚设 | ✅ 已修（`packages/ui/src/antd.ts`） |
| 2 | **`antd/locale/xx_XX` 在独立仓消费时挂掉** | antd 没有 `exports` 字段 → 子路径被当目录解析 → 独立仓跑测试直接报 `Cannot find module` | ✅ 已修（加 `.js` 扩展名） |
| 3 | **包级 `biome.json` 缺失 → 退回 Biome 默认（tab）** | 新建包不知道要加 `biome.json` → 与 conventions 的 space×2 冲突 → lint 一堆格式错 | ✅ 已修（补模板说明 + 本包补文件） |
| 4 | **CLI 的 `sync` 会抹掉本地有意加的配置** | `packages/core` 的 `pydantic.mypy` 插件被覆盖掉 → mypy 报错 | ✅ 已修（保留本地偏离 + `--with-exceptions`） |
| 5 | **TS `baseUrl` 在 TS 6.0 废弃 / 7.0 移除** | 用户报的错误 | ✅ 已修（移除 baseUrl + 各包自声明 paths） |
| 6 | **CLI 没把 flags 传给命令** | `sync --kind typescript` 静默跑成 python；`new --template ts-package` 静默生成 Python 项目 | ✅ 已修（+ 25 个回归测试） |

---

## 结论

**G1 通过。**

理由：

1. **规范已被真实使用** —— 不是「照着文档写了个 hello world」，
   而是真做了三个可用的包（identity-ui / llm / auth-interfaces）。
2. **发现的 6 个问题都已修复**，且每个都有回归测试或护栏兜底。
3. **护栏体系能自己发现问题** —— G25 是评审期间加的，
   已经抓到 4 处真实漂移。

### 但有三个已知限制（不阻塞，但要记着）

| # | 限制 | 什么时候解决 |
|---|---|---|
| 1 | **独立仓的 CI 还不能自动检查 base 副本同步** | 各独立仓建起来时补（主仓的 `base-sync` job 已就绪，可直接抄） |
| 2 | **契约（OpenAPI）还没有真正打通** | M6 —— 现在 `contracts/` 只有骨架，codegen 没连上真实 API |
| 3 | **`scholarspace-core`（PyPI）还是空的** | M6 —— 现在 Python 侧靠 `packages/core` 顶着，跨仓复用时再抽 |

---

## 后续影响

### 规范层面要补的

- [x] `packages/ui` 加 antd 再导出口 —— **已在 `b12959c` 修复**
- [x] `cli sync` 保留本地偏离 —— **已在 `8c258d2` 修复**
- [x] `antd/locale` 导入带扩展名 —— **已在 `b12959c` 修复**
- [ ] `cli new` 的模板要包含 `biome.json`（已包含，但要确保独立仓也用上）
- [ ] G2 闸门前补一条「新建包必检」护栏（检查 `biome.json` / `py.typed` 是否存在）

### 文档层面要同步的

- [ ] `docs/06-架构护栏.md` —— 把 G25 与新发现的规则补进去
- [ ] `docs/05-代码规范.md` —— 补「独立仓消费共享包」的注意事项
- [ ] `docs/03-语言体系.md` —— 内容语言实际落地的是 **21 种**（20 + `auto`）
- [ ] `docs/MANIFEST.md` —— 待确认项 1-16 的实际结论
- [ ] `versions/compatibility.yaml` —— 补 llm / auth 两个服务的版本条目

---

## 决策记录

**接受 G1 通过，继续进入 M2（orchestra）。**

理由：M1 的目标是「证明这套体系能跑起来」，
现在三件事都做完了 —— 独立仓能用、主仓能增量开发、规范自己有护栏。

继续停在 M1 打磨细节的收益低于进入 M2 暴露更多真实问题。
