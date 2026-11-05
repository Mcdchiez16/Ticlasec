from utils.lead_quality import assess_intelligence_lead


def _lead(entity_type, value, context, **extra):
    return {
        "entity_type": entity_type,
        "value": value,
        "context_snippet": context,
        "confidence": extra.pop("confidence", 0.97),
        "source_count": extra.pop("source_count", 1),
        **extra,
    }


def test_marketplace_android_is_not_a_ransomware_group():
    result = assess_intelligence_lead(_lead(
        "RANSOMWARE_GROUP",
        "Android",
        "DRUGS | CARDING | RANSOMWARE | GUNS | CRAXS RAT ANDROID SOURCE CODE | Add Your Link | products",
    ))
    assert result["usable"] is False
    assert result["status"] == "rejected"


def test_gift_card_play_is_not_promoted_as_actor():
    result = assess_intelligence_lead(_lead(
        "RANSOMWARE_GROUP",
        "play",
        "Amazon gift card | Google play market gift card | PlayStation Store Gift Card | marketplace products",
    ))
    assert result["usable"] is False


def test_magic_in_marketplace_directory_is_not_promoted_as_actor():
    result = assess_intelligence_lead(_lead(
        "RANSOMWARE_GROUP",
        "Magic",
        "Gift cards | marketplace products | cannabis | Magic smoke | drugs | carding tools",
    ))
    assert result["usable"] is False


def test_real_play_ransomware_claim_is_usable_but_single_source():
    result = assess_intelligence_lead(_lead(
        "RANSOMWARE_GROUP",
        "Play",
        "The Play ransomware group claimed an attack against Example Corp and listed the victim on its leak site.",
    ))
    assert result["usable"] is True
    assert result["status"] == "single_source"


def test_ranion_raas_context_is_usable_malware_lead():
    result = assess_intelligence_lead(_lead(
        "MALWARE_FAMILY",
        "Ranion",
        "Ranion (RaaS) offers FUD ransomware and a command and control service on the darknet.",
    ))
    assert result["usable"] is True


def test_invalid_ip_is_rejected_even_with_high_extraction_confidence():
    result = assess_intelligence_lead(_lead(
        "IP_ADDRESS", "999.999.999.999", "C2 server observed at 999.999.999.999"
    ))
    assert result["usable"] is False


def test_valid_cve_is_format_validated():
    result = assess_intelligence_lead(_lead(
        "CVE_NUMBER", "CVE-2024-12345", "The actor reportedly exploits CVE-2024-12345."
    ))
    assert result["usable"] is True
    assert result["status"] == "format_validated"


def test_valid_onion_directory_link_is_not_automatically_threat_infrastructure():
    result = assess_intelligence_lead(_lead(
        "ONION_URL",
        "http://abcdefghijklmnop.onion",
        "Add Your Link | marketplace | http://abcdefghijklmnop.onion | gift cards | products",
    ))
    assert result["usable"] is False


def test_domain_with_explicit_c2_role_is_usable():
    result = assess_intelligence_lead(_lead(
        "DOMAIN",
        "control.example",
        "The malware contacted control.example as its command and control infrastructure.",
    ))
    assert result["usable"] is True


def test_source_counts_and_graph_edges_never_establish_confirmation():
    result = assess_intelligence_lead(_lead("RANSOMWARE_GROUP", "Play",
        "The Play ransomware group claimed a breach.", source_count=100, typed_degree=90))
    assert result["status"] == "single_source"
    assert result["score_kind"] == "heuristic"
    assert result["rule_version"] == "2.0"
    innocent = assess_intelligence_lead(_lead("DOMAIN", "help.example",
        "Visit help.example for opening hours.", source_count=100, typed_degree=90))
    assert innocent["usable"] is False


def test_missing_name_and_mislabeled_domain_are_withheld():
    assert not assess_intelligence_lead(_lead("THREAT_ACTOR", "MissingActor", "A different ransomware group claimed an attack."))["usable"]
    assert not assess_intelligence_lead(_lead("IP_ADDRESS", "control.example", "Malware C2 is control.example."))["usable"]
    assert not assess_intelligence_lead(_lead("MALWARE", "TestRat", "TestRat malware", confidence=float("nan")))["usable"]
