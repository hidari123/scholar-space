# scholarspace-core

> scholarspace 共享 Python 底座 —— **配置 / 日志 / 错误 / 存储抽象**。
>
> TS 侧的对偶物是 [`@scholarspace/ui`](../ui)。

---

## 定位

**这不是独立仓。** 它住在主仓，以**发布包**形式被 12 个独立后端子项目消费：

```
scholarspace-core  ←  auth, llm, storage, billing, paper, slides, orchestra, community…
```

**为什么住主仓而不是独立仓**：
- 它是「规范的可执行形式」，和 `packages/conventions` 一样 —— 规范演进改一处，全平台跟随
- 少两个仓的维护成本
- 发布产物完全一样（`pip install scholarspace-core`）

> 详见 [docs/12-独立仓与共享UI设计.md](../../docs/12-独立仓与共享UI设计.md)。

---

## 提供什么

| 能力 | 内容 | 依赖方 |
|---|---|---|
| **错误体系** | `AppError` 基类 + 14 个错误类 + 错误码分段 | 全部 |
| **配置** | pydantic-settings 分组配置 + 环境变量 | 全部 |
| **日志** | structlog 结构化日志（JSON/彩色可读）| 全部 |
| **存储端口** | `StoragePort` Protocol（依赖倒置）| paper / slides / community |
| **内存存储** | 测试用实现 | 测试 |

---

## 四层结构（与所有子项目一致）

```
src/scholar_core/
├── domain/                 ← 零外部依赖（G2 强制）
│   └── errors.py           AppError + 错误码
├── application/
│   └── ports/
│       └── storage.py      StoragePort（Protocol）
├── infrastructure/         ← 实现 ports
│   ├── config/
│   │   └── settings.py     CoreSettings + 分组设置
│   ├── logging.py          structlog 配置
│   └── storage/
│       └── in_memory.py    内存实现（测试用）
└── interfaces/             ← 预留（HTTP 中间件等）
```

**依赖倒置**：`application` 只认 `StoragePort` Protocol，不认 MinIO/boto3。
换后端只改 `infrastructure`，业务代码零改动。

> ⚠️ **配置在 infrastructure 层，不在 domain 层**。
> 配置必须读环境变量（pydantic_settings），而 domain 层禁止任何外部依赖（G2 护栏）。
> 业务代码用 `from scholar_core import get_settings` 即可，不需要知道它在哪一层。

---

## 用法

### 错误

```python
from scholar_core import NotFoundError, ErrorCode

raise NotFoundError("common.error.notFound")
# → code=40401, http_status=404, message 是 i18n key
```

**关键设计**：异常消息是 **i18n key**，不是给人看的文案。
前端拿到 `common.error.notFound` 后按当前界面语言渲染 —— 这样后端不需要知道用户用什么语言。

### 配置

```python
from scholar_core import get_settings

settings = get_settings()
settings.db.async_url          # postgresql+asyncpg://...
settings.redis.dsn
settings.is_production
```

环境变量（嵌套用 `__`）：

```bash
SCHOLAR_ENV=prod
SCHOLAR_DB__HOST=db.internal
SCHOLAR_DB__PASSWORD=xxx
SCHOLAR_REDIS__URL=redis://cache:6379/0
SCHOLAR_AUTH__ALLOWED_ORIGINS=https://a.com,https://b.com
```

**启动即校验** —— 配置错了立刻崩，不等到第一个请求。

### 日志

```python
from scholar_core import configure_logging, get_logger

configure_logging(service_name="slides", level="INFO", json_format=True)
log = get_logger(__name__)
log.info("生成完成", slides=12)
# → {"event":"生成完成","slides":12,"service":"slides","timestamp":"..."}
```

### 存储端口

```python
from scholar_core import StoragePort

async def save(storage: StoragePort, key: str, data: bytes) -> None:
    info = await storage.put(key, data, "application/pdf")
    log.info("已保存", key=info.key, size=info.size)
```

---

## 质量门禁

```bash
uv venv --python 3.13
uv pip install -e . --no-deps
uv pip install pydantic pydantic-settings structlog \
    pytest pytest-asyncio ruff mypy import-linter

.venv/Scripts/ruff.exe check src/ tests/
.venv/Scripts/ruff.exe format --check src/ tests/
.venv/Scripts/mypy.exe src/
.venv/Scripts/import-linter.exe lint
.venv/Scripts/python.exe -m pytest tests/ -q
```

---

## 相关文档

- [代码规范](../../docs/05-代码规范.md)
- [架构护栏](../../docs/06-架构护栏.md)
- [独立仓与共享 UI 设计](../../docs/12-独立仓与共享UI设计.md)
