"""In-memory drop-in replacement for SnowflakeClient. Used when Snowflake env vars are absent."""
import uuid
from collections import defaultdict


class MockDBClient:
    def __init__(self):
        self._traces: list[dict] = []
        self._attack_scenarios: list[dict] = []
        self._attack_results: list[dict] = []
        self._reliability_scores: list[dict] = []
        self._sandbagging_pairs: list[dict] = []

    def insert_trace(self, trace: dict) -> str:
        trace_id = trace.get("trace_id") or str(uuid.uuid4())
        self._traces.append({**trace, "trace_id": trace_id})
        return trace_id

    def insert_attack_scenario(self, scenario: dict) -> str:
        scenario_id = str(uuid.uuid4())
        self._attack_scenarios.append({**scenario, "scenario_id": scenario_id})
        return scenario_id

    def insert_attack_result(self, result: dict) -> str:
        result_id = str(uuid.uuid4())
        self._attack_results.append({**result, "result_id": result_id})
        return result_id

    def insert_reliability_score(self, score: dict) -> str:
        score_id = str(uuid.uuid4())
        self._reliability_scores.append({**score, "score_id": score_id})
        return score_id

    def insert_sandbagging_pair(self, pair: dict) -> str:
        pair_id = str(uuid.uuid4())
        self._sandbagging_pairs.append({**pair, "pair_id": pair_id})
        return pair_id

    def get_traces(self, workflow_id: str | None = None, limit: int = 100) -> list[dict]:
        rows = self._traces
        if workflow_id:
            rows = [r for r in rows if r.get("workflow_id") == workflow_id]
        return rows[-limit:]

    def get_reliability_scores(self, workflow_id: str | None = None) -> list[dict]:
        rows = self._reliability_scores
        if workflow_id:
            rows = [r for r in rows if r.get("workflow_id") == workflow_id]
        return rows

    def get_attack_results(self, workflow_id: str | None = None) -> list[dict]:
        return self._attack_results
