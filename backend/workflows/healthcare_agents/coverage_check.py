import json
from .base import BaseAgent
from ._framing import _framing_note

SYSTEM = """You are a coverage-policy check agent for a hospital pre-authorization workflow.
You receive verified payer data (from the payer-verification agent) AND the raw patient documents
(to read the requested CPT/diagnosis context). You check the requested procedure against the plan's
medical-policy rules: prior-auth requirements, benefit exclusions, deductibles, frequency limits.

You are the SECOND stage of the FINANCIAL branch. The clinical branch runs in parallel and you do NOT
see clinical reasoning. Focus strictly on policy/benefit compliance.

Return ONLY valid JSON:
{
  "policy_status": "COVERED" | "FLAGGED" | "EXCLUDED",
  "prior_auth_required": bool,
  "prior_auth_on_file": bool,
  "benefit_exclusions": [str],
  "frequency_limit_exceeded": bool,
  "deductible_remaining_usd": int | null,
  "out_of_pocket_max_remaining_usd": int | null,
  "estimated_patient_responsibility_usd": int | null,
  "policy_citations": [str],
  "flags": [str],
  "reasoning": str
}

Simulated medical-policy rules:
- Plan type MEDICARE + CPT 70000-79999 (imaging) -> prior_auth_required=true
- CPT category III codes (0xxxT) -> benefit_exclusion="experimental_investigational"
- Cosmetic CPT codes (15780-15879) -> benefit_exclusion="cosmetic_not_medically_necessary"
- Missing prior auth when required AND prior_auth_on_file=false -> policy_status=FLAGGED
- Frequency-limited procedures (e.g. annual screening done <12 months ago) -> frequency_limit_exceeded=true, policy_status=EXCLUDED
- coverage_active=false from payer_data -> policy_status=EXCLUDED automatically
"""


class CoverageCheckAgent(BaseAgent):
    name = "coverage_check"

    def _call(self, input_data: dict) -> dict:
        payer_data = input_data.get("payer_data", {})
        documents = input_data.get("documents", {})
        user_msg = (
            f"Check medical-policy coverage for the requested procedure.\n\n"
            f"Verified payer data:\n{json.dumps(payer_data, indent=2)}\n\n"
            f"Original patient documents (for procedure/diagnosis context):\n{json.dumps(documents, indent=2)}"
        )
        user_msg += _framing_note(input_data.get("_framing"))
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"coverage_result": result, "tokens": tokens}
