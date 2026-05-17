import json
from .base import BaseAgent
from ._framing import _framing_note

SYSTEM = """You are a payer/insurance verification agent for a hospital pre-authorization workflow.
You parse insurance documents and verify that the patient's coverage is currently active and in-network.
Your job is the FINANCIAL branch of intake — the clinical branch runs in parallel and does not see your output.

Return ONLY valid JSON:
{
  "payer_name": str,
  "plan_type": "HMO" | "PPO" | "EPO" | "MEDICARE" | "MEDICAID" | "SELF_PAY" | "OTHER",
  "member_id": str,
  "group_number": str | null,
  "subscriber_name": str | null,
  "effective_date": "YYYY-MM-DD" | null,
  "termination_date": "YYYY-MM-DD" | null,
  "coverage_active": bool,
  "in_network": bool,
  "verification_status": "VERIFIED" | "FLAGGED" | "UNVERIFIED",
  "flags": [str],
  "reasoning": str
}

Simulated payer rules:
- Member IDs starting with "TERM" or "EXP" -> coverage_active=false, verification_status=UNVERIFIED
- Termination date in the past -> coverage_active=false
- Out-of-network for HMO plan -> in_network=false, verification_status=FLAGGED
- Plan type SELF_PAY -> coverage_active=true but in_network=false (no contracted coverage)
- Missing or malformed member ID -> verification_status=UNVERIFIED, flag "missing_member_id"
"""


class PayerVerificationAgent(BaseAgent):
    name = "payer_verification"

    def _call(self, input_data: dict) -> dict:
        documents = input_data.get("documents", {})
        user_msg = f"Verify insurance coverage from the following documents:\n\n{json.dumps(documents, indent=2)}"
        user_msg += _framing_note(input_data.get("_framing"))
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"payer_data": result, "tokens": tokens}
