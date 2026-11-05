"""Small, disclosed synthetic challenge set; no AI, Tor or human results invented."""
from copy import deepcopy
from utils.lead_quality import assess_intelligence_lead, LEAD_QUALITY_VERSION
from research_evaluation.metrics import compare_benchmark

# (name, type, text, expected entity, parser confidence). These are developer
# examples for a regression demonstration, not an independently annotated study.
CASES = [
    ("Android", "RANSOMWARE_GROUP", "Store categories: Android source code, products, gift card, marketplace, drugs, carding.", False, .97),
    ("play", "RANSOMWARE_GROUP", "Buy a Google play market gift card from our marketplace products catalogue.", False, .97),
    ("Magic", "RANSOMWARE_GROUP", "Cannabis directory: Magic smoke, drugs, products, gift card, marketplace, carding.", False, .97),
    ("Play", "RANSOMWARE_GROUP", "The Play ransomware group claimed an attack against the fictional Example Bank on 2026-01-12.", True, .97),
    ("Ranion", "MALWARE_FAMILY", "A fictional training report describes Ranion (RaaS) as ransomware; no real victim is alleged.", True, .98),
    ("Lantern Crew", "THREAT_ACTOR", "The fictional threat actor Lantern Crew claimed it breached Example Water, Zambia.", True, .91),
    ("CVE-2024-12345", "CVE_NUMBER", "Training text: exploitation of CVE-2024-12345 was claimed. Identifier syntax only; existence unverified.", True, .96),
    ("CVE-2024-XXXXX", "CVE_NUMBER", "A comment vaguely mentions CVE-2024-XXXXX without a valid identifier.", False, .96),
    ("999.999.999.999", "IP_ADDRESS", "An alleged C2 address was 999.999.999.999.", False, .99),
    ("192.0.2.18", "IP_ADDRESS", "Training malware contacted C2 server 192.0.2.18; this is a documentation address.", True, .95),
    ("support.example", "DOMAIN", "Visit support.example for customer support and opening hours.", False, .99),
    ("control.example", "DOMAIN", "Fictional malware contacted control.example as its command and control server.", True, .94),
    ("ShadowFox", "MALWARE_FAMILY", "ShadowFox is the title of a fantasy novel sold in this book catalogue.", False, .96),
    ("ShadowFox", "MALWARE_FAMILY", "The fictional ShadowFox trojan downloaded a payload in a laboratory simulation.", True, .93),
    ("Royal", "RANSOMWARE_GROUP", "Royal hotel offers meeting rooms and family accommodation.", False, .97),
    ("Royal", "RANSOMWARE_GROUP", "The Royal ransomware group listed a fictional victim on its leak site in this training example.", True, .95),
    ("NightHarbor", "THREAT_ACTOR", "NightHarbor ransomware group claimed an intrusion; its identification remains uncertain.", True, .62),
    ("update.example", "IP_ADDRESS", "The payload downloaded malware from update.example.", False, .98),
    ("Cloud", "RANSOMWARE_GROUP", "Cloud hosting prices, storage packages and managed server support.", False, .99),
    ("Lantern Crew", "THREAT_ACTOR", "The fictional threat actor Lantern Crew claimed it breached Example Water, Zambia.", True, .91),
]


def demo_dataset() -> dict:
    documents = []
    for index, (value, kind, text, positive, confidence) in enumerate(CASES, 1):
        start = text.index(value)
        span = {"type": kind, "start": start, "end": start + len(value), "text": value}
        lead = {"entity_type": kind, "value": value, "confidence": confidence, "context_snippet": text}
        documents.append({"id": f"DEMO-{index:03}", "text": text, "source_class": "synthetic",
                          "gold": {"entities": [span] if positive else []},
                          "baseline_prediction": {"entities": [span]},
                          "prediction": {"entities": [span] if assess_intelligence_lead(lead)["usable"] else []},
                          "candidate": lead})
    return {"documents": deepcopy(documents), "demo": True,
            "baseline_label": "Unfiltered candidate list", "improved_label": "Context and format gate",
            "rule_version": LEAD_QUALITY_VERSION,
            "description": "20 developer-authored synthetic examples. Includes an intentionally missed low-confidence true lead and an exact copied report. This is a regression demonstration, not the 50-document human-annotated study or a comparison with upstream TiclaSec."}


def run_demo() -> dict:
    dataset = demo_dataset()
    return {"dataset": dataset, "report": {**compare_benchmark(dataset["documents"]),
             "demo": True, "overall_status": "demonstration", "description": dataset["description"]}}
