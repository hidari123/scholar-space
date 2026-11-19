# scholarspace-example-service

> 示例 Python 子项目 —— **验证 `packages/conventions/` 是否真正可用**。

---

## 为什么有这个示例

M0 阶段有个**鸡生蛋问题**：

- `cli`（脚手架）依赖 `conventions`（规范基座）
- `conventions` 需要一个真实包来验证是否可用

**解法**：先手写这个示例包，把 `conventions` 调通；再写 `cli`；`cli` 生成的包必须与手写的**行为一致**。

**这个示例的价值**：它暴露了 **8 个 conventions 缺陷**（见文末）。全部已修。

---

## 验证结果（全部通过 ✅）

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | ruff 继承 conventions | `ruff check --show-settings` → `target_version=3.13` `line_length=100` | ✅ |
| 2 | ruff 规则生效 | `ruff check` | ✅ All checks passed |
| 3 | ruff formatter 生效 | `ruff format --check` | ✅ 20 files already formatted |
| 4 | mypy strict 生效 | `mypy src/` | ✅ no issues in 19 files |
| 5 | import-linter 五条契约 | `import-linter lint` | ✅ 5 kept, 0 broken |
| 6 | **护栏真能拦截违规** | 让 domain 导入 sqlalchemy | ✅ **G2 BROKEN** |
| 7 | pytest asyncio auto | 无需 `@pytest.mark.asyncio` | ✅ 3 passed |
| 8 | 四层结构完整 | domain/app/infra/interfaces | ✅ |

---

## 目录结构（= 脚手架 `python-service` 模板的形状）

```
src/example_service/
├── domain/                    ← 纯领域，零外部依赖（G2 强制）
│   ├── entities.py            Example 实体（frozen dataclass）
│   ├── value_objects.py       ExampleId 值对象
│   └── errors.py              AppError 异常体系
├── application/               ← 用例编排，只依赖 domain + ports
│   ├── ports/
│   │   └── repositories.py    ExampleRepositoryPort（Protocol）
│   └── use_cases/
│       └── create_example.py  CreateExample 用例
├── infrastructure/            ← 实现 ports
│   └── repositories/
│       └── in_memory_example_repository.py
├── interfaces/                ← 薄 HTTP 层（不 import infrastructure）
│   └── http/
│       ├── dto.py             Pydantic 请求/响应模型
│       └── router.py          FastAPI 路由
├── main.py                    组装根（唯一允许接触 infrastructure 的地方）
└── py.typed                   PEP 561 标记
```

**配置文件**（都由 `cli new` 生成）：

```
pyproject.toml      ruff extends ✅
mypy.ini            复制自 conventions（mypy 无继承机制）
setup.cfg           import-linter 契约（G1-G5）
README.md
```

---

## 关键设计展示

### 依赖倒置

```python
# application/ports/repositories.py —— 只定义抽象
class ExampleRepositoryPort(Protocol):
    async def save(self, example: Example) -> Example: ...

# infrastructure/repositories/... —— 提供实现
class InMemoryExampleRepository:
    async def save(self, example: Example) -> Example: ...

# application/use_cases/create_example.py —— 只依赖抽象
class CreateExample:
    def __init__(self, repository: ExampleRepositoryPort) -> None:
        self._repository = repository
```

**换实现不影响用例**（内存 → PostgreSQL 只改 infrastructure）。

### 组装根注入（interfaces 不碰 infrastructure）

```python
# interfaces/http/router.py —— 只认端口类型
def get_repository() -> ExampleRepositoryPort:
    raise NotImplementedError("由 main.py 注入")

# main.py —— 组装根，唯一接触点
app.dependency_overrides[get_repository] = InMemoryExampleRepository
```

> ⚠️ 最初我让 `router.py` 直接 `import InMemoryExampleRepository`，
> **被 G4 护栏当场拦下** —— 这正是护栏的价值。

### 领域层零依赖

```python
# domain/entities.py —— 不 import sqlalchemy / fastapi / requests
from dataclasses import dataclass, field
from datetime import UTC, datetime

@dataclass(frozen=True, slots=True)
class Example:
    ...
```

### 全局异常处理

```python
# main.py —— 一处处理，替代每个接口的 try/except
@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={...})
```

---

## 本次验证发现的 conventions 缺陷（8 个，全部已修）

| # | 缺陷 | 根因 | 修复 |
|---|---|---|---|
| 1 | ruff TOML 解析失败 | `[lint.per-file-ignores."tests/**"]` 是非法 TOML（`[表.键]` 语法）| 改为标准 `[lint.per-file-ignores]` 表 + 键值对 |
| 2 | **per-file-ignores 完全失效** | **ruff 把 glob 相对「配置文件所在目录」解析**，不是相对项目 → `**/ports/**.py` 变成 `<conventions>/python/**/ports/**.py` | 改用 **basename 形式**（`ports.py`），ruff 对 basename 做全路径匹配 |
| 3 | 中文 docstring 误报 | `D415` 要求首行句号；`RUF001/002/003` 要求半角标点 | 关闭这四条（中文技术文档大量用全角标点）|
| 4 | `__init__.py` 误报 D104 | 包级 docstring 不必要 | basename 豁免 |
| 5 | Protocol 方法误报 D102 | `...` 实现的方法不算缺文档 | basename 豁免 |
| 6 | FastAPI `Depends()` 误报 B008 | FastAPI 标准写法就写在默认值里 | `router.py` 豁免 |
| 7 | `lifespan(app)` 误报 ARG001 | 框架注入参数 | `main.py` 豁免 |
| 8 | **mypy 无配置继承机制** | `[tool.mypy] extends` 与 `[mypy] include` **都不支持** | 改为**复制** base 文件（`cli new` 复制，`cli sync` 刷新）|

### 额外发现（非 conventions 缺陷，但必须记录）

| # | 问题 | 影响 | 解决 |
|---|---|---|---|
| A | **mypy/import-linter 读 .ini 用系统 locale codec** | 中文 Windows（GBK）下读 UTF-8 文件 → `UnicodeDecodeError` | **base 配置文件必须纯 ASCII**，注释用英文 |
| B | **import-linter 只认 `setup.cfg` / `.importlinter` / `pyproject.toml`** | 独立的 `importlinter.toml` 不被识别 | 用 `setup.cfg`（INI 格式，契约段用 `[importlinter:contract:N]`）|
| C | **import-linter 的 `.ini` 不支持重复段** | `[[contract]]` TOML 语法在 INI 里报 "section already exists" | INI 用编号段 `[importlinter:contract:1]` |
| D | **mypy src/ 布局需 `mypy_path = src`** | 否则同文件被识别为两个模块 | base 配置加 `mypy_path = src` |
| E | **缺 `py.typed`** | mypy 报 `import-untyped` | 包内加空 `py.typed`（PEP 561）|

> ⚠️ **A/B/C 是跨平台 + 中文环境的组合坑**，已写进 conventions 文件注释。
> 这些问题在 Linux CI 上不会出现，只有本地 Windows 开发才会踩到 ——
> 所以**必须手写示例包验证**，不能只靠 CI。

---

## 本地运行

```bash
# 安装
uv venv --python 3.13
uv pip install -e . --no-deps
uv pip install pydantic pydantic-settings structlog fastapi \
    pytest pytest-asyncio pytest-cov ruff mypy import-linter

# 质量门禁（5 道）
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
- [执行计划](../../docs/11-执行计划.md)
