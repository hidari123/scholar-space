# ADR-0010：社区自研路线与 Mastodon 兼容策略

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

社区功能当前**完全依赖远程 Mastodon 实例**（`mastodon.scholar.club`）：

- `core/social_config.py:24,38` —— `INSTANCE_SOCIAL`
- `services/mastodon_*.py`（7 个 service）—— 全部是 `Mastodon` Python SDK 调用
- `models/mastodon_models.py` —— **直连 Mastodon 的 PostgreSQL 库**（`PG_Session`），读 `users` / `oauth_access_tokens` / `statuses` / `tags`
- `services/mastodon_token_service.py` —— 绕过 API 直接查他库的 token 表
- `services/mastodon_accounts_service.py:24,30` —— OAuth 凭证明文存 `logs/*.secret`

**消费的 Mastodon API 面**：约 **45 个端点**（账号 9 / 帖子 15 / 时间线 2 / 话题 13 / 通知 4 / 媒体 1 / 搜索 2）。

同时，我们有 Mastodon **没有**的独有资产：
- LLM 内容审核 + 发帖奖励学术币（每日上限 300）—— `mastodon_status_service.py:28-80`
- arXiv 每日论文自动配图发帖 —— `mastodon_robot_router.py`（1699 行）
- 笔记 ↔ 论文 ↔ 社区 三向联动 —— `paperclub_note_router.py`

且 Mastodon 是 AGPL-3.0（见 [ADR-0013](./0013-license-compliance.md)）。

---

## 决策

### 1. 社区完全自研

新建 `scholarspace/community` 包 + `scholarspace/federation` 包（ActivityPub 独立）。

**不自研的部分**：ActivityPub 协议栈按规范自行实现（协议不受版权保护）。

### 2. 三种运行模式

```python
class CommunityMode(Enum):
    STANDALONE  # 纯自研，不联邦
    FEDERATED    # 自研 + ActivityPub 对外
    COMPATIBLE   # 对齐 Mastodon API 形状（迁移期）
```

### 3. 迁移路径

```
阶段1  COMPATIBLE  ──►  社区实现完全对齐 Mastodon REST API 形状
                        前端 45 个端点零改动切换，后端从"转发"变"直连"
阶段2  FEDERATED    ──►  接入 ActivityPub：/inbox /outbox /.well-known/webfinger
阶段3  STANDALONE   ──►  可选关闭联邦，纯站内
```

### 4. 字段设计借鉴 Mastodon schema

复制**字段设计**（不受版权保护），不复制实现：

| 借鉴点 | 说明 |
|---|---|
| `statuses` 表结构 | 22 字段，含 `visibility` / `sensitive` / `spoiler_text` / `conversation_id` |
| `ordered_media_attachment_ids` | 媒体**排序**用数组而非关联表（高效、有序）|
| `tag_history` + `max_score` | 话题趋势评分 |
| `local` 字段 | 是否本站原创（联邦关键）|
| `accounts` 表结构 | `locked` / `bot` / `discoverable` / `fields` |
| `oauth_access_tokens` | 简化版 |

### 5. 数据不迁移

- 旧 Mastodon 实例继续运行（保留其数据与联邦关系）
- 新社区从零开始
- **切换后**：旧实例转为只读归档

---

## 理由

### 1. AGPL 风险（决定性）

Mastodon 是 AGPL-3.0。**闭源商业 SaaS 不能依赖它**。详见 ADR-0013。

### 2. 直连他库是架构负债

```python
# mastodon_token_service.py:21
def get_token_account_id_by_email(self, email: str):
    """
    oauth_access_tokens表中有resource_owner_id
    users表中有id，等于resource_owner_id
    为了获取users表中的id，用email来做检索
    """
```
绕过 API 直接读别人的库 → 表结构一变就崩；无法独立演进；无法独立测试。

### 3. 我们的独有资产无法被 Mastodon 承载

- AI 审核 + 奖励币：这是**学术社区的激励设计**，Mastodon 没有
- arXiv 自动发帖：这是**内容生产管道**，Mastodon 没有
- 笔记↔论文↔社区联动：这是**产品主轴**，Mastodon 没有

**这些才是社区功能的价值所在**。套壳 Mastodon 反而限制了它们。

### 4. 前端零改动是可行的

现有前端调 `/api/v2/social/*`（45 个端点）。只要新实现保持这些路径的**响应结构一致**，前端一行不用改。

→ 由 `apps/gateway` 做路径映射（见 [10-迁移路线](./10-迁移路线.md)）。

### 5. 自研成本可接受

社区功能规模：
- 账号 + 认证：复用 `auth` 包
- 帖子 + 评论 + 点赞 + 收藏 + 关注：标准 CRUD
- 时间线：fan-out on-read（PG 物化视图）
- 话题趋势：定时任务 + 评分
- 通知：分组 + 未读计数

**约 3-4 周**（vs 编排引擎的 5 周）。相比 600 人天的组件库，这是高价值投入。

### 6. federation 独立成包的理由

ActivityPub 是协议栈，与社区业务是两回事：
- 协议演进频繁（独立可演进）
- 社区可以不带联邦跑（部署更简单）
- 将来可接 arXiv / ORCID / GitHub 等其他协议

---

## 备选方案

### A. 继续用 Mastodon 实例

**否决**：AGPL 风险；无法承载我们的独有资产；直连他库的架构负债。

### B. Fork Mastodon 深度定制

**否决**：Fork 意味着继承 AGPL 义务；Rails 技术栈与项目不统一；定制成本高。

### C. 社区 + 联邦都在一个包

**否决**：协议栈与业务耦合，演进不独立；部署重量级；不利于将来接其他协议。

### D. 直接 fork banana-slides 的社区部分

**否决**：banana-slides 没有社区功能。

---

## 后果

### 正面
- 无 AGPL 风险
- 可深度按学术场景设计（激励、机器人、内容审核）
- 摆脱直连他库的架构负债
- 社区可独立演进与测试
- 联邦能力保留（不是从零造轮子）

### 负面
- **3-4 周开发成本**
- **丢失 Mastodon 既有用户与联邦关系**（新社区从零开始，用户需重新引导）
- 需要自己实现时间线、搜索、趋势（这些是 Mastodon 最复杂的部分）
- ActivityPub 实现工作量仍大（P2）

### 风险与缓解

| 风险 | 等级 | 对策 |
|---|---|---|
| 时间线性能 | 🔴 | fan-out on-read + 物化视图 + 分区表；先做 Home/Public 两条主线 |
| 话题趋势算法 | 🟡 | 借鉴 `tag_history` + `max_score` 思路；先用简单时间衰减 |
| 前端切换出 bug | 🔴 | COMPATIBLE 模式严格对齐响应结构；契约测试 |
| 用户流失（新社区空）| 🟡 | 迁移期双跑，旧实例保留；可考虑数据迁移而非全新 |
| ActivityPub 工作量大 | 🟡 | 排 P2；不做则 STANDALONE 模式，核心功能不受影响 |

---

## 实施顺序

```
M5.1  domain + schema（自建表，借鉴字段设计）
M5.2  账号 + 帖子 + 评论 + 关注 + 收藏 + 点赞 + 媒体
M5.3  时间线（Home / Public / Tag）
M5.4  通知 + 话题趋势 + 搜索
M5.5  COMPATIBLE 模式对齐 → 切流
M5.6  独有资产：AI 审核 + 奖励币 + arXiv 机器人
M6+   federation（ActivityPub）—— 独立排期
```

**M5.5 是切换闸门**：对齐通过后前端零改动切流。
