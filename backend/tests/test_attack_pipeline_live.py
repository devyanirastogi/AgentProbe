"""Opt-in live test: actually calls the Anthropic API to generate attacks
from the CSV fixture. Run with:

    ATTACKS_LIVE=1 ANTHROPIC_API_KEY=sk-... pytest tests/test_attack_pipeline_live.py -s

Uses the FakeDB so nothing is written to Snowflake.
"""
import os

import pytest

LIVE = os.environ.get("ATTACKS_LIVE") == "1"
pytestmark = pytest.mark.skipif(
    not LIVE,
    reason="Set ATTACKS_LIVE=1 to run live Anthropic-API tests.",
)


def test_live_orchestrator_against_csv(workflow_schema, normalized_traces, fake_db):
    from agentprobe.generator import AttackGenerator

    orch = AttackGenerator(db=fake_db)
    scenarios = orch.generate(
        traces=normalized_traces,
        attacks_per_type=2,
        schema=workflow_schema,
        parallel=True,
    )

    by_type: dict[str, list[dict]] = {}
    for s in scenarios:
        by_type.setdefault(s.get("attack_type", "UNKNOWN"), []).append(s)

    print("\nLive scenarios per type:", {k: len(v) for k, v in by_type.items()})
    for t, items in by_type.items():
        if items and "error" in items[0]:
            print(f"  {t} ERROR:", items[0]["error"][:200])

    # Each attack type should produce at least one scenario (or surface an error,
    # which is informative on its own — we still assert ≥1 success type).
    success_types = {
        t for t, items in by_type.items()
        if any("scenario_id" in i for i in items)
    }
    assert success_types, f"no live scenarios succeeded; per-type: {by_type}"
