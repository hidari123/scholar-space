"""内容语言 —— 20 种 + `auto`。

⚠️ **内容语言与界面语言完全解耦**（ADR-0006）。

    界面语言（UI locale）  → 用户看到的菜单、按钮、提示
    内容语言（content）   → LLM 生成的**内容**用什么语言

    举例：界面是 zh-CN，用户要求「把这篇英文论文总结成中文」——
    界面语言决定按钮写什么，内容语言决定摘要写什么。两者无关。

---

## 为什么有 `auto`

`auto` = **跟随输入的语言**。

    输入是英文 → 输出英文
    输入是中文 → 输出中文

这是最常用的场景 —— 用户贴一篇论文进来，要摘要，
没说语言，那自然是「输入什么语言就用什么语言」。
"""

from __future__ import annotations

from enum import StrEnum

__all__ = [
    "LANGUAGE_NAMES",
    "ContentLanguage",
    "resolve_auto_language",
    "validate_content_language",
]


class ContentLanguage(StrEnum):
    """内容语言。

    ⚠️ **BCP 47 标签** —— 不自己造代码。
       `zh-CN` 与 `zh-TW` 是**不同的**内容语言（简繁不同）。
    """

    #: 跟随输入
    AUTO = "auto"

    # ── 中文 ────────────────────────────────────────────
    ZH_CN = "zh-CN"
    ZH_TW = "zh-TW"
    ZH_HK = "zh-HK"

    # ── 欧洲 ────────────────────────────────────────────
    EN = "en"
    EN_GB = "en-GB"
    EN_US = "en-US"
    FR = "fr"
    DE = "de"
    ES = "es"
    PT = "pt"
    IT = "it"
    RU = "ru"

    # ── 亚洲 ────────────────────────────────────────────
    JA = "ja"
    KO = "ko"

    # ── 中东 ────────────────────────────────────────────
    AR = "ar"
    HE = "he"
    FA = "fa"

    # ── 其他 ────────────────────────────────────────────
    HI = "hi"
    NL = "nl"
    PL = "pl"


#: 语言的自称 —— 给 LLM 看的，不能翻译成英文。
#:
#: ⚠️ 关键：提示词里要写「用中文（简体）输出」而不是「用 Chinese 输出」——
#:    后者对某些模型会理解成「英文里提到 Chinese」。
LANGUAGE_NAMES: dict[str, str] = {
    "zh-CN": "简体中文（Simplified Chinese）",
    "zh-TW": "繁體中文（Traditional Chinese, Taiwan）",
    "zh-HK": "繁體中文（Traditional Chinese, Hong Kong）",
    "en": "English",
    "en-GB": "English (United Kingdom)",
    "en-US": "English (United States)",
    "fr": "Français（French）",
    "de": "Deutsch（German）",
    "es": "Español（Spanish）",
    "pt": "Português（Portuguese）",
    "it": "Italiano（Italian）",
    "ru": "Русский（Russian）",
    "ja": "日本語（Japanese）",
    "ko": "한국어（Korean）",
    "ar": "العربية（Arabic）",
    "he": "עברית（Hebrew）",
    "fa": "فارسی（Persian）",
    "hi": "हिन्दी（Hindi）",
    "nl": "Nederlands（Dutch）",
    "pl": "Polski（Polish）",
}


def validate_content_language(language: str) -> ContentLanguage:
    """校验内容语言。

    ⚠️ 抛异常而不是返回 None —— 调用方必须显式处理「不支持的语言」。

    :param language 语言代码
    :raises ValueError: 不支持的语言
    """
    try:
        return ContentLanguage(language)
    except ValueError as exc:
        supported = ", ".join(sorted(item.value for item in ContentLanguage))
        raise ValueError(f"不支持的内容语言：{language}（支持：{supported}）") from exc


def resolve_auto_language(
    requested: ContentLanguage,
    detected: str | None = None,
) -> str:
    """解析 `auto` → 具体语言。

    :param requested 请求的语言
    :param detected 检测到的输入语言（`auto` 时用）
    :return 具体语言代码（不是 `auto`）

    ⚠️ 检测不到时回退到 `en` 而不是 `zh-CN` ——
       LLM 对英文的服从度最高，兜底英文最稳。
    """
    if requested is not ContentLanguage.AUTO:
        return requested.value

    if detected:
        resolved = _match_language(detected)
        if resolved:
            return resolved

    return ContentLanguage.EN.value


def _match_language(detected: str) -> str | None:
    """把检测结果匹配到已登记的内容语言。

    ⚠️ 匹配顺序很重要 —— 从最精确到最宽松：

        ① 完全匹配          "en-GB"  → en-GB
        ② 脚本/区域子标签    "zh-Hans" → zh-CN
        ③ 主语言匹配         "zh-XX"  → zh（没登记就找带该主语言且唯一的那个）
        ④ 匹配不上          → None（调用方兜底到 en）

    ⚠️ 第②步：语言检测器常输出 `zh-Hans` / `zh-Hant` 这种**脚本标签**，
       而不是 `zh-CN`。不处理的话中文会掉到英文兜底 —— 结果是「中文论文
       被总结成英文」。
    """
    if detected in LANGUAGE_NAMES:
        return detected

    # ② 脚本标签 —— Hans/Hant 是简繁的关键
    script_map = {
        "Hans": "zh-CN",
        "Hant": "zh-TW",
    }
    parts = detected.split("-")
    for part in parts:
        if part in script_map:
            return script_map[part]

    # ③ 主语言 —— 找**最长前缀匹配**的已登记语言
    #    ⚠️ 不能直接取 sorted()[0] ——
    #    "en-GB-x" 的主语言前缀能匹配到 en / en-GB / en-US 三个，
    #    取最小会得到 "en"，把区域信息丢了。
    #    正确做法：从长到短试，能精确匹配上最长那个。
    for length in range(len(parts), 1, -1):
        candidate = "-".join(parts[:length])
        if candidate in LANGUAGE_NAMES:
            return candidate

    primary = parts[0]
    matches = [code for code in LANGUAGE_NAMES if code.split("-")[0] == primary]
    if matches:
        # 多个候选（zh-CN/zh-TW/zh-HK）→ 取第一个（CN 优先，列表有序）
        return sorted(matches)[0]

    return None
