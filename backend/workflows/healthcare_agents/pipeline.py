import uuid
from concurrent.futures import ThreadPoolExecutor

from .intake_extraction import IntakeExtractionAgent
from .clinical_risk import ClinicalRiskAgent
from .payer_verification import PayerVerificationAgent
from .coverage_check import CoverageCheckAgent
from .treatment_authorization import TreatmentAuthorizationAgent
from .._telemetry import tag_workflow


class HealthcarePipeline:
    """5-agent hospital pre-authorization DAG with two parallel branches:

        documents
           |
       +---+---+
       v       v
     [1]     [3]                IntakeExtraction || PayerVerification
       v       v
     [2]     [4]                ClinicalRisk     || CoverageCheck
       +--+    +--+
          v    v
          [5]                   TreatmentAuthorization (merger)

    The clinical branch never sees coverage data and vice-versa. The merger reconciles them
    and is responsible for detecting cross-branch contradictions.

    AgentProbe contract preserved:
      - `framing` ("formal" | "casual") flows to every agent for sandbagging detection.
      - `override_extraction` bypasses agent 1 (intake) -- the CASCADE attack vector on the
        clinical branch.
      - `override_payer_data` bypasses agent 3 (payer) -- CASCADE on the financial branch.
        (Optional; if omitted, agent 3 runs normally.)

    Returns the standard shape:
      {workflow_id, framing, stages: {agent_name: agent_result}, final_decision}
    Insertion order of `stages` reflects the DAG (1, 2, 3, 4, 5), not wall-clock completion,
    so the AttackRunner's first-stage heuristic still works.
    """

    def __init__(self, sandbox: bool = False):
        self.sandbox = sandbox
        self.intake_agent = IntakeExtractionAgent(sandbox=sandbox)
        self.clinical_agent = ClinicalRiskAgent(sandbox=sandbox)
        self.payer_agent = PayerVerificationAgent(sandbox=sandbox)
        self.coverage_agent = CoverageCheckAgent(sandbox=sandbox)
        self.auth_agent = TreatmentAuthorizationAgent(sandbox=sandbox)

    @tag_workflow("healthcare")
    def run(self, application: dict, workflow_id: str | None = None) -> dict:
        workflow_id = workflow_id or str(uuid.uuid4())

        documents             = application.get("documents", {})
        framing               = application.get("framing")
        override_extraction   = application.get("override_extraction")
        override_payer_data   = application.get("override_payer_data")

        # ---- Run the two branches in parallel ----
        with ThreadPoolExecutor(max_workers=2) as pool:
            clinical_future = pool.submit(
                self._run_clinical_branch, documents, framing, override_extraction
            )
            financial_future = pool.submit(
                self._run_financial_branch, documents, framing, override_payer_data
            )
            intake_result, clinical_result = clinical_future.result()
            payer_result, coverage_result  = financial_future.result()

        # ---- Stage 5: merger ----
        auth_result = self.auth_agent.run(
            {
                "extracted_data": intake_result["extracted_data"],
                "clinical_risk_result": clinical_result["clinical_risk_result"],
                "payer_data": payer_result["payer_data"],
                "coverage_result": coverage_result["coverage_result"],
                "_framing": framing,
            },
        )

        return {
            "workflow_id": workflow_id,
            "trace_id": workflow_id,
            "framing": framing,
            "stages": {
                "intake_extraction":       intake_result,
                "clinical_risk":           clinical_result,
                "payer_verification":      payer_result,
                "coverage_check":          coverage_result,
                "treatment_authorization": auth_result,
            },
            "final_decision": auth_result.get("authorization_result", {}).get("decision"),
        }

    # ------------------------------------------------------------------
    # Branches
    # ------------------------------------------------------------------

    def _run_clinical_branch(
        self,
        documents: dict,
        framing: str | None,
        override_extraction: dict | None,
    ) -> tuple[dict, dict]:
        if override_extraction is not None:
            intake_result = {
                "extracted_data": override_extraction,
                "tokens": 0,
                "_meta": {"agent": "intake_extraction", "latency_ms": 0, "overridden": True},
            }
        else:
            intake_result = self.intake_agent.run(
                {"documents": documents, "_framing": framing},
            )
        clinical_result = self.clinical_agent.run(
            {"extracted_data": intake_result["extracted_data"], "_framing": framing},
        )
        return intake_result, clinical_result

    def _run_financial_branch(
        self,
        documents: dict,
        framing: str | None,
        override_payer_data: dict | None,
    ) -> tuple[dict, dict]:
        if override_payer_data is not None:
            payer_result = {
                "payer_data": override_payer_data,
                "tokens": 0,
                "_meta": {"agent": "payer_verification", "latency_ms": 0, "overridden": True},
            }
        else:
            payer_result = self.payer_agent.run(
                {"documents": documents, "_framing": framing},
            )
        coverage_result = self.coverage_agent.run(
            {
                "payer_data": payer_result["payer_data"],
                "documents": documents,
                "_framing": framing,
            },
        )
        return payer_result, coverage_result
