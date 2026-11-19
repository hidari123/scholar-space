# 08 — slides 演示文稿引擎

> `@scholarspace/slides` —— 输入论文/主题，输出**可编辑**的 .pptx。

---

> **✅ 实现状态（2026-11-19）**：
>
> | 部分 | 状态 | 位置 |
> |---|---|---|
> | 领域层（实体/主题/值对象）| ✅ | `scholarspace-slides/libs/slides-core` |
> | PPTX 矢量渲染 | ✅ | `scholarspace-slides/libs/slides-render` |
> | 8 套内置学术主题 | ✅ | 同上 `domain/builtin_themes.py` |
> | 文本量测 + 中英混排断行 | ✅ | 同上 `layout/measure.py` |
> | **G2 闸门** | ✅ **通过** | `docs/adr/0019-g2-gate-review.md` |
> | PNG 预览 | ⬜ | M3.1 |
> | 真实论文端到端验证 | ⬜ | M3.1 |
> | Pillow 真实字体度量 | ⬜ | M3.1 |
> | 图片渲染 | ⬜ | M3.2 |
> | 溢出降级（TRUNCATE/SPLIT/REGENERATE）| ⬜ | M3.2 |
> | PDF 导出 | ⬜ | M3.3 |
> | HTTP 层 | ⬜ | M3.3 |

---

## 1. 定位

| 能力 | 说明 |
|---|---|
| 输入 | 论文（file_md5 / PDF）、Markdown 大纲、主题描述、参考文件 |
| 过程 | 规划 → 内容 → 排版 → 渲染 |
| 输出 | **.pptx（可编辑）** / PDF / PNG 图片集 / 大纲 JSON |

### 1.1 两条渲染路线并存

| 路线 | 描述 | 优点 | 缺点 | 定位 |
|---|---|---|---|---|
| **A 矢量式** | python-pptx 原生文本框/形状/图表 | ✅ 文字可选中可编辑、文件小、Office 友好 | 排版受限 | **主力** |
| **B 图像式** | 图像模型生成整页 → PPTX 贴图 | 视觉精美、所见即所得 | 不可编辑、文件大 | **可选**（PPT 专业人员做灵感参考）|

**为什么 A 是主力**：学术场景刚需 —— 用户要改标题、加导师姓名、加基金号。图像式做不到。

> 借鉴 banana-slides 的 `image_editability/`（坐标映射 + OCR 文字属性提取 + inpaint），是"图像式 → 近似可编辑"的折中方案。**作为 B 路线的增强**，不作为主力。

---

## 2. 包结构

```
scholarspace/slides/
├── pyproject.toml
├── importlinter.ini
├── src/slides/
│   ├── domain/
│   │   ├── entities.py        SlideProject / SlidePage / PageVersion
│   │   ├── value_objects.py   SlideId / ProjectId / CanvasRatio / PageLayout
│   │   ├── plan.py            SlidePlan / OutlineNode
│   │   ├── theme_spec.py      ThemeSpec / Palette / FontSpec / LayoutSpec
│   │   ├── events.py
│   │   └── errors.py
│   │
│   ├── application/
│   │   ├── use_cases/
│   │   │   ├── create_project.py
│   │   │   ├── plan_slides.py        # LLM 生成大纲
│   │   │   ├── compose_pages.py      # 内容组装
│   │   │   ├── layout_pages.py       # 排版
│   │   │   ├── render_project.py     # 渲染
│   │   │   ├── update_page.py
│   │   │   └── export_project.py
│   │   ├── ports/
│   │   │   ├── llm.py                # LLMPort
│   │   │   ├── renderer.py           # RendererPort
│   │   │   ├── content_source.py     # ContentSourcePort
│   │   │   ├── progress.py           # ProgressPort
│   │   │   ├── storage.py            # StoragePort
│   │   │   ├── repository.py
│   │   │   └── billing.py            # 计费 Port
│   │   └── pipeline.py               # 编排
│   │
│   ├── infrastructure/
│   │   ├── prompts/                  # ⭐ 移植 banana-slides 提示词库
│   │   │   ├── __init__.py
│   │   │   ├── outline.py
│   │   │   ├── page_description.py
│   │   │   ├── image.py
│   │   │   ├── refinement.py
│   │   │   └── extraction.py
│   │   ├── content/
│   │   │   ├── source_adapter.py     # PaperArtifact / PDF / Markdown / Topic
│   │   │   ├── figures.py            # 图片抽取
│   │   │   ├── charts.py             # matplotlib → PNG
│   │   │   └── citations.py
│   │   ├── layout/
│   │   │   ├── measure.py            # ⭐ 移植 generate_poster_pil
│   │   │   ├── fonts.py              # ⭐ 跨平台字体解析（改造）
│   │   │   ├── engine.py             # 排版主流程
│   │   │   ├── overflow.py           # 溢出处理
│   │   │   └── placeholders/         # 版式占位符
│   │   ├── render/
│   │   │   ├── pptx_renderer.py      # python-pptx
│   │   │   ├── png_renderer.py       # 预览
│   │   │   └── pdf_exporter.py
│   │   ├── themes/
│   │   │   ├── builtin/              # 8 套学术主题
│   │   │   └── registry.py
│   │   └── repositories/
│   │
│   ├── interfaces/
│   │   ├── http/
│   │   │   ├── projects.py
│   │   │   ├── pages.py
│   │   │   ├── render.py
│   │   │   └── export.py
│   │   └── dto.py
│   │
│   ├── schemas/slide-plan.schema.json
│   ├── config.py
│   └── main.py
├── tests/{unit,integration,contract}/
└── docs/
```

---

## 3. 领域模型

```python
# slides/domain/value_objects.py
class CanvasRatio(Enum):
    WIDE_16_9 = "16:9"       # 默认（学术汇报最常用）
    STANDARD_4_3 = "4:3"
    A4_PORTRAIT = "A4"

class PageLayout(Enum):
    TITLE = "title"
    SECTION = "section"
    AGENDA = "agenda"
    BULLETS = "bullets"
    TWO_COLUMN = "two_column"
    IMAGE_FOCUS = "image_focus"
    IMAGE_LEFT = "image_left"
    CHART = "chart"
    TABLE = "table"
    QUOTE = "quote"
    COMPARISON = "comparison"
    TIMELINE = "timeline"
    CONCLUSION = "conclusion"
    REFERENCES = "references"


# slides/domain/entities.py
@dataclass(frozen=True, slots=True)
class SlideProject:
    project_id: ProjectId
    owner_id: int
    title: str
    source_type: SourceType        # PAPER | PDF | MARKDOWN | TOPIC
    source_ref: str
    lang: str                      # 内容语言
    theme_id: str
    canvas_ratio: CanvasRatio
    status: ProjectStatus
    plan: SlidePlan | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class SlidePage:
    page_id: PageId
    project_id: ProjectId
    order_no: int
    layout: PageLayout
    title: str
    bullets: tuple[str, ...]
    image_refs: tuple[ImageRef, ...]
    chart_spec: ChartSpec | None
    table_spec: TableSpec | None
    notes: str                    # 演讲备注
    overflow: OverflowStrategy
    rendered_image_url: str | None


@dataclass(frozen=True, slots=True)
class SlidePlan:
    """LLM 产出的结构化大纲。"""
    pages: tuple[SlidePage, ...]
    theme_id: str
    model_info: ModelInfo
    version: int
```

---

## 4. 流水线

```
输入（论文 / PDF / MD / 主题）
  │
  ├─[1] ContentSourceAdapter        提取全文 + 图片 + 元数据
  │     ├─ PaperArtifactAdapter     ← 接 paper 包的 DTO
  │     ├─ PdfAdapter
  │     ├─ MarkdownAdapter
  │     └─ TopicAdapter
  │
  ├─[2] Planner (LLM)               → SlidePlan JSON
  │     使用迁移的提示词库 + 结构化输出
  │
  ├─[3] ContentComposer             挂载图片 / 生成图表 / 补引用
  │
  ├─[4] LayoutEngine                逐页排版
  │     measure → fit → overflow 处理
  │
  ├─[5] Renderer                    → .pptx + 每页 PNG 预览
  │
  └─[6] Orchestrator                状态机 + SSE 进度 + 计费埋点
```

### 4.1 状态机

```python
class ProjectStatus(Enum):
    DRAFT = "draft"
    PLANNING = "planning"
    COMPOSING = "composing"
    LAYOUTING = "layouting"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"
```

**进度事件**（通过 `ProgressPort` 发到 `events` 包）：
```python
class SlideEventType(str, Enum):
    PROJECT_CREATED = "slides.project.created"
    PLANNING_STARTED = "slides.planning.started"
    PAGE_PLANNED = "slides.page.planned"
    PAGE_LAYOUTED = "slides.page.layouted"
    PAGE_RENDERED = "slides.page.rendered"
    RENDER_COMPLETED = "slides.render.completed"
    EXPORT_READY = "slides.export.ready"
    FAILED = "slides.failed"
```

---

## 5. 排版引擎（核心）

### 5.1 文本量测（移植 `generate_poster_pil.py`）

```python
# slides/infrastructure/layout/measure.py
@dataclass(frozen=True, slots=True)
class TextStyle:
    font_family: str
    font_size: float          # pt
    font_weight: int
    line_spacing: float
    max_width: float          # pt


@dataclass(frozen=True, slots=True)
class TextMetrics:
    width: float
    height: float
    line_count: int
    overflow: bool


class TextMeasurer:
    """跨平台字体度量。零外部依赖（除 Pillow）。"""

    def __init__(self, font_resolver: FontResolver) -> None:
        self._fonts = font_resolver

    def measure(self, text: str, style: TextStyle) -> TextMetrics:
        """返回宽/高/行数/是否溢出"""

    def wrap(self, text: str, style: TextStyle) -> tuple[str, ...]:
        """自动换行。
        ★ 移植原 draw_simple_text_wrapped 的逻辑：
          - 中文按「一」字宽估算每行字数
          - 英文按 textwrap 词边界
        """

    def parse_rich(self, text: str) -> tuple[RichSpan, ...]:
        """解析 **粗体** / __下划线__ / `代码`
        ★ 移植原 extract_bold_parts
        """
```

### 5.2 字体解析（跨平台改造）

**原版问题**：只支持 Windows 字体（`msyh.ttc` / `simhei.ttf`），Linux 会 fallback 到默认字体 → **中文变方块**。

```python
# slides/infrastructure/layout/fonts.py
class FontResolver:
    FALLBACK_CHAIN = {
        "cjk": ("Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei",
                "PingFang SC", "WenQuanYi Micro Hei"),
        "latin": ("Inter", "Helvetica Neue", "Segoe UI", "Roboto", "Arial"),
        "mono": ("JetBrains Mono", "SF Mono", "Cascadia Code", "Consolas"),
    }

    def resolve(self, family: str, weight: int, size: float) -> FreeTypeFont:
        """按 fallback chain 逐个尝试；全失败则用内置 Noto CJK（随包分发）"""
```

**兜底策略**：Docker 镜像里预装 `fonts-noto-cjk`，保证 Linux 容器内中文正常。

### 5.3 溢出处理（PPT 特有难题）

原海报是单列无限长，没有溢出问题；PPT 有。

```python
# slides/application/layout/overflow.py
class OverflowResolver:
    async def resolve(self, page: SlidePage, theme: ThemeSpec) -> tuple[SlidePage, ...]:
        """
        四级降级：
        ① SHRINK     缩小字号（最多降 3 级，每级 -0.5pt）
        ② TRUNCATE   截断加「…」，记录 warning
        ③ SPLIT      拆成两页（「（续）」），重新排版
        ④ REGENERATE 回退给 LLM 压缩内容（最慢，最后手段）
        """
```

### 5.4 主题系统

```python
# slides/domain/theme_spec.py
@dataclass(frozen=True, slots=True)
class ThemeSpec:
    theme_id: str
    name_key: str                          # i18n key
    palette: Palette                       # 主/辅/强调/文字/背景
    fonts: FontSpec                        # 标题/正文/代码（中英分别指定）
    canvas: CanvasSpec                    # 尺寸/边距/安全区
    layouts: Mapping[PageLayout, LayoutSpec]
```

**内置 8 套学术主题**：

| 主题 | 风格 |
|---|---|
| `academic-blue` | 学术蓝（正式）|
| `academic-purple` | 学术紫（沿用品牌色 `#611F6A`）|
| `minimal-grey` | 极简灰（打印友好）|
| `nature-green` | Nature 绿 |
| `science-orange` | 活力橙 |
| `dark-tech` | 暗色科技 |
| `blackboard` | 黑板（教学）|
| `template-white` | 纯白（Office 友好）|

**主题配置是数据**，存 JSON，可由用户上传/编辑（对齐平台"主题可配置"要求）。

---

## 6. 渲染器

### 6.1 PPTX（主力）

```python
# slides/infrastructure/render/pptx_renderer.py
class PptxRenderer:
    """python-pptx → 真 .pptx（Office/WPS 可编辑）。"""

    def render(self, plan: SlidePlan, theme: ThemeSpec) -> RenderResult:
        prs = Presentation()
        prs.slide_width = Emu(theme.canvas.width_emu)
        prs.slide_height = Emu(theme.canvas.height_emu)

        for page in plan.pages:
            slide = prs.slides.add_slide(prs.slide_layouts[6])   # blank
            spec = theme.layouts[page.layout]
            self._apply_layout(slide, spec, page, theme)

        prs.save(output_path)
```

**排版实现**：
- 标题/正文用 `textbox` + `TextFrame` + `paragraph` + `run`
- 字号、行距、颜色从 `theme.tokens` 取
- 图表用 `python-pptx` 原生 chart（**可编辑图表**）或 matplotlib PNG（二选一）
- 图片按 `ImageRef` 从存储拉取，等比缩放后居中

**输出必须是真 .pptx**（不是图片贴图）—— 这是与 banana-slides 图像路线的本质区别。

### 6.2 PNG 预览

```python
class PngRenderer:
    """Pillow → 每页 PNG，供前端画布预览。"""
```
- 复用 `measure.py` 的度量结果 → 保证预览与导出**像素级一致**
- 渲染到 MinIO → 返回 URL

### 6.3 导出

| 格式 | 实现 |
|---|---|
| `.pptx` | python-pptx 直接产出 |
| `.pdf` | LibreOffice headless 转（容器内预装）或 reportlab 重排 |
| `.zip`（图片集）| PNG 打包 |
| `.md`（大纲）| Markdown |

---

## 7. 提示词库（移植）

**来源**：`scholarclub-ppt-service/backend/services/prompts.py`（1032 行，15 个 prompt 函数）

**移植清单**：

| 原函数 | 新位置 | 备注 |
|---|---|---|
| `get_outline_generation_prompt` | `prompts/outline.py` | ⭐ 核心 |
| `get_outline_parsing_prompt` | `prompts/outline.py` | |
| `get_page_description_prompt` | `prompts/page_description.py` | ⭐ 核心 |
| `get_image_generation_prompt` | `prompts/image.py` | 图像式路线用 |
| `get_image_edit_prompt` | `prompts/image.py` | |
| `get_description_to_outline_prompt` | `prompts/outline.py` | |
| `get_description_split_prompt` | `prompts/outline.py` | |
| `get_outline_refinement_prompt` | `prompts/refinement.py` | ⭐ 自然语言改稿 |
| `get_descriptions_refinement_prompt` | `prompts/refinement.py` | |
| `get_clean_background_prompt` | `prompts/image.py` | |
| `get_text_attribute_extraction_prompt` | `prompts/extraction.py` | 图像式可编辑导出 |
| `get_batch_text_attribute_extraction_prompt` | `prompts/extraction.py` | |
| `get_quality_enhancement_prompt` | `prompts/image.py` | |
| `get_ppt_page_content_extraction_prompt` | `prompts/extraction.py` | ⭐ 论文 → 页面 |
| `get_layout_caption_prompt` | `prompts/extraction.py` | |
| `get_style_extraction_prompt` | `prompts/extraction.py` | |
| `LANGUAGE_CONFIG` + `get_language_instruction` | → `llm` 包（**不放在 slides**）| 20 种语言 |
| `get_ppt_language_instruction` | → `llm` 包 | |

**改造要点**：
1. **语言指令统一由 `llm` 包注入** → slides 不再关心语言
2. **结构化输出**：所有大纲/描述输出改为 **JSON Schema**（不用 `eval()`）
3. **提示词版本化**：`PROMPT_VERSION` 参与缓存键（借鉴 PaperSketch 的版本化缓存思路）

---

## 8. 内容来源适配

```python
# slides/infrastructure/content/source_adapter.py
class ContentSourcePort(Protocol):
    async def extract(self, ref: str, lang: str) -> ExtractedContent: ...


@dataclass(frozen=True, slots=True)
class ExtractedContent:
    title: str
    body: str                    # Markdown
    summary_sections: tuple[tuple[str, str], ...]   # 复用 PaperSketch 结构
    figures: tuple[FigureRef, ...]
    tables: tuple[TableSpec, ...]
    citations: tuple[Citation, ...]
    metadata: Mapping[str, Any]
```

**实现**：
| Adapter | 来源 |
|---|---|
| `PaperArtifactAdapter` | `paper` 包的 `PaperArtifact` DTO（**主要路径**）|
| `PdfAdapter` | 直接解析 PDF（MinerU / PyMuPDF）|
| `MarkdownAdapter` | 用户上传的 .md |
| `TopicAdapter` | 只有主题（无资料）→ LLM 从零生成 |

> ⚠️ `slides` **不 import `paper`**（护栏 G4）。`PaperArtifactAdapter` 的实现由 `apps/gateway` 注入，或 `paper` 包主动注册。

---

## 9. 数据模型

```sql
CREATE TABLE slide_projects (
    id            UUID PRIMARY KEY,
    owner_id      BIGINT      NOT NULL,
    title         TEXT        NOT NULL,
    source_type   TEXT        NOT NULL,      -- paper | pdf | markdown | topic
    source_ref    TEXT,
    lang          TEXT        NOT NULL DEFAULT 'zh',
    theme_id      TEXT        NOT NULL,
    canvas_ratio  TEXT        NOT NULL DEFAULT '16:9',
    status        TEXT        NOT NULL DEFAULT 'draft',
    plan          JSONB,                     -- SlidePlan
    model_info    JSONB,
    prompt_version TEXT,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE slide_pages (
    id            UUID PRIMARY KEY,
    project_id    UUID        NOT NULL REFERENCES slide_projects(id) ON DELETE CASCADE,
    order_no      INTEGER     NOT NULL,
    layout        TEXT        NOT NULL,
    title         TEXT,
    bullets       JSONB       NOT NULL DEFAULT '[]',
    image_refs    JSONB       NOT NULL DEFAULT '[]',
    chart_spec    JSONB,
    table_spec    JSONB,
    notes         TEXT,
    overflow      TEXT,
    rendered_url  TEXT,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE slide_page_versions (
    id            UUID PRIMARY KEY,
    page_id       UUID        NOT NULL REFERENCES slide_pages(id) ON DELETE CASCADE,
    version_no    INTEGER     NOT NULL,
    payload       JSONB       NOT NULL,
    image_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE slide_runs (
    id            UUID PRIMARY KEY,
    project_id    UUID        NOT NULL,
    status        TEXT        NOT NULL,
    progress      INTEGER     NOT NULL DEFAULT 0,
    error         JSONB,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);
```

---

## 10. 前端（`apps/slides-web`）

### 10.1 页面

```
/slides                    项目列表
/slides/new                创建（选来源 + 主题 + 语言）
/slides/:id                ⭐ 编辑器
/slides/:id/preview        导出预览
```

### 10.2 编辑器（`EditorPage` 模式）

```
┌────────────────────────────────────────────────────┐
│ 工具栏：撤销/重做/生成/保存/导出/主题/语言           │
├──────────┬──────────────────────────┬──────────────┤
│ 大纲树    │      画布预览（PNG 流式）   │ 属性面板      │
│ 拖拽排序  │      翻页/缩放/框选         │ 布局/主题/    │
│ 增删页    │                          │ 文字/备注     │
├──────────┴──────────────────────────┴──────────────┤
│ AI 助手：改写要点 / 换图 / 生成讲稿 / 拆分页         │
└────────────────────────────────────────────────────┘
```

### 10.3 状态管理

```typescript
// Zustand，按领域切分
useProjectStore     // 项目 + 页面列表
useSelectionStore   // 当前选中页/元素
useGenerationStore  // 生成进度（订阅 SSE）
useThemeStore       // 主题/语言/画布比
```

---

## 11. 计费

| 动作 | 计费点 | 说明 |
|---|---|---|
| 生成大纲 | LLM tokens | 走 `billing` 包 |
| 生成页面描述 | LLM tokens | |
| 渲染 | CPU 时长 | 按页数 |
| 导出 | 每次 | |

**通过 `BillingPort` 注入**，`slides` 不直接依赖 `billing` 的实现。

---

## 12. 里程碑

| 阶段 | 内容 | 工期 |
|---|---|---|
| **M3.0** | PoC：PaperSketch 数据 → python-pptx → 真实 .pptx | 1 周 |
| M3.1 | domain + schema + 仓储 + REST | 1 周 |
| M3.2 | Planner（提示词移植 + 结构化输出）| 1 周 |
| M3.3 | LayoutEngine（量测 + 字体 + 溢出 + 主题）| 1.5 周 |
| M3.4 | Renderer（PPTX + PNG）+ 导出 | 1 周 |
| M3.5 | 前端编辑器 | 1.5 周 |

**M3.0 是里程碑闸门**：如果矢量式排版效果达不到预期，立即调整策略（加大图像式权重），不要等到 M3.5。

---

## 13. 风险

| 风险 | 等级 | 对策 |
|---|---|---|
| 矢量式排版效果不如图像式 | 🔴 | M3.0 PoC 先验证；保留图像式 + 图像式可编辑增强 |
| LLM 产出大纲质量不稳定 | 🔴 | 结构化输出 + Schema 校验 + 失败重试 + 用户可编辑后重排 |
| 中文字体在容器缺失 | 🟡 | 镜像预装 `fonts-noto-cjk` + 内置字体兜底 |
| 大 PPT 渲染慢 | 🟡 | 异步任务 + 页级增量渲染 + PNG 缓存 |
| 提示词移植失真 | 🟡 | 保留原文件作为对照，逐个函数移植 + 效果回归 |
