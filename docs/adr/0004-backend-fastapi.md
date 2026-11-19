# ADR-0004：后端统一 FastAPI

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

现有两套后端技术栈：

| 项目 | 框架 | DB | 异步 |
|---|---|---|---|
| `scholar-club-backend` | FastAPI 0.115（部分同步）| MySQL + PostgreSQL | 混用（`time.sleep` 轮询）|
| `scholarclub-ppt-service` | **Flask 3.0** | **SQLite** | `ThreadPoolExecutor` |

`scholar-club-backend` 的实测问题：
- **173 处**复制粘贴的 `handle_exception_and_retry`
- **408 处**裸 `except` / `except Exception`
- 零分层（router → service → model_service 三层混写）
- 同步阻塞：`papersketch_router.py:157` `time.sleep(10)` 轮询 600 秒
- 明文密钥、硬编码内网 IP、鉴权可绕过（dev 返回 account_id=61）

---

## 决策

**后端全部统一为 FastAPI + Pydantic v2 + SQLAlchemy 2.0 async + PostgreSQL。**

配套：
- 四层架构（domain / application / infrastructure / interfaces）+ 依赖倒置
- 统一 `AppError` 异常体系 + 全局异常处理器
- 声明式重试装饰器（取代复制粘贴）
- 统一 `APIResponse[T]` 信封
- 密钥外置（Pydantic Settings）
- 长任务用 `arq` + SSE，**禁止在 HTTP 请求里轮询**

---

## 理由

### 1. Flask 的能力天花板

Flask 是同步框架。学术产品的长任务（PPT 渲染、文献解析、Agent 执行）本质是异步的。

Flask 要做异步需要额外套 ASGI（`asgiref` / `quart`），复杂度陡增。

### 2. FastAPI 已验证可行

现有 `scholar-club-backend` 就是 FastAPI，团队熟悉。问题是**用法不当**（分层混乱、错误处理重复），不是框架问题。

### 3. Pydantic v2 的价值

- 边界校验自动生成 OpenAPI
- JSON Schema 原生导出 → **契约代码生成的基础**
- 比 v1 快 5-50x

### 4. 依赖倒置是解决"173 处复制粘贴"的关键

```
router → service → model_service
```

必须改成：

```
interfaces → application → domain
                ↑
         infrastructure（实现 ports）
```

这样：
- 业务逻辑可脱离 HTTP 测试
- 外部依赖（DB / LLM / 存储）可替换
- 异常处理集中在中间件

### 5. SQLAlchemy 2.0 async 是必需

社区的 follow / 时间线 / 通知需要高并发读。同步 SQLAlchemy 会阻塞事件循环。

---

## 备选方案

### A. 保留 Flask（PPT 项目）

**否决**：技术栈不统一；异步能力弱；ORM 生态（SQLAlchemy 2.0 async）不支持。

### B. 保留同步 SQLAlchemy + `run_in_threadpool`

**否决**：连接池管理与并发控制复杂；难以支撑 SSE 长连接。

### C. Django + DRF

**优点**：ORM、Admin、认证全套。

**否决**：Django 的 ORM 与 Admin 是"全栈框架"哲学，与我们的四层 + 依赖倒置不兼容；Admin 我们的场景用不上；DRF 的序列化与 Pydantic 重复。

### D. Go / Rust

**否决**：AI 生态与文档处理库（PDF/OCR/PPTX）远不如 Python；团队不熟。

---

## 后果

### 正面
- 技术栈统一，认知负担降低
- 消除 173 处复制粘贴与 408 处异常吞噬
- 契约自动生成（OpenAPI → 客户端）
- 长任务正确异步化（SSE 替代轮询）
- 鉴权与密钥治理有框架可依托

### 负面
- **Flask 代码需完全重写**（PPT 项目）
- **SQLite → PostgreSQL** 需迁移与适配
- 团队需补 async 心智模型（写同步代码在 async 里是常见坑）
- SQLAlchemy 2.0 async 心智模型学习成本

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 团队 async 功底不足 | M1 的 `auth` 项目作为练手；`ruff` + `mypy` 辅助；code review 重点看 |
| 在 async 里误用同步 I/O | 自研 guard 扫描 `requests` / `time.sleep` / 同步 DB 调用 |
| PostgreSQL 与 MySQL 语法差异 | ETL 阶段统一处理；schema 新建为主，迁移为辅 |
| SQLite 特性丢失 | PPT 项目数据无强依赖，迁移成本低 |
