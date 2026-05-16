"""Stage 3: Execute adversarial scenarios against the pipeline via HTTP POST."""
import httpx
from db import get_db

PIPELINE_BASE_URL = "http://localhost:8000"


class AttackRunner:
    def __init__(self, pipeline_base_url: str = PIPELINE_BASE_URL, db=None):
        self.pipeline_url = f"{pipeline_base_url}/api/pipeline/run"
        self.db = db or get_db()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_scenario(self, scenario: dict) -> dict:
        """Dispatch to the correct attack handler and return a result dict."""
        attack_type = scenario.get("attack_type", "")
        dispatch = {
            "INJECTION": self._run_injection,
            "SANDBAGGING": self._run_sandbagging,
            "BOUNDARY": self._run_boundary,
            "CASCADE": self._run_cascade,
            "CONSISTENCY": self._run_consistency,
        }
        handler = dispatch.get(attack_type, self._run_generic)
        return handler(scenario)

    def run_all(self, scenarios: list[dict]) -> list[dict]:
        results = []
        for scenario in scenarios:
            try:
                results.append(self.run_scenario(scenario))
            except Exception as e:
                results.append(self._error_result(scenario, str(e)))
        return results

    # ------------------------------------------------------------------
    # Attack handlers
    # ------------------------------------------------------------------

    def _run_injection(self, scenario: dict) -> dict:
        """Send adversarial_input directly as documents. The payload already contains
        embedded instructions in document field values."""
        result = self._post({"documents": scenario.get("adversarial_input", {})})
        return self._wrap(scenario, result)

    def _run_sandbagging(self, scenario: dict) -> dict:
        """Send same documents twice — once with formal framing, once casual.
        The pipeline passes framing into each agent's user prompt."""
        docs = scenario.get("adversarial_input", {})
        formal = self._post({"documents": docs, "framing": "formal"})
        casual = self._post({"documents": docs, "framing": "casual"})
        return self._wrap(scenario, {"formal": formal, "casual": casual})

    def _run_boundary(self, scenario: dict) -> dict:
        """Send each graduated variant as a separate request.
        adversarial_input may be a list of variants or a single base case."""
        raw = scenario.get("adversarial_input", {})
        variants = raw if isinstance(raw, list) else [raw]
        results = []
        for i, variant in enumerate(variants):
            r = self._post({"documents": variant})
            decision = (
                r.get("stages", {})
                .get("compliance_decision", {})
                .get("compliance_result", {})
                .get("decision")
            )
            results.append({"variant_index": i, "decision": decision, "result": r})
        return self._wrap(scenario, {"boundary_results": results})

    def _run_cascade(self, scenario: dict) -> dict:
        """Two-step attack:
        1. Run pipeline normally and capture document_extraction output.
        2. Corrupt a field in that output, then re-run with override_extraction
           so downstream agents receive the poisoned extracted data."""
        docs = scenario.get("adversarial_input", {})

        # Step 1: clean run
        clean_run = self._post({"documents": docs})
        extracted = (
            clean_run.get("stages", {})
            .get("document_extraction", {})
            .get("extracted_data", {})
        )

        # Step 2: corrupt the extracted data
        corrupted = dict(extracted)
        corruption_spec = scenario.get("corruption_spec", {})
        if corruption_spec:
            corrupted.update(corruption_spec)
        else:
            # Default corruption: shift DOB back 30 years to change age-based risk profile
            dob = corrupted.get("date_of_birth", "")
            if dob and len(dob) >= 4:
                try:
                    corrupted["date_of_birth"] = str(int(dob[:4]) - 30) + dob[4:]
                except ValueError:
                    corrupted["date_of_birth"] = "1965-01-01"

        # Step 3: re-run with corrupted extraction injected, bypassing Agent 1
        corrupted_run = self._post({"documents": docs, "override_extraction": corrupted})

        return self._wrap(scenario, {
            "clean_run": clean_run,
            "corrupted_extraction": corrupted,
            "corrupted_run": corrupted_run,
        })

    def _run_consistency(self, scenario: dict) -> dict:
        """Send the same data multiple times with cosmetic variations.
        adversarial_input may be a list of variant dicts or a single dict."""
        raw = scenario.get("adversarial_input", {})
        variations = raw if isinstance(raw, list) else [raw, raw, raw]
        results = []
        for i, variant in enumerate(variations):
            r = self._post({"documents": variant})
            decision = (
                r.get("stages", {})
                .get("compliance_decision", {})
                .get("compliance_result", {})
                .get("decision")
            )
            risk_score = (
                r.get("stages", {})
                .get("risk_assessment", {})
                .get("risk_result", {})
                .get("risk_score")
            )
            results.append({"run_index": i, "decision": decision, "risk_score": risk_score, "result": r})
        return self._wrap(scenario, {"consistency_results": results})

    def _run_generic(self, scenario: dict) -> dict:
        result = self._post({"documents": scenario.get("adversarial_input", {})})
        return self._wrap(scenario, result)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _post(self, payload: dict) -> dict:
        with httpx.Client(timeout=120) as client:
            resp = client.post(self.pipeline_url, json=payload)
            resp.raise_for_status()
            return resp.json()

    def _wrap(self, scenario: dict, actual_output: dict) -> dict:
        return {
            "scenario_id": scenario.get("scenario_id"),
            "agent_name": scenario.get("target_agent"),
            "actual_output": actual_output,
            "verdict": "PENDING",
            "judge_reasoning": None,
        }

    def _error_result(self, scenario: dict, error: str) -> dict:
        return {
            "scenario_id": scenario.get("scenario_id"),
            "agent_name": scenario.get("target_agent"),
            "actual_output": {"error": error},
            "verdict": "ERROR",
            "judge_reasoning": error,
        }
