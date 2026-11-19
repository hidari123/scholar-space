"""内容语言测试。

⚠️ 这些是 ADR-0006「界面语言与内容语言解耦」的直接验证。
"""

from __future__ import annotations

import pytest

from scholar_llm.domain.languages import (
    LANGUAGE_NAMES,
    ContentLanguage,
    resolve_auto_language,
    validate_content_language,
)


class TestContentLanguage:
    """内容语言枚举。"""

    def test_has_20_concrete_languages_plus_auto(self) -> None:
        """20 种具体语言 + auto。"""
        assert len(list(ContentLanguage)) == 21

    def test_auto_is_included(self) -> None:
        """auto 是其中一种。"""
        assert ContentLanguage.AUTO in list(ContentLanguage)

    def test_simplified_and_traditional_are_distinct(self) -> None:
        """⚠️ 简繁是不同的内容语言 —— 不能合并。

        这与界面语言的 12 种不一样：
        界面语言按「用户看到的」分（简繁也是两种界面）；
        内容语言按「LLM 写出来的」分 —— 简体和繁体确实要分开。
        """
        assert ContentLanguage.ZH_CN != ContentLanguage.ZH_TW
        assert ContentLanguage.ZH_CN.value == "zh-CN"
        assert ContentLanguage.ZH_TW.value == "zh-TW"

    def test_english_has_base_and_regional_variants(self) -> None:
        """en / en-GB / en-US 三种都存在。"""
        assert ContentLanguage.EN.value == "en"
        assert ContentLanguage.EN_GB.value == "en-GB"
        assert ContentLanguage.EN_US.value == "en-US"

    def test_rtl_languages_present(self) -> None:
        """RTL 语言（阿拉伯语/希伯来语/波斯语）都在。

        ⚠️ RTL 不只是界面语言的事 —— 生成 RTL 内容同样需要处理。
        """
        assert ContentLanguage.AR.value == "ar"
        assert ContentLanguage.HE.value == "he"
        assert ContentLanguage.FA.value == "fa"

    def test_every_language_has_a_self_name(self) -> None:
        """每种语言都有自称 —— 给 LLM 看的提示词要用。"""
        for language in ContentLanguage:
            if language is ContentLanguage.AUTO:
                continue
            assert language.value in LANGUAGE_NAMES, f"{language.value} 缺少自称"


class TestValidateContentLanguage:
    """语言校验。"""

    def test_accepts_valid_language(self) -> None:
        """合法语言。"""
        assert validate_content_language("zh-CN") is ContentLanguage.ZH_CN

    def test_accepts_auto(self) -> None:
        """auto 合法。"""
        assert validate_content_language("auto") is ContentLanguage.AUTO

    def test_rejects_unknown_language(self) -> None:
        """⚠️ 未知语言必须报错，不能静默降级。"""
        with pytest.raises(ValueError, match="不支持的内容语言"):
            validate_content_language("xx-XX")

    def test_error_lists_supported_languages(self) -> None:
        """⚠️ 报错信息要告诉用户支持哪些 —— 否则没法自查。"""
        with pytest.raises(ValueError) as exc_info:
            validate_content_language("xx-XX")

        message = str(exc_info.value)
        assert "zh-CN" in message
        assert "auto" in message


class TestResolveAutoLanguage:
    """auto 解析。"""

    def test_non_auto_returns_itself(self) -> None:
        """⚠️ 指定了具体语言就原样返回 —— 不能被检测结果覆盖。"""
        assert resolve_auto_language(ContentLanguage.ZH_CN, detected="en") == "zh-CN"

    def test_auto_uses_detected_language(self) -> None:
        """auto + 检测到英文 → 英文。"""
        assert resolve_auto_language(ContentLanguage.AUTO, detected="en") == "en"

    def test_auto_falls_back_to_primary_language(self) -> None:
        """⚠️ 检测到带区域但没登记的 → 退到主语言。

        检测器常返回 "en-GB-x" 这类带扩展的标签。
        """
        assert resolve_auto_language(ContentLanguage.AUTO, detected="en-GB-x") == "en-GB"

    def test_auto_maps_script_tags_to_chinese_variants(self) -> None:
        """⚠️ `zh-Hans` / `zh-Hant` → 简 / 繁。

        语言检测器常输出脚本标签而不是区域标签。
        不处理的话中文会掉到英文兜底 ——
        结果是「中文论文被总结成英文」。
        """
        assert resolve_auto_language(ContentLanguage.AUTO, detected="zh-Hans") == "zh-CN"
        assert resolve_auto_language(ContentLanguage.AUTO, detected="zh-Hant") == "zh-TW"

    def test_auto_keeps_registered_regional_variant(self) -> None:
        """⚠️ 已登记的区域变体要原样保留。

        en-GB 和 en-US 是**不同的**内容语言 —— 不能都退成 en。
        """
        assert resolve_auto_language(ContentLanguage.AUTO, detected="en-GB") == "en-GB"
        assert resolve_auto_language(ContentLanguage.AUTO, detected="en-US") == "en-US"

    def test_auto_falls_back_to_english_when_undetectable(self) -> None:
        """⚠️ 检测不到 → 英文。

        理由：LLM 对英文的服从度最高，兜底英文最稳。
        比兜底中文好 —— 英文模型的中文输出质量通常更稳定。
        """
        assert resolve_auto_language(ContentLanguage.AUTO, detected=None) == "en"
        assert resolve_auto_language(ContentLanguage.AUTO, detected="") == "en"

    def test_auto_ignores_unknown_detected_language(self) -> None:
        """检测到完全不认识的语言 → 兜底英文。"""
        assert resolve_auto_language(ContentLanguage.AUTO, detected="xx-XX") == "en"
