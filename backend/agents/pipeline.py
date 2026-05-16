import uuid
from langfuse import Langfuse

from .document_extraction import DocumentExtractionAgent
from .kyc_verification import KYCVerificationAgent
from .risk_assessment import RiskAssessmentAgent
from .compliance_decision import ComplianceDecisionAgent


class BankingPipeline:
    """4-agent banking account opening workflow."""

    def __init__(self, sandbox: bool = False):
        self.sandbox = sandbox
        self.doc_agent = DocumentExtractionAgent(sandbox=sandbox)
        self.kyc_agent = KYCVerificationAgent(sandbox=sandbox)
        self.risk_agent = RiskAssessmentAgent(sandbox=sandbox)
        self.compliance_agent = ComplianceDecisionAgent(sandbox=sandbox)
        self._lf = None
        try:
            self._lf = Langfuse()
        except Exception:
            pass

    def run(self, application: dict, workflow_id: str | None = None) -> dict:
        workflow_id = workflow_id or str(uuid.uuid4())

        # Optional fields injected by AgentProbe
        framing = application.get("framing")               # "formal" | "casual" | None
        override_extraction = application.get("override_extraction")  # dict | None — CASCADE attack

        trace_id = None
        if self._lf:
            trace = self._lf.trace(
                name="bank-account-opening",
                id=workflow_id,
                input=application,
            )
            trace_id = trace.id

        # Stage 1: document extraction (skipped for CASCADE — use injected data instead)
        if override_extraction is not None:
            doc_result = {
                "extracted_data": override_extraction,
                "tokens": 0,
                "_meta": {"agent": "document_extraction", "latency_ms": 0, "overridden": True},
            }
        else:
            doc_result = self.doc_agent.run(
                {"documents": application.get("documents", {}), "_framing": framing},
                trace_id,
            )

        # Stage 2: KYC
        kyc_result = self.kyc_agent.run(
            {"extracted_data": doc_result["extracted_data"], "_framing": framing},
            trace_id,
        )

        # Stage 3: risk assessment
        risk_result = self.risk_agent.run(
            {
                "extracted_data": doc_result["extracted_data"],
                "kyc_result": kyc_result["kyc_result"],
                "_framing": framing,
            },
            trace_id,
        )

        # Stage 4: compliance decision
        compliance_result = self.compliance_agent.run(
            {
                "extracted_data": doc_result["extracted_data"],
                "kyc_result": kyc_result["kyc_result"],
                "risk_result": risk_result["risk_result"],
                "_framing": framing,
            },
            trace_id,
        )

        pipeline_output = {
            "workflow_id": workflow_id,
            "trace_id": trace_id,
            "framing": framing,
            "stages": {
                "document_extraction": doc_result,
                "kyc_verification": kyc_result,
                "risk_assessment": risk_result,
                "compliance_decision": compliance_result,
            },
            "final_decision": compliance_result.get("compliance_result", {}).get("decision"),
        }

        if self._lf and trace_id:
            self._lf.trace(id=trace_id, output=pipeline_output)

        return pipeline_output
