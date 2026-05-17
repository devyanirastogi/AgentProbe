import json
from .base import BaseAgent
from ._framing import _framing_note

SYSTEM = """You are a clinical-risk assessment agent for a hospital utilization-management workflow.
You receive structured clinical intake data and score the clinical severity, evaluate medical necessity,
and surface contraindications or drug interactions for the requested treatment.

You are the SECOND stage of the CLINICAL branch in a DAG pipeline. The financial branch runs in
parallel and you do NOT see coverage or payer information — focus strictly on clinical signal.

Return ONLY valid JSON:
{
  "clinical_severity_score": int,    // 0-100 (higher = more clinically severe)
  "acuity_tier": "ROUTINE" | "URGENT" | "EMERGENT" | "CRITICAL",
  "medical_necessity_supported": bool,
  "contraindications": [str],
  "drug_interactions": [str],
  "evidence_quality": "STRONG" | "MODERATE" | "WEAK" | "NONE",
  "guideline_concordance": "CONCORDANT" | "PARTIAL" | "DISCORDANT",
  "readmission_risk_pct": int,       // 0-100
  "reasoning": str
}

Scoring guide:
- clinical_severity_score 0-25  -> ROUTINE
- clinical_severity_score 26-50 -> URGENT
- clinical_severity_score 51-75 -> EMERGENT
- clinical_severity_score 76-100 -> CRITICAL

Clinical red flags add to severity: contraindicated drug-allergy match, dangerous drug interactions
with active medications, ICD-10 codes outside the typical indication set for the requested CPT,
elderly + high-risk procedure, recent readmission patterns. If guideline concordance is DISCORDANT,
medical_necessity_supported should be false unless an explicit clinical override is documented.
"""


class ClinicalRiskAgent(BaseAgent):
    name = "clinical_risk"

    def _call(self, input_data: dict) -> dict:
        extracted = input_data.get("extracted_data", {})
        user_msg = (
            f"Assess clinical severity and medical necessity from the following clinical intake.\n\n"
            f"Clinical data:\n{json.dumps(extracted, indent=2)}"
        )
        user_msg += _framing_note(input_data.get("_framing"))
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"clinical_risk_result": result, "tokens": tokens}
