# ADR-0005：数据库统一 PostgreSQL 17 + pgvector

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

现有三套数据库：

| 项目 | 数据库 | 用途 |
|---|---|---|
| `scholar-club-backend` | **MySQL**（业务主库）| 账户、文献、笔记、账单 |
| `scholar-club-backend` | **PostgreSQL** | Mastodon 的 `users` / `statuses` / `tags`（直连他库）|
| `scholarclub-ppt-service` | **SQLite** | PPT 项目、页面、任务 |

自研社区（`community`）需要：follow 关系、时间线（fan-out/on-read）、话题趋势、通知分组、媒体排序。

编排引擎（`orchestra`）需要：Flow 图（JSONB）、执行记录、事件流。

论文域（`paper`）需要：全文检索、向量检索（RAG）、结构化元数据。

---

## 决策

**所有数据统一到 PostgreSQL 17 + pgvector 0.8+。**

具体：
- `users` / `statuses` / `tags` 等社区表**自建**（不再直连 Mastodon 的 PG 库）
- Flow 图、SlidePlan 等用 **JSONB**（不再 TEXT + `json.loads`）
- RAG 向量用 **pgvector**（不引入 Milvus/Qdrant）
- 全文检索用 **PG tsvector + trigram**（初期不引入 Elasticsearch）
- 时间统一 **TIMESTAMPTZ**（UTC 存储，展示层转换）
- 软删统一 `deleted_at TIMESTAMPTZ NULL`（替代 `IS_DELETE INT`）

---

## 理由

### 1. 社区功能对 PG 的依赖是刚性的

| 需求 | MySQL | PostgreSQL |
|---|---|---|
| JSONB 索引（Flow 图按节点查）| JSON 类型，索引弱 | ⭐ JSONB + GIN 索引 |
| 数组类型（`ordered_media_attachment_ids`）| 无 | ⭐ 原生 `BigInteger[]` |
| 物化视图（时间线）| 有但弱 | ⭐ 刷新策略成熟 |
| 递归 CTE（话题层级）| 弱 | ⭐ 强 |
| `INET` 类型（IP）| 无 | ⭐ 原生 |
| 部分索引（软删查询）| 有 | ⭐ 有 |

**注意**：现有 `models/mastodon_models.py` 已经用了 `INET`、`ARRAY(String)`、`ARRAY(BigInteger)`、`Sequence` —— 已经是 PG 方言。统一到 PG 反而是**消除方言混用**。

### 2. pgvector 免部署

RAG 需要向量检索。选项：Milvus / Qdrant / Weaviate / pgvector。

**pgvector 优势**：
- 与业务数据同库 → **事务一致**（写文档与写向量原子）
- 无额外服务运维
- HNSW 索引性能足够学术规模（百万级向量）

**限制**：超过千万级向量才需要专门的向量库。学术场景（单机构/单平台）远不到。

### 3. 不引入 Elasticsearch

- 学术检索主要是**结构化过滤**（年份/引用数/领域）+ 关键词
- PG tsvector + trigram 足够
- ES 是重运维（Java 堆内存调优、分片）
- 少一个系统 = 少一套故障模式

**触发引入 ES 的条件**：全文检索成为瓶颈，或需要复杂聚合分析。

### 4. JSONB 取代 TEXT + JSON 字符串

现状问题：`slide_pages.outline_content` 是 `TEXT`，存 JSON 字符串，读取时 `json.loads`。
- 无法索引
- 无法用 SQL 查询内部字段
- 应用层易出错

JSONB：二进制存储 + 可索引 + 可查询。

### 5. SQLite 在生产不可用

`scholarclub-ppt-service` 用 SQLite —— 并发写受限、单机文件、无网络访问、无成熟备份方案。PPT 是长任务 + 并发渲染场景，SQLite 写锁会成为瓶颈。

---

## 备选方案

### A. 保持 MySQL + 引入 PG（双库）

**否决**：两套方言 = 两套 SQL、两套备份、两套监控、两套连接池。本项目已经因为"三套 DB"付出了混乱成本。

### B. 引入 Elasticsearch

**否决**：运维成本 vs 收益不匹配。初期用 PG。

### C. 引入专门的向量库（Milvus/Qdrant）

**否决**：pgvector 足够；且同库事务一致性是优势。

### D. PostgreSQL + Citus（水平分片）

**保留**：学术 SaaS 后期单库可能有压力。**触发条件明确**：单库写入瓶颈或需要多租户物理隔离。届时 pgvector 迁到分布式向量方案。

---

## 后果

### 正面
- 一套方言、一套工具链（SQLAlchemy + Alembic + pg_dump）
- 社区/编排/论文的刚性需求全部满足
- 少两个系统（ES、Milvus）→ 少两套故障模式
- JSONB 让 Flow 图、SlidePlan 可索引可查询
- 现有 PG 方言代码（mastodon_models）可直接借鉴字段设计

### 负面
- **MySQL → PG 迁移**：SQL 方言差异（`AUTO_INCREMENT` / `ON DUPLICATE KEY` / 反引号 / `LIMIT` 语法）
- **SQLite → PG 迁移**：PPT 项目的数据无强依赖，成本低
- PG 的连接管理（连接池、pgbouncer）需要配置
- 大表迁移需用 `pgloader` / `pg_dump` 工具

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| MySQL → PG 迁移踩坑 | ETL 阶段用 `pgloader`；SQL 逐条 review；集成测试覆盖 |
| JSONB 查询性能不佳 | 建 GIN 索引；必要时用生成列（generated column）转普通列 |
| PG 全文检索效果不如 ES | 学术场景够用；用 trigram 支持模糊搜索 |
| 单库未来瓶颈 | 已有明确触发条件（Citus / 分库）；schema 设计时避免跨库 join |
| 连接数耗尽 | pgbouncer + SQLAlchemy 池配置统一在 `core/config` |
