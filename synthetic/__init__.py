"""Synthetic investigation data for demos, training and testing.

See :mod:`synthetic.engine` for how a run uses it, and ``data/synthetic/README.md`` for adding your own packs.
"""

from .engine import all_scenarios, get_scenario, list_scenarios, synthetic_scrape, synthetic_search
from .scenarios import Scenario, SyntheticPage

__all__ = [
    "Scenario",
    "SyntheticPage",
    "all_scenarios",
    "get_scenario",
    "list_scenarios",
    "synthetic_scrape",
    "synthetic_search",
]
