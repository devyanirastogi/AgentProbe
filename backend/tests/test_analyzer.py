"""Analyzer tests: run on the real CSV fixture and assert structural properties.

Domain-agnostic claim is verified by *not* asserting on banking-specific
field semantics — only structural roles (free_text / categorical / etc.)
and DAG shape.
"""


def test_loads_traces_from_csv(normalized_traces):
    assert len(normalized_traces) > 0
    sample = normalized_traces[0]
    assert {"trace_id", "workflow_id", "agent_name", "input", "output"} <= set(sample)
    assert isinstance(sample["input"], dict)
    assert isinstance(sample["output"], dict)


def test_schema_discovers_all_agents(workflow_schema):
    # The fixture trace is a 4-agent workflow; the analyzer should find all 4.
    expected = {"document_extraction", "kyc_verification", "risk_assessment", "compliance_decision"}
    assert expected <= set(workflow_schema.nodes.keys())


def test_schema_infers_dag_chain(workflow_schema):
    # Each non-entry node should be reachable from an entry node via the edges.
    edges = workflow_schema.edges
    assert len(edges) > 0
    src_nodes = {e.src for e in edges}
    dst_nodes = {e.dst for e in edges}
    # entry node(s) appear as src but never as dst (or have fewer incoming than outgoing)
    assert workflow_schema.entry_nodes, "no entry node inferred"
    assert workflow_schema.terminal_nodes, "no terminal node inferred"
    # entries should not be destinations
    for entry in workflow_schema.entry_nodes:
        assert entry not in dst_nodes
    # terminals should not be sources
    for term in workflow_schema.terminal_nodes:
        assert term not in src_nodes


def test_free_text_fields_detected(workflow_schema):
    # At least one node must expose a free_text input or output field — otherwise
    # the INJECTION and SANDBAGGING generators have nothing to target.
    any_free_text = any(
        n.free_text_input_paths or n.free_text_output_paths
        for n in workflow_schema.nodes.values()
    )
    assert any_free_text


def test_categorical_or_numeric_outputs_detected(workflow_schema):
    # At least one node must expose a categorical or numeric output — otherwise
    # the BOUNDARY generator has no decision-emitting target.
    any_decision = any(
        n.categorical_output_paths or n.numeric_output_paths
        for n in workflow_schema.nodes.values()
    )
    assert any_decision


def test_edges_carry_shared_fields(workflow_schema):
    # Domain-agnostic field-overlap inference: at least one edge should have
    # at least one shared field name between src.output and dst.input.
    assert any(e.fields_passed for e in workflow_schema.edges), (
        "no overlapping field names detected on any edge — generator's CASCADE "
        "targets will be empty in practice"
    )


def test_schema_serializable(workflow_schema):
    # Schemas get passed into LLM prompts as JSON; round-trip must work.
    import json

    payload = workflow_schema.to_dict()
    s = json.dumps(payload, default=str)
    assert "nodes" in json.loads(s)
