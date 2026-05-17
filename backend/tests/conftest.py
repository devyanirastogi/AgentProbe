"""Shared fixtures for agentprobe tests.

Loads the LangFuse CSV export shipped under tests/fixtures/ into the
normalized trace dict shape that ingester.py emits, so the rest of the
attack pipeline (analyzer, generators, runner, scorer) can run on it
without touching LangFuse or Snowflake.
"""
import csv
import json
import sys
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Ensure `backend/` is importable as the package root.
BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

FIXTURE_CSV = Path(__file__).resolve().parent / "fixtures" / "traces_sample.csv"


def _loadj(s: str):
    if not s:
        return {}
    try:
        return json.loads(s)
    except (ValueError, json.JSONDecodeError):
        return {}


def _parse_ts(s: str):
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


@pytest.fixture(scope="session")
def csv_path() -> Path:
    assert FIXTURE_CSV.exists(), f"fixture missing: {FIXTURE_CSV}"
    return FIXTURE_CSV


@pytest.fixture(scope="session")
def normalized_traces(csv_path: Path) -> list[dict]:
    """CSV → list of trace dicts shaped like ingester.py emits.

    Skips the workflow-root SPAN (type=SPAN, name=traceName) — the analyzer
    cares about per-agent observations only.
    """
    rows: list[dict] = []
    with csv_path.open() as f:
        for row in csv.DictReader(f):
            if row.get("type") != "SPAN":
                continue
            agent_name = row.get("name") or "unknown"
            if agent_name == row.get("traceName"):
                continue  # root span — not an agent
            start = _parse_ts(row.get("startTime", ""))
            end = _parse_ts(row.get("endTime", ""))
            latency_ms = int((end - start).total_seconds() * 1000) if (start and end) else None
            rows.append(
                {
                    "trace_id": f"{row['traceId']}:{row['id']}",
                    "workflow_id": row["traceId"],
                    "agent_name": agent_name,
                    "input": _loadj(row.get("input", "")),
                    "output": _loadj(row.get("output", "")),
                    "tokens": None,
                    "latency_ms": latency_ms,
                    "_start": start,
                }
            )
    # Order rows within a workflow by start time so the analyzer's
    # temporal-edge inference sees a consistent DAG.
    by_wf: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_wf[r["workflow_id"]].append(r)
    ordered: list[dict] = []
    for wf_rows in by_wf.values():
        wf_rows.sort(key=lambda r: r["_start"] or datetime.min)
        ordered.extend(wf_rows)
    for r in ordered:
        r.pop("_start", None)
    return ordered


@pytest.fixture(scope="session")
def workflow_schema(normalized_traces):
    from agentprobe.analyzer import WorkflowAnalyzer

    return WorkflowAnalyzer(db=_FakeDB()).analyze_traces(
        normalized_traces, workflow_name="bank-account-opening"
    )


class _FakeDB:
    """Stand-in for SnowflakeClient. Collects writes; serves no real reads."""

    def __init__(self):
        self.traces: list[dict] = []
        self.scenarios: list[dict] = []
        self.results: list[dict] = []
        self.scores: list[dict] = []
        self.sandbagging_pairs: list[dict] = []

    def insert_trace(self, trace: dict) -> str:
        tid = trace.get("trace_id") or str(uuid.uuid4())
        self.traces.append({**trace, "trace_id": tid})
        return tid

    def insert_attack_scenario(self, scenario: dict) -> str:
        sid = str(uuid.uuid4())
        self.scenarios.append({**scenario, "scenario_id": sid})
        return sid

    def insert_attack_result(self, result: dict) -> str:
        rid = str(uuid.uuid4())
        self.results.append({**result, "result_id": rid})
        return rid

    def insert_reliability_score(self, score: dict) -> str:
        sid = str(uuid.uuid4())
        self.scores.append({**score, "score_id": sid})
        return sid

    def insert_sandbagging_pair(self, pair: dict) -> str:
        pid = str(uuid.uuid4())
        self.sandbagging_pairs.append({**pair, "pair_id": pid})
        return pid

    def get_traces(self, workflow_id=None, limit=100):
        rows = self.traces
        if workflow_id:
            rows = [r for r in rows if r.get("workflow_id") == workflow_id]
        return rows[:limit]


@pytest.fixture
def fake_db():
    return _FakeDB()


def make_anthropic_response(text: str) -> MagicMock:
    """Build a MagicMock matching the shape of anthropic.Messages.create()."""
    resp = MagicMock()
    resp.content = [MagicMock(text=text)]
    resp.usage = MagicMock(input_tokens=100, output_tokens=50, total_tokens=150)
    return resp


@pytest.fixture
def anthropic_response_factory():
    return make_anthropic_response
