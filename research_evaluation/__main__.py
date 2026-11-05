"""Reproduce a demo or supplied comparison: python -m research_evaluation."""
import argparse
import json
from pathlib import Path
from research_evaluation.lead_demo import run_demo
from research_evaluation.metrics import compare_benchmark

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("dataset", nargs="?", help="JSON containing documents with baseline and improved predictions")
args = parser.parse_args()
if args.dataset:
    data = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    result = compare_benchmark(data["documents"], data.get("thresholds"))
    if data.get("demo"):
        result.update(demo=True, overall_status="demonstration", description=data.get("description", "Synthetic demonstration"))
else:
    result = run_demo()
print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))
