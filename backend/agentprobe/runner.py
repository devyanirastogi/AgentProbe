"""Stage 3: Execute adversarial scenarios against the sandboxed agent pipeline."""
import asyncio
import httpx
from db import SnowflakeClient


class AttackRunner:
    def __init__(self, pipeline_base_url: str | None = None, db: SnowflakeClient | None = None):
        # When None, uses direct in-process calls instead of HTTP
        self.pipeline_base_url = pipeline_base_url
        self.db = db or SnowflakeClient()

    def run_scenario(self, scenario: dict, pipeline=None) -> dict:
        """Run a single adversarial scenario. Uses in-process pipeline when no URL given."""
        attack_type = scenario.get("attack_type")
        adversarial_input = scenario.get("adversarial_input", {})

        if self.pipeline_base_url:
            result = self._http_run(adversarial_input)
        elif pipeline:
            result = self._inline_run(adversarial_input, pipeline, scenario)
        else:
            raise ValueError("Provide either pipeline_base_url or a pipeline instance")

        attack_result = {
            "scenario_id": scenario.get("scenario_id"),
            "agent_name": scenario.get("target_agent"),
            "actual_output": result,
            "verdict": "PENDING",  # filled in by JudgeEvaluator
            "judge_reasoning": None,
        }
        return attack_result

    def run_all(self, scenarios: list[dict], pipeline=None) -> list[dict]:
        results = []
        for scenario in scenarios:
            try:
                r = self.run_scenario(scenario, pipeline)
                results.append(r)
            except Exception as e:
                results.append(
                    {
                        "scenario_id": scenario.get("scenario_id"),
                        "agent_name": scenario.get("target_agent"),
                        "actual_output": {"error": str(e)},
                        "verdict": "ERROR",
                        "judge_reasoning": str(e),
                    }
                )
        return results

    def _inline_run(self, adversarial_input: dict, pipeline, scenario: dict) -> dict:
        attack_type = scenario.get("attack_type")

        if attack_type == "SANDBAGGING":
            framing = scenario.get("framing", "formal")
            wrapped = {"documents": adversarial_input, "framing": framing}
            return pipeline.run(wrapped)

        if attack_type == "CASCADE":
            # Feed corrupted upstream output directly into a specific stage
            target = scenario.get("target_agent", "kyc_verification")
            if hasattr(pipeline, f"_{target.replace('_', '_')}"):
                pass
            # Run full pipeline with corrupted doc extraction output injected
            return pipeline.run({"documents": adversarial_input, "injected_corruption": True})

        return pipeline.run({"documents": adversarial_input})

    def _http_run(self, adversarial_input: dict) -> dict:
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{self.pipeline_base_url}/run",
                json={"documents": adversarial_input},
            )
            resp.raise_for_status()
            return resp.json()
