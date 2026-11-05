from intelligence_scope import (
    assess_documents,
    normalize_scope,
    scope_prompt_context,
    scope_search_query,
    score_text,
)


def test_global_scope_is_unrestricted():
    result = score_text("Infrastructure in any country", {"profile_id": "global"})
    assert result["score"] == 100.0
    assert result["level"] == "global"


def test_zambia_profile_recognises_local_signals():
    result = score_text(
        "A Zambian bank at portal.example.zm reported a K2500 ransom demand.",
        {"profile_id": "zambia"},
    )
    assert result["score"] >= 30
    assert result["level"] in {"medium", "high"}
    assert ".zm domain" in result["matched_signals"]


def test_custom_scope_supports_any_country_or_region():
    scope = normalize_scope(
        {
            "profile_id": "custom",
            "focus_name": "Kenya",
            "keywords": ["Nairobi", ".ke"],
        }
    )
    result = score_text("The Nairobi target used example.ke", scope)
    assert scope["label"] == "Kenya"
    assert result["score"] > 0
    assert "Nairobi" in result["matched_signals"]


def test_scope_augments_only_focused_searches():
    assert scope_search_query("LockBit activity", {"profile_id": "global"}) == "LockBit activity"
    assert scope_search_query("LockBit activity", {"profile_id": "zambia"}) == "LockBit activity Zambia"
    assert scope_search_query("LockBit Zambia", {"profile_id": "zambia"}) == "LockBit Zambia"


def test_assessment_keeps_cross_border_documents():
    result = assess_documents(
        ["ZICTA reported activity in Lusaka.", "The actor also used a server in Europe."],
        {"profile_id": "zambia"},
    )
    assert result["documents_assessed"] == 2
    assert result["documents_matched"] == 1
    assert "cross-border context" in result["rationale"]


def test_prompt_explains_evidence_boundary():
    prompt = scope_prompt_context({"profile_id": "custom", "focus_name": "West Africa"})
    assert "West Africa" in prompt
    assert "direct local evidence" in prompt
