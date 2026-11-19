# scholarspace-llm

scholarspace LLM 服务 —— 多模型接入 / 内容语言 / 结构化输出。

> **B 类服务**：主仓内的基础服务，不是独立仓。
> 供 slides / orchestra / paper / community 复用。

---

## 三个核心能力

| 能力 | 说明 |
|---|---|
| 多模型接入 | OpenAI / Anthropic / 智谱 / DeepSeek …… 一个协议多个厂商 |
| 内容语言 | 21 种（20 + `auto`），与**界面语言完全解耦** |
| 结构化输出 | 走厂商的 JSON Schema 约束，不是「求模型返回 JSON」 |

---

## 界面语言 ≠ 内容语言

这是最容易混淆的一点（ADR-0006）：

```
界面语言（UI locale）  → 用户看到的菜单、按钮、提示
内容语言（content）   → LLM 生成的**内容**用什么语言
```

**例子**：界面是 `zh-CN`，用户要求「把这篇英文论文总结成中文」——
界面语言决定按钮写什么，内容语言决定摘要写什么。两者无关。

---

## 快速开始

```python
from scholar_llm import (
    ContentLanguage,
    GenerateTextRequest,
    LLMContext,
    ModelTier,
    generate_text,
)
from scholar_llm.infrastructure.catalog import build_default_registry

context = LLMContext(
    registry=build_default_registry(),
    providers={"openai": openai_provider},
)

result = await generate_text(
    context,
    GenerateTextRequest(
        prompt="把这篇论文总结成三点",
        system="你是学术助手。",
        language=ContentLanguage.ZH_CN,
        tier=ModelTier.FAST,
    ),
)

print(result.content)
```

### 结构化输出

```python
from scholar_llm import GenerateStructuredRequest, generate_structured

result = await generate_structured(
    context,
    GenerateStructuredRequest(
        prompt="分析这篇论文的方法论",
        schema={
            "type": "object",
            "properties": {
                "method": {"type": "string"},
                "limitations": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["method", "limitations"],
        },
    ),
)

result.data["method"]
```

---

## 架构

```
domain/          模型定义 / 语言 / 路由 / 错误 —— 零外部依赖
  models.py      ModelSpec / CompletionRequest / Capability / ModelTier
  languages.py   ContentLanguage（21 种）+ auto 解析
  registry.py    模型注册表与路由
  errors.py      错误分类（可重试 vs 不可重试）

application/     用例编排 + 端口协议
  ports.py       LLMProvider 协议
  use_cases.py   generate_text / generate_structured / 路由 / 语言注入

infrastructure/  HTTP 适配器
  openai_compatible.py   OpenAI 兼容协议（覆盖多个厂商）+ FakeProvider
  retry.py               指数退避 + 抖动，只重试可重试的错误
  catalog.py             默认模型目录
```

⚠️ **依赖方向**：`infrastructure → application → domain`
领域层零外部依赖，可被任何地方复用。

---

## 路由规则

决策顺序是**业务语义优先**，不是「哪个模型最强」：

```
① 显式指定 model      → 就用它（用户明确要了）
② 需要结构化输出      → 只找支持 STRUCTURED_OUTPUT 的
③ 上下文超了          → 找 context_window 够大的
④ 按档位选            → 同档位里挑便宜的
⑤ 都找不到            → 报错
```

⚠️ **不「总是选最强的」** —— 摘要任务用最强模型 = 成本翻十倍，
效果提升有限。档位路由让「快速/精细」真正有意义。

**档位**：`fast`（快而便宜）/ `balanced`（默认）/ `quality`（慢而贵）

---

## 错误分类 —— 可重试 vs 不可重试

这是 LLM 服务最关键的分类：

| 错误 | 可重试 | 原因 |
|---|---|---|
| `ProviderTimeoutError` | ✅ | 网络抖动 |
| `ProviderRateLimitError` | ✅ | 限流，等一会 |
| `ProviderServerError` | ✅ | 厂商 5xx |
| `ProviderAuthError` | ❌ | 401 —— 重试一万次还是 401 |
| `ContextTooLongError` | ❌ | 要换模型，不是重试 |
| `StructuredOutputError` | ❌ | prompt 没说清，重试不会变好 |

⚠️ **对不可重试的错误重试 = 白白烧钱 + 拖慢响应。**

---

## 内容语言

21 种：`auto` + 20 种具体语言。

```
zh-CN / zh-TW / zh-HK / en / en-GB / en-US / fr / de / es / pt / it / ru
ja / ko / ar / he / fa / hi / nl / pl
```

`auto` = 跟随输入语言。检测不到时回退 `en`（LLM 对英文服从度最高）。

⚠️ **提示词里写「用简体中文（Simplified Chinese）输出」而不是「用 Chinese 输出」** ——
后者对某些模型会理解成「英文里提到 Chinese」。

---

## 开发

```bash
.venv/Scripts/python.exe -m pytest      # 测试
.venv/Scripts/python.exe -m ruff check . # lint
.venv/Scripts/python.exe -m mypy src/   # 类型
```

---

## 已知限制

- **流式输出** —— 领域层有 `stream` 字段，但适配器还没实现
- **Anthropic 适配器** —— 需要单独写（它的 `system` 是独立字段，不兼容 OpenAI 协议）
- **token 估算是粗略的** —— 精确数要调厂商 tokenizer API，每次请求调不划算
