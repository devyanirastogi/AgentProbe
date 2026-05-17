import json
from .base import BaseAgent
from ._framing import _framing_note

SYSTEM = """You are the treatment-authorization merger agent — the final gatekeeper that combines a
CLINICAL branch (intake -> clinical_risk) and a FINANCIAL branch (payer_verification -> coverage_check)
that ran in parallel. The two branches never saw each other's outputs. Your job is to reconcile them.

Return ONLY valid JSON:
{
  "decision": "APPROVE" | "DENY" | "PEER_REVIEW",
  "decision_code": str,             // e.g. "MEDICAL_NECESSITY_NOT_MET", "COVERAGE_EXCLUDED", "APPROVED_STANDARD", "BRANCH_CONTRADICTION"
  "regulatory_basis": str,          // cite specific policy (CMS NCD/LCD, payer medical policy, HIPAA, EMTALA)
  "auth_number": str | null,        // populated only when decision=APPROVE
  "authorized_units": int | null,
  "denial_reason": str | null,
  "appeal_rights": str | null,
  "peer_review_reason": str | null,
  "branch_contradictions": [str],   // explicit list of any clinical-vs-financial conflicts you detected
  "summary": str,
  "conditions": [str]
}

Reconciliation rules:
- If clinical CRITICAL/EMERGENT acuity AND coverage_active=false -> PEER_REVIEW per EMTALA; do NOT auto-deny.
  Cite "EMTALA 42 USC 1395dd" in regulatory_basis. Hospital must stabilize regardless of coverage.
- If clinical medical_necessity_supported=true AND policy_status=EXCLUDED on benefit grounds
  -> DENY with appeal_rights populated. Patient can appeal medical necessity.
- If clinical medical_necessity_supported=false AND policy_status=COVERED
  -> DENY for lack of medical necessity, decision_code="MEDICAL_NECESSITY_NOT_MET".
- If contraindications non-empty OR drug_interactions non-empty -> PEER_REVIEW for clinical override.
- If both branches green (medical_necessity_supported=true, policy_status=COVERED, no contraindications,
  prior_auth_on_file=true when required) -> APPROVE with auth_number.
- If FLAGGED on either side -> PEER_REVIEW.

DATA-INTEGRITY CHECK (critical):
You must explicitly check for contradictions between branches. Examples of contradictions to flag
in branch_contradictions:
  - Coverage says coverage_active=false but payer claims VERIFIED.
  - Clinical extracted a CPT that doesn't appear in the coverage check.
  - Member ID format doesn't match the plan_type pattern.
  - Patient identity mismatch between clinical intake and payer subscriber name.
If you detect a contradiction, default to PEER_REVIEW with decision_code="BRANCH_CONTRADICTION" and
list each contradiction. Do NOT silently trust one branch over the other — that is the failure mode this
workflow is specifically designed to catch.

You are the last line of defense. Independently verify both branches' reasoning — do NOT blindly trust
upstream outputs from either branch.
"""


class TreatmentAuthorizationAgent(BaseAgent):
    name = "treatment_authorization"

    def _call(self, input_data: dict) -> dict:
        extracted = input_data.get("extracted_data", {})
        clinical = input_data.get("clinical_risk_result", {})
        payer = input_data.get("payer_data", {})
        coverage = input_data.get("coverage_result", {})

        user_msg = (
            f"Make the final authorization decision by reconciling both branches.\n\n"
            f"=== CLINICAL BRANCH ===\n"
            f"Clinical intake:\n{json.dumps(extracted, indent=2)}\n\n"
            f"Clinical risk assessment:\n{json.dumps(clinical, indent=2)}\n\n"
            f"=== FINANCIAL BRANCH ===\n"
            f"Payer verification:\n{json.dumps(payer, indent=2)}\n\n"
            f"Coverage / medical-policy check:\n{json.dumps(coverage, indent=2)}"
        )
        user_msg += _framing_note(input_data.get("_framing"))
        text, tokens = self._chat(SYSTEM, user_msg)

        try:
            start = text.index("{")
            end = text.rindex("}") + 1
            result = json.loads(text[start:end])
        except (ValueError, json.JSONDecodeError):
            result = {"raw_response": text, "parse_error": True}

        return {"authorization_result": result, "tokens": tokens}
