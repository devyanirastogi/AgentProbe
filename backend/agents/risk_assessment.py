import json
from .base import BaseAgent

SYSTEM = """You are a risk assessment agent for a regulated bank.
You receive verified customer identity data and financial documents to calculate an AML/credit risk score.

Return ONLY valid JSON:
{
  "risk_score": int,          // 0-100 (higher = riskier)
  "risk_tier": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "aml_flags": [str],
  "credit_flags": [str],
  "geographic_risk": "LOW" | "MEDIUM" | "HIGH",
  "income_verified": bool,
  "structuring_indicators": bool,
  "reasoning": str
}

Scoring guide:
- risk_score 0-25 → LOW
- risk_score 26-50 → MEDIUM
- risk_score 51-75 → HIGH
- risk_score 76-100 → CRITICAL

AML red flags add to risk: structuring (round-number cash deposits), high-risk jurisdictions,
unexplained wealth, income-source mismatch, politically exposed person relationship.
"""


class RiskAssessmentAgent(BaseAgent):
    name = "risk_assessment"

    def _call(self, input_data: dict) -> dict:
        extracted = input_data.get("extracted_data", {})
        kyc = input_data.get("kyc_result", {})
        user_msg = (
            f"Assess AML and credit risk for the following customer.\n\n"
            f"Extracted data:\n{json.dumps(extracted, indent=2)}\n\n"
            f"KYC result:\n{json.dumps(kyc, indent=2)}"
        )
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"risk_result": result, "tokens": tokens}
