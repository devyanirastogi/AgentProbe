"""Smoke tests for the 4-agent banking pipeline (no real API calls)."""
import json
import pytest
from unittest.mock import MagicMock, patch


CLEAN_APP = {
    "documents": {
        "passport": {
            "full_name": "Test User",
            "date_of_birth": "1990-01-01",
            "document_id": "P123456789",
            "expiry": "2031-01-01",
            "nationality": "US",
            "address": "123 Main St, Chicago, IL 60601",
        },
        "income_statement": {"employer": "Acme Corp", "role": "Engineer", "annual_income_usd": 120000},
    }
}


def _mock_agent_response(text: str):
    """Create a mock Anthropic response."""
    mock = MagicMock()
    mock.content = [MagicMock(text=text)]
    mock.usage.input_tokens = 100
    mock.usage.output_tokens = 50
    return mock


@patch("anthropic.Anthropic")
def test_document_extraction_returns_dict(mock_anthropic_cls):
    from agents.document_extraction import DocumentExtractionAgent

    payload = json.dumps({
        "full_name": "Test User", "date_of_birth": "1990-01-01",
        "address": "123 Main St", "document_type": "passport",
        "document_id": "P123456789", "document_expiry": "2031-01-01",
        "income_annual_usd": 120000, "income_source": "employment",
        "extraction_notes": "",
    })
    mock_anthropic_cls.return_value.messages.create.return_value = _mock_agent_response(payload)

    agent = DocumentExtractionAgent()
    result = agent.run({"documents": CLEAN_APP["documents"]})
    assert "extracted_data" in result
    assert result["extracted_data"]["full_name"] == "Test User"


@patch("anthropic.Anthropic")
def test_kyc_agent_returns_status(mock_anthropic_cls):
    from agents.kyc_verification import KYCVerificationAgent

    payload = json.dumps({
        "status": "VERIFIED", "identity_match": True, "document_valid": True,
        "ofac_hit": False, "pep_hit": False, "adverse_media": False,
        "verification_steps": ["name check", "doc check"],
        "flags": [], "reasoning": "All clear",
    })
    mock_anthropic_cls.return_value.messages.create.return_value = _mock_agent_response(payload)

    agent = KYCVerificationAgent()
    result = agent.run({"extracted_data": {"full_name": "Test User"}})
    assert result["kyc_result"]["status"] == "VERIFIED"


@patch("anthropic.Anthropic")
def test_risk_agent_returns_tier(mock_anthropic_cls):
    from agents.risk_assessment import RiskAssessmentAgent

    payload = json.dumps({
        "risk_score": 15, "risk_tier": "LOW",
        "aml_flags": [], "credit_flags": [],
        "geographic_risk": "LOW", "income_verified": True,
        "structuring_indicators": False, "reasoning": "Low risk profile",
    })
    mock_anthropic_cls.return_value.messages.create.return_value = _mock_agent_response(payload)

    agent = RiskAssessmentAgent()
    result = agent.run({"extracted_data": {}, "kyc_result": {}})
    assert result["risk_result"]["risk_tier"] == "LOW"


@patch("anthropic.Anthropic")
def test_compliance_agent_returns_decision(mock_anthropic_cls):
    from agents.compliance_decision import ComplianceDecisionAgent

    payload = json.dumps({
        "decision": "APPROVE", "decision_code": "APPROVED_STANDARD",
        "regulatory_basis": "BSA Section 326", "summary": "Clean profile",
        "escalation_reason": None, "conditions": [],
    })
    mock_anthropic_cls.return_value.messages.create.return_value = _mock_agent_response(payload)

    agent = ComplianceDecisionAgent()
    result = agent.run({"extracted_data": {}, "kyc_result": {}, "risk_result": {}})
    assert result["compliance_result"]["decision"] == "APPROVE"
