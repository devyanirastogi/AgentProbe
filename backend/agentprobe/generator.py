"""Stage 2: Orchestrator that fans out to per-attack-type subgenerators."""
from concurrent.futures import ThreadPoolExecutor, as_completed

from db import SnowflakeClient

from .analyzer import WorkflowAnalyzer, WorkflowSchema
from .generators import ALL_GENERATORS

ATTACK_TYPES = ["INJECTION", "BOUNDARY", "SANDBAGGING", "CASCADE", "CONSISTENCY"]


class AttackGenerator:
    """Domain-agnostic generator: derives a structural workflow schema from traces, then fans out to attack specialists."""

    def __init__(self, db: SnowflakeClient | None = None):
        self.db = db or SnowflakeClient()
        self.analyzer = WorkflowAnalyzer(db=self.db)

    def generate(
        self,
        traces: list[dict],
        attacks_per_type: int = 3,
        workflow_description: str = "multi-agent workflow",
        schema: WorkflowSchema | None = None,
        parallel: bool = True,
    ) -> list[dict]:
        """Generate adversarial scenarios from normalized traces and persist to Snowflake."""
        if schema is None:
            schema = self.analyzer.analyze_traces(traces, workflow_name=workflow_description)

        scenarios: list[dict] = []
        generators = [G(db=self.db) for G in ALL_GENERATORS]

        if parallel:
            with ThreadPoolExecutor(max_workers=len(generators)) as ex:
                futures = {
                    ex.submit(g.generate, schema, traces, attacks_per_type): g.attack_type
                    for g in generators
                }
                for fut in as_completed(futures):
                    try:
                        scenarios.extend(fut.result())
                    except Exception as e:
                        scenarios.append(
                            {
                                "attack_type": futures[fut],
                                "error": str(e),
                                "adversarial_input": {},
                            }
                        )
        else:
            for g in generators:
                try:
                    scenarios.extend(g.generate(schema, traces, attacks_per_type))
                except Exception as e:
                    scenarios.append(
                        {"attack_type": g.attack_type, "error": str(e), "adversarial_input": {}}
                    )

        return scenarios
