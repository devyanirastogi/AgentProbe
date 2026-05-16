import json
import os
import uuid
from contextlib import contextmanager
from typing import Any

import snowflake.connector
from dotenv import load_dotenv

load_dotenv()


class SnowflakeClient:
    def __init__(self):
        self._conn_params = {
            "account": os.environ["SNOWFLAKE_ACCOUNT"],
            "user": os.environ["SNOWFLAKE_USER"],
            "password": os.environ["SNOWFLAKE_PASSWORD"],
            "database": os.environ["SNOWFLAKE_DATABASE"],
            "schema": os.environ["SNOWFLAKE_SCHEMA"],
            "warehouse": os.environ["SNOWFLAKE_WAREHOUSE"],
            "role": os.getenv("SNOWFLAKE_ROLE"),
        }

    @contextmanager
    def _cursor(self):
        conn = snowflake.connector.connect(**self._conn_params)
        try:
            yield conn.cursor()
            conn.commit()
        finally:
            conn.close()

    def insert_trace(self, trace: dict) -> str:
        trace_id = trace.get("trace_id") or str(uuid.uuid4())
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO traces (trace_id, workflow_id, agent_name, input, output, tokens, latency_ms)
                SELECT %s, %s, %s, PARSE_JSON(%s), PARSE_JSON(%s), %s, %s
                """,
                (
                    trace_id,
                    trace["workflow_id"],
                    trace["agent_name"],
                    json.dumps(trace["input"]),
                    json.dumps(trace["output"]),
                    trace.get("tokens"),
                    trace.get("latency_ms"),
                ),
            )
        return trace_id

    def insert_attack_scenario(self, scenario: dict) -> str:
        scenario_id = str(uuid.uuid4())
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO attack_scenarios
                  (scenario_id, attack_type, target_agent, adversarial_input, expected_behavior, source_trace_id)
                SELECT %s, %s, %s, PARSE_JSON(%s), %s, %s
                """,
                (
                    scenario_id,
                    scenario["attack_type"],
                    scenario["target_agent"],
                    json.dumps(scenario["adversarial_input"]),
                    scenario.get("expected_behavior"),
                    scenario.get("source_trace_id"),
                ),
            )
        return scenario_id

    def insert_attack_result(self, result: dict) -> str:
        result_id = str(uuid.uuid4())
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO attack_results
                  (result_id, scenario_id, agent_name, actual_output, verdict, judge_reasoning)
                SELECT %s, %s, %s, PARSE_JSON(%s), %s, %s
                """,
                (
                    result_id,
                    result["scenario_id"],
                    result["agent_name"],
                    json.dumps(result["actual_output"]),
                    result["verdict"],
                    result.get("judge_reasoning"),
                ),
            )
        return result_id

    def insert_reliability_score(self, score: dict) -> str:
        score_id = str(uuid.uuid4())
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO reliability_scores
                  (score_id, agent_name, workflow_id,
                   injection_resistance, boundary_accuracy, sandbagging_score,
                   cascade_resilience, consistency_score, overall_score)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    score_id,
                    score["agent_name"],
                    score["workflow_id"],
                    score.get("injection_resistance"),
                    score.get("boundary_accuracy"),
                    score.get("sandbagging_score"),
                    score.get("cascade_resilience"),
                    score.get("consistency_score"),
                    score.get("overall_score"),
                ),
            )
        return score_id

    def insert_sandbagging_pair(self, pair: dict) -> str:
        pair_id = str(uuid.uuid4())
        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO sandbagging_pairs
                  (pair_id, scenario_id, agent_name,
                   formal_input, casual_input, formal_output, casual_output,
                   decision_delta, reasoning_delta, sandbagging_pct)
                SELECT %s,%s,%s,
                       PARSE_JSON(%s), PARSE_JSON(%s), PARSE_JSON(%s), PARSE_JSON(%s),
                       %s,%s,%s
                """,
                (
                    pair_id,
                    pair.get("scenario_id"),
                    pair["agent_name"],
                    json.dumps(pair["formal_input"]),
                    json.dumps(pair["casual_input"]),
                    json.dumps(pair.get("formal_output")),
                    json.dumps(pair.get("casual_output")),
                    pair.get("decision_delta"),
                    pair.get("reasoning_delta"),
                    pair.get("sandbagging_pct"),
                ),
            )
        return pair_id

    def get_traces(self, workflow_id: str | None = None, limit: int = 100) -> list[dict]:
        with self._cursor() as cur:
            if workflow_id:
                cur.execute(
                    "SELECT * FROM traces WHERE workflow_id = %s ORDER BY timestamp DESC LIMIT %s",
                    (workflow_id, limit),
                )
            else:
                cur.execute("SELECT * FROM traces ORDER BY timestamp DESC LIMIT %s", (limit,))
            cols = [d[0].lower() for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def get_reliability_scores(self, workflow_id: str | None = None) -> list[dict]:
        with self._cursor() as cur:
            if workflow_id:
                cur.execute(
                    "SELECT * FROM reliability_scores WHERE workflow_id = %s ORDER BY computed_at DESC",
                    (workflow_id,),
                )
            else:
                cur.execute("SELECT * FROM reliability_scores ORDER BY computed_at DESC LIMIT 200")
            cols = [d[0].lower() for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def get_attack_results(self, workflow_id: str | None = None) -> list[dict]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT ar.*, s.attack_type, s.target_agent
                FROM attack_results ar
                JOIN attack_scenarios s ON ar.scenario_id = s.scenario_id
                ORDER BY ar.executed_at DESC
                LIMIT 500
                """
            )
            cols = [d[0].lower() for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
