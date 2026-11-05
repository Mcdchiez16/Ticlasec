"""Tests for LLM utility functions."""
import pytest
import sys
import os

# Add the parent directory to sys.path to import llm
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ticlasec.llm import select_relevant_pages


def make_page(text: str, url: str = "http://test.onion") -> dict:
    return {"link": url, "content": text, "status": 200}


def test_select_relevant_pages_empty():
    """Empty input returns empty list."""
    result = select_relevant_pages("ransomware", [], max_chars=10000)
    assert result == []


def test_get_llm_uses_runtime_provider_key_when_api_keys_omitted(monkeypatch):
    """A key injected after module import must reach the LangChain client."""
    from unittest.mock import patch
    from langchain_openai import ChatOpenAI
    from ticlasec.llm import get_llm

    monkeypatch.setenv("OPENROUTER_API_KEY", "runtime-openrouter-key")
    with patch.object(ChatOpenAI, "__init__", return_value=None) as init:
        get_llm("openrouter/test-model")

    assert init.call_args.kwargs["api_key"] == "runtime-openrouter-key"


def test_get_llm_uses_only_selected_provider_key():
    """Other configured provider keys must not overwrite the selected key."""
    from unittest.mock import patch
    from langchain_openai import ChatOpenAI
    from ticlasec.llm import get_llm

    with patch.object(ChatOpenAI, "__init__", return_value=None) as init:
        get_llm(
            "hetzner/Qwen/Qwen3.6-35B-A3B-FP8",
            api_keys={
                "HETZNER_API_KEY": "hetzner-test-key",
                "OPENAI_API_KEY": "openai-test-key",
                "GROQ_API_KEY": "groq-test-key",
            },
        )

    assert init.call_args.kwargs["api_key"] == "hetzner-test-key"
    assert init.call_args.kwargs["base_url"] == "https://inference.hetzner.com/api/v1"


def test_select_relevant_pages_fits_budget():
    """Pages that fit in budget are all returned."""
    pages = [make_page("a" * 100, f"http://{i}.onion") for i in range(5)]
    result = select_relevant_pages("test query", pages, max_chars=10000)
    assert len(result) == 5


def test_select_relevant_pages_selects_embedding_model_before_small_run_shortcut():
    """The fallback notice path is reached even when ranking is unnecessary."""
    from unittest.mock import MagicMock, patch

    pages = [make_page("x" * 100)]
    with patch("ticlasec.llm._get_embed_model", return_value=MagicMock()) as get_model:
        assert select_relevant_pages("test query", pages, max_chars=10000) == pages
    get_model.assert_called_once()


def test_select_relevant_pages_trims_to_budget():
    """Pages exceeding budget are trimmed."""
    pages = [make_page("x" * 3000, f"http://{i}.onion") for i in range(20)]
    result = select_relevant_pages("test query", pages, max_chars=10000)
    total_chars = sum(len(p.get("content", "") or p.get("text", "")) for p in result)
    assert total_chars <= 12000  # max_chars + some buffer (the logic uses 0.9 * max_chars in some cases)
    assert len(result) < 20


def test_select_relevant_pages_skips_empty():
    """Pages with no content are skipped."""
    pages = [
        make_page("", "http://empty.onion"),
        make_page("real content about ransomware LockBit bitcoin " * 3, "http://real.onion"),
        make_page("   ", "http://whitespace.onion"),
    ]
    result = select_relevant_pages("LockBit ransomware", pages, max_chars=10000)
    assert len(result) == 1
    assert result[0]["link"] == "http://real.onion"


def test_select_relevant_pages_handles_dict_input():
    """Pages passed as list of dicts with mixed keys are handled correctly."""
    # The pipeline uses both 'content' and 'text' key names
    pages = [
        {"content": "LockBit ransomware bitcoin wallet " * 5, "link": "http://a.onion"},
        {"text": "Conti group victims list " * 10, "link": "http://b.onion"},
    ]
    result = select_relevant_pages("ransomware", pages, max_chars=10000)
    assert len(result) == 2


def test_generate_summary_no_template_error_on_json_content():
    """Content with JSON curly braces must not raise a LangChain template variable error."""
    from unittest.mock import MagicMock, patch
    from langchain_core.messages import AIMessage

    from ticlasec.llm import generate_summary

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content="threat intel summary")

    pages = [
        {
            "url": "http://test.onion",
            "content": '{"value": "test"} lockbit ransomware bitcoin wallet address leak',
        }
    ]

    with patch("ticlasec.llm.select_relevant_pages", return_value=pages):
        result = generate_summary(
            llm=mock_llm,
            query="ransomware",
            content=pages,
        )

    assert isinstance(result, str)
    assert result != ""


def test_generate_summary_with_json_content():
    """Content with JSON curly braces must not raise a LangChain template variable error."""
    from unittest.mock import MagicMock, patch

    from ticlasec.llm import generate_summary

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = "test summary"

    pages = [
        {
            "url": "http://test.onion",
            "content": '{"value": "test", "key": 123}',
        }
    ]

    with patch("ticlasec.llm.select_relevant_pages", return_value=pages):
        result = generate_summary(
            llm=mock_llm,
            query="ransomware",
            content=pages,
        )

    assert isinstance(result, str)
    assert result == "test summary"


def test_generate_summary_requests_plain_english_evidence_briefing():
    """The report prompt must explain findings without presenting weak matches as proof."""
    from unittest.mock import MagicMock, patch

    from ticlasec.llm import generate_summary

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = "briefing"
    pages = [{"url": "http://test.onion", "content": "A possible name match in an unverified forum post."}]

    with patch("ticlasec.llm.select_relevant_pages", return_value=pages):
        generate_summary(llm=mock_llm, query="Example Person", content=pages)

    prompt = mock_llm.invoke.call_args.args[0]
    assert "not a cybersecurity specialist" in prompt
    assert "## Executive assessment" in prompt
    assert "## Threat activity observed" in prompt
    assert "## Threat actors and groups" in prompt
    assert "## Technical indicators and TTPs" in prompt
    assert "## Priority defensive actions" in prompt
    assert "## Confidence and evidence gaps" in prompt
    assert "Not identified in the collected evidence" in prompt
    assert "do not turn a search result or automated extraction into a confirmed allegation" in prompt


def test_generate_summary_always_includes_high_signal_entity_leads():
    """Concrete actor and CVE leads must not disappear when source text is long."""
    from unittest.mock import MagicMock, patch

    from ticlasec.llm import generate_summary

    mock_llm = MagicMock()
    mock_llm.invoke.return_value = "briefing"
    pages = [{
        "url": "https://example.test/report",
        "content": "Critical infrastructure incident evidence. " * 200,
    }]
    entities = [
        {
            "entity_type": "RANSOMWARE_GROUP",
            "value": "ExampleGroup",
            "confidence": 0.91,
            "source_count": 2,
            "context_snippet": "ExampleGroup claimed the reported intrusion.",
        },
        {
            "entity_type": "CVE",
            "value": "CVE-2026-1234",
            "confidence": 0.87,
            "source_count": 1,
        },
        {
            "entity_type": "EMAIL",
            "value": "private@example.test",
            "confidence": 1.0,
        },
    ]

    with patch("ticlasec.llm.select_relevant_pages", return_value=pages):
        generate_summary(
            llm=mock_llm,
            query="critical infrastructure attacks",
            content=pages,
            entities=entities,
        )

    prompt = mock_llm.invoke.call_args.args[0]
    assert "EXTRACTED EVIDENCE LEADS" in prompt
    assert "ExampleGroup" in prompt
    assert "CVE-2026-1234" in prompt
    assert "private@example.test" not in prompt


def test_refined_query_keeps_complete_time_window():
    from ticlasec.llm import _clean_refined_query

    assert _clean_refined_query(
        "critical infrastructure attacks reported in the last 30 days"
    ) == "critical infrastructure attacks reported in the last 30 days"


def test_generate_summary_raises_summary_unavailable_on_llm_error():
    """A failed LLM raises SummaryUnavailable; it never returns an error string."""
    from unittest.mock import MagicMock, patch

    import pytest

    from ticlasec.llm import SummaryUnavailable, generate_summary

    failing_llm = MagicMock()
    failing_llm.side_effect = Exception("LLM API error sk-secret-123")

    pages = [
        {"url": "http://test.onion", "content": "lockbit ransomware bitcoin payment"},
        {"url": "http://test2.onion", "content": "conti group dark web"},
    ]

    with patch("ticlasec.llm.select_relevant_pages", return_value=pages):
        with pytest.raises(SummaryUnavailable) as excinfo:
            generate_summary(
                llm=failing_llm,
                query="ransomware",
                content=pages,
            )

    assert excinfo.value.reason == "llm_error"
    assert excinfo.value.__cause__ is not None
    # The message carries no provider text, so it is safe to surface.
    assert "sk-secret-123" not in str(excinfo.value)
    assert "LLM API error" not in str(excinfo.value)
