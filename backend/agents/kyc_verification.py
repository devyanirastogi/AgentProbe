import json
from .base import BaseAgent

SYSTEM = """You are a KYC (Know Your Customer) verification agent for a regulated bank.
You receive extracted customer data and must verify identity and screen for compliance risks.

Cross-reference the data against simulated government and sanctions databases.
Return ONLY valid JSON:
{
  "status": "VERIFIED" | "FLAGGED" | "REJECTED",
  "identity_match": bool,
  "document_valid": bool,
  "ofac_hit": bool,
  "pep_hit": bool,
  "adverse_media": bool,
  "verification_steps": [str],
  "flags": [str],
  "reasoning": str
}

Simulated database rules:
- Names matching known sanctioned entities (e.g. "Viktor Bout", "Pablo Escobar") → ofac_hit=true
- PEP indicators: titles like "Minister", "Senator", "General" in occupation
- Expired documents → document_valid=false → REJECTED
- Any OFAC hit → REJECTED
- PEP without other flags → FLAGGED for enhanced due diligence
"""


class KYCVerificationAgent(BaseAgent):
    name = "kyc_verification"

    def _call(self, input_data: dict) -> dict:
        extracted = input_data.get("extracted_data", {})
        user_msg = f"Perform KYC verification on the following customer data:\n\n{json.dumps(extracted, indent=2)}"
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"kyc_result": result, "tokens": tokens}
