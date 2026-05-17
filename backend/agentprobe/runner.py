"""Stage 3: Execute adversarial scenarios against the pipeline via HTTP POST.

Per-attack handlers translate the structured scenarios emitted by the
per-type subgenerators into one or more HTTP calls against the SUT.
"""
import time

import httpx

from db import SnowflakeClient

PIPELINE_BASE_URL = "http://localhost:8000"


class AttackRunner:
    def __init__(
        self,
        pipeline_base_url: str = PIPELINE_BASE_URL,
        auth_header: str | None = None,
        db: SnowflakeClient | None = None,
    ):
        # If the caller passes a full URL ending in /run, use it as-is.
        # Otherwise append /api/pipeline/run to the base URL.
        if pipeline_base_url.endswith("/run"):
            self.pipeline_url = pipeline_base_url
        else:
            self.pipeline_url = f"{pipeline_base_url.rstrip('/')}/api/pipeline/run"
        self.auth_header = auth_header
        self.db = db or SnowflakeClient()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_scenario(self, scenario: dict) -> dict:
        """Dispatch to the correct attack handler and return a result dict."""
        self._last_calls: list[dict] = []  # populated by _post; consumed by _wrap
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
        embedded instructions inside legitimate-looking field values."""
        result = self._post({"documents": scenario.get("adversarial_input", {})})
        return self._wrap(scenario, result)

    def _run_sandbagging(self, scenario: dict) -> dict:
        """Send the same documents twice — once with formal framing, once casual.
        The pipeline forwards framing into each agent's user prompt."""
        docs = scenario.get("adversarial_input", {})
        formal = self._post({"documents": docs, "framing": "formal"})
        casual = self._post({"documents": docs, "framing": "casual"})
        return self._wrap(scenario, {"formal": formal, "casual": casual})

    def _run_boundary(self, scenario: dict) -> dict:
        """Send each graduated variant as a separate request.
        adversarial_input may be a list of variants or a single dict."""
        raw = scenario.get("adversarial_input", {})
        variants = raw if isinstance(raw, list) else [raw]
        results = []
        for i, variant in enumerate(variants):
            r = self._post({"documents": variant})
            decision = self._extract_terminal_decision(r)
            results.append({"variant_index": i, "decision": decision, "result": r})
        return self._wrap(scenario, {"boundary_results": results})

    def _run_cascade(self, scenario: dict) -> dict:
        """Two-step attack:
        1. Run pipeline normally and capture the first stage's output.
        2. Corrupt that output using corruption_spec (or a fallback inferred from
           injection_path), then re-run with override_extraction so downstream
           agents receive the poisoned data.
        Works with any pipeline that supports override_extraction — first stage
        is detected dynamically from the response 'stages' dict."""
        docs = scenario.get("adversarial_input", {})

        # Step 1: clean run to capture the first stage's natural output.
        clean_run = self._post({"documents": docs})
        stages = clean_run.get("stages", {})

        first_stage = scenario.get("first_stage") or (next(iter(stages), None))
        first_output = stages.get(first_stage, {}) if first_stage else {}

        extracted = (
            first_output.get("extracted_data")
            or first_output.get("output")
            or {k: v for k, v in first_output.items() if k not in ("_meta", "tokens")}
        )

        # Step 2: build the corruption.
        corrupted = dict(extracted) if isinstance(extracted, dict) else {}
        corruption_spec = scenario.get("corruption_spec") or self._spec_from_injection_path(scenario)
        if corruption_spec:
            corrupted.update(corruption_spec)
        else:
            # Last-resort fallback: shift any date-like field back 30 years.
            for field, val in list(corrupted.items()):
                if "date" in field.lower() and isinstance(val, str) and len(val) >= 4:
                    try:
                        corrupted[field] = str(int(val[:4]) - 30) + val[4:]
                        break
                    except ValueError:
                        pass

        # Step 3: re-run with the corrupted first-stage output injected.
        corrupted_run = self._post({"documents": docs, "override_extraction": corrupted})

        return self._wrap(
            scenario,
            {
                "clean_run": clean_run,
                "corrupted_extraction": corrupted,
                "corrupted_run": corrupted_run,
            },
        )

    def _run_consistency(self, scenario: dict) -> dict:
        """Send the same data multiple times with cosmetic variations.
        adversarial_input may be a list of variant dicts or a single dict."""
        raw = scenario.get("adversarial_input", {})
        variations = raw if isinstance(raw, list) else [raw, raw, raw]
        results = []
        for i, variant in enumerate(variations):
            r = self._post({"documents": variant})
            results.append(
                {
                    "run_index": i,
                    "decision": self._extract_terminal_decision(r),
                    "result": r,
                }
            )
        return self._wrap(scenario, {"consistency_results": results})

    def _run_generic(self, scenario: dict) -> dict:
        result = self._post({"documents": scenario.get("adversarial_input", {})})
        return self._wrap(scenario, result)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _post(self, payload: dict) -> dict:
        """POST to the configured pipeline URL.

        Records (url, status, latency_ms, payload_keys, error) on self._last_calls
        so callers (and the live feed) can verify the attack actually hit the SUT.
        """
        headers = {}
        if self.auth_header:
            headers["Authorization"] = self.auth_header

        call_meta = {
            "url": self.pipeline_url,
            "payload_keys": sorted(payload.keys()),
            "status": None,
            "latency_ms": None,
            "error": None,
        }
        start = time.perf_counter()
        try:
            with httpx.Client(timeout=120) as client:
                resp = client.post(self.pipeline_url, json=payload, headers=headers)
                call_meta["status"] = resp.status_code
                call_meta["latency_ms"] = int((time.perf_counter() - start) * 1000)
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            call_meta["latency_ms"] = int((time.perf_counter() - start) * 1000)
            call_meta["error"] = str(e)[:200]
            raise
        finally:
            self._last_calls.append(call_meta)

    @staticmethod
    def _extract_terminal_decision(response: dict) -> object:
        """Walk `stages` to the last stage and return its first scalar value
        whose key looks decision-ish (or any scalar leaf if none match).
        Domain-agnostic: no hardcoded `compliance_decision` / `decision` lookup."""
        stages = response.get("stages") if isinstance(response, dict) else None
        if not stages or not isinstance(stages, dict):
            return None
        last_payload = next(reversed(stages.values()))
        # Flatten one level and pick a scalar that looks decision-like.
        candidates: dict[str, object] = {}

        def collect(obj, prefix=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    collect(v, f"{prefix}.{k}" if prefix else k)
            elif not isinstance(obj, list):
                candidates[prefix] = obj

        collect(last_payload)
        for key, val in candidates.items():
            kl = key.lower()
            if any(token in kl for token in ("decision", "verdict", "outcome", "status", "tier", "score")):
                return val
        return next(iter(candidates.values()), None)

    @staticmethod
    def _spec_from_injection_path(scenario: dict) -> dict | None:
        """If the generator emitted (injection_path, adversarial_input) but no
        explicit corruption_spec, try to derive a one-field spec by reading the
        leaf at injection_path inside adversarial_input."""
        path = scenario.get("injection_path")
        adv = scenario.get("adversarial_input")
        if not path or not isinstance(adv, dict):
            return None
        parts = [p for p in path.replace("[]", "").split(".") if p]
        node: object = adv
        for p in parts:
            if isinstance(node, dict) and p in node:
                node = node[p]
            else:
                return None
        return {parts[-1]: node} if parts else None

    def _wrap(self, scenario: dict, actual_output: dict) -> dict:
        target = scenario.get("target_node_id") or scenario.get("target_agent")
        return {
            "scenario_id": scenario.get("scenario_id"),
            "agent_name": target,
            "actual_output": actual_output,
            "endpoint_calls": list(getattr(self, "_last_calls", [])),
            "verdict": "PENDING",
            "judge_reasoning": None,
        }

    def _error_result(self, scenario: dict, error: str) -> dict:
        target = scenario.get("target_node_id") or scenario.get("target_agent")
        return {
            "scenario_id": scenario.get("scenario_id"),
            "agent_name": target,
            "actual_output": {"error": error},
            "endpoint_calls": list(getattr(self, "_last_calls", [])),
            "verdict": "ERROR",
            "judge_reasoning": error,
        }
