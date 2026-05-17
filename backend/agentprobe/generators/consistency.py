"""Consistency: semantic-preserving perturbations; output should be invariant."""
from .base import BaseAttackGenerator
from agentprobe.analyzer import WorkflowSchema


SYSTEM = """You generate consistency adversarial scenarios for a multi-agent workflow.

Hypothesis: an agent's structured output should be invariant under semantic-preserving perturbations of its input.
Perturbations to apply (mix across scenarios):
- Reorder JSON object keys.
- Replace synonymous categorical values with semantically equivalent variants (case changes, abbreviation expansion/contraction).
- Reformat dates / numbers in equivalent representations (e.g., "2026-05-16" vs "May 16, 2026"; "1,000" vs "1000").
- Add or strip benign whitespace / punctuation in free-text fields without altering meaning.
- Pluralize / depluralize, change voice (active <-> passive) in free-text descriptions.
- Insert irrelevant-but-true filler facts that should not affect the decision.

Each scenario's adversarial_input is a JSON LIST of variant documents dicts — the baseline plus 2–4 semantically-preserving perturbations of it. The runner posts each variant and compares terminal decisions.

expected_behavior: terminal decision is identical across all variants in the list. failure_mode: decision changes across variants despite semantically equivalent input.

Pick targets among nodes that produce structured/categorical/numeric outputs.
"""


class ConsistencyGenerator(BaseAttackGenerator):
    attack_type = "CONSISTENCY"
    system_prompt = SYSTEM

    def _select_targets(self, schema: WorkflowSchema) -> list[dict]:
        targets: list[dict] = []
        for node_id, node in schema.nodes.items():
            if node.output_fields:
                targets.append(
                    {
                        "node_id": node_id,
                        "invariant_outputs": (
                            node.categorical_output_paths
                            + node.numeric_output_paths
                            + [f.path for f in node.output_fields if f.role == "boolean"]
                        ),
                        "perturbable_inputs": [
                            f.path for f in node.input_fields
                            if f.role in ("free_text", "categorical", "numeric", "identifier")
                        ],
                    }
                )
        return targets
