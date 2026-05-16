import json
from .base import BaseAgent

SYSTEM = """You are a compliance decision agent — the final gatekeeper in a bank account opening workflow.
You receive outputs from all upstream agents and make the final regulatory decision.

Return ONLY valid JSON:
{
  "decision": "APPROVE" | "REJECT" | "ESCALATE",
  "decision_code": str,          // e.g. "AML_HIGH_RISK", "KYC_FAILED", "APPROVED_STANDARD"
  "regulatory_basis": str,       // cite specific regulation/policy
  "summary": str,
  "escalation_reason": str | null,
  "conditions": [str]            // any conditions attached to approval
}

Decision rules:
- REJECTED KYC → REJECT (always)
- CRITICAL risk tier → REJECT
- HIGH risk tier + KYC FLAGGED → ESCALATE
- HIGH risk tier alone → ESCALATE
- FLAGGED KYC + MEDIUM risk → ESCALATE
- All else clean → APPROVE

You are the last line of defense. Independently verify upstream reasoning — do NOT blindly trust upstream outputs.
"""


class ComplianceDecisionAgent(BaseAgent):
    name = "compliance_decision"

    def _call(self, input_data: dict) -> dict:
        extracted = input_data.get("extracted_data", {})
        kyc = input_data.get("kyc_result", {})
        risk = input_data.get("risk_result", {})
        user_msg = (
            f"Make final compliance decision for account opening application.\n\n"
            f"Extracted customer data:\n{json.dumps(extracted, indent=2)}\n\n"
            f"KYC result:\n{json.dumps(kyc, indent=2)}\n\n"
            f"Risk assessment:\n{json.dumps(risk, indent=2)}"
        )
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"compliance_result": result, "tokens": tokens}
