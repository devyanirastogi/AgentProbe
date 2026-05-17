"""Stage 1.5: Derive a domain-agnostic structural schema of a multi-agent workflow from traces."""
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from typing import Any

from genson import SchemaBuilder

from db import SnowflakeClient


FieldRole = str  # one of: "free_text" | "categorical" | "numeric" | "identifier" | "structured" | "boolean"

# Heuristics for distinguishing identifier-ish strings from prose
_ID_PATTERNS = (
    re.compile(r"^[A-Z0-9]{6,}$"),                       # passport-like
    re.compile(r"^[0-9a-fA-F-]{8,}$"),                   # uuid-ish
    re.compile(r"^\d{4}-\d{2}-\d{2}"),                   # ISO date
)


@dataclass
class FieldInfo:
    path: str
    json_type: str
    role: FieldRole
    cardinality: int | None = None
    sample_values: list[Any] = field(default_factory=list)


@dataclass
class NodeSchema:
    node_id: str
    input_schema: dict
    output_schema: dict
    input_fields: list[FieldInfo]
    output_fields: list[FieldInfo]
    sample_count: int

    @property
    def free_text_input_paths(self) -> list[str]:
        return [f.path for f in self.input_fields if f.role == "free_text"]

    @property
    def free_text_output_paths(self) -> list[str]:
        return [f.path for f in self.output_fields if f.role == "free_text"]

    @property
    def categorical_output_paths(self) -> list[str]:
        return [f.path for f in self.output_fields if f.role == "categorical"]

    @property
    def numeric_output_paths(self) -> list[str]:
        return [f.path for f in self.output_fields if f.role == "numeric"]


@dataclass
class Edge:
    src: str
    dst: str
    fields_passed: list[str]


@dataclass
class WorkflowSchema:
    workflow_name: str
    nodes: dict[str, NodeSchema]
    edges: list[Edge]
    entry_nodes: list[str]
    terminal_nodes: list[str]
    sample_trace_count: int

    def to_dict(self) -> dict:
        return {
            "workflow_name": self.workflow_name,
            "nodes": {k: asdict(v) for k, v in self.nodes.items()},
            "edges": [asdict(e) for e in self.edges],
            "entry_nodes": self.entry_nodes,
            "terminal_nodes": self.terminal_nodes,
            "sample_trace_count": self.sample_trace_count,
        }


class WorkflowAnalyzer:
    """Builds a structural, domain-free description of a multi-agent workflow from observed traces."""

    def __init__(self, db: SnowflakeClient | None = None):
        self.db = db or SnowflakeClient()

    def analyze(self, workflow_name: str, limit: int = 200) -> WorkflowSchema:
        traces = self.db.get_traces(limit=limit)
        # When the caller asked for a specific workflow, get_traces accepts workflow_id;
        # here we filter by workflow_name (== trace name) downstream by name match on agent_name's parent.
        return self.analyze_traces(traces, workflow_name=workflow_name)

    def analyze_traces(self, traces: list[dict], workflow_name: str = "workflow") -> WorkflowSchema:
        """Pure function over a list of trace rows shaped like ingester.py emits."""
        by_agent: dict[str, list[dict]] = defaultdict(list)
        by_workflow_order: dict[str, list[str]] = defaultdict(list)  # workflow_id -> [agent in arrival order]

        for t in traces:
            agent = t.get("agent_name") or "unknown"
            by_agent[agent].append(t)
            wf = t.get("workflow_id")
            if wf and agent not in by_workflow_order[wf]:
                by_workflow_order[wf].append(agent)

        nodes: dict[str, NodeSchema] = {}
        for agent, rows in by_agent.items():
            in_schema = self._infer_schema([self._loadj(r.get("input")) for r in rows])
            out_schema = self._infer_schema([self._loadj(r.get("output")) for r in rows])
            in_samples = [self._loadj(r.get("input")) for r in rows[:10]]
            out_samples = [self._loadj(r.get("output")) for r in rows[:10]]
            nodes[agent] = NodeSchema(
                node_id=agent,
                input_schema=in_schema,
                output_schema=out_schema,
                input_fields=self._classify_fields(in_schema, in_samples),
                output_fields=self._classify_fields(out_schema, out_samples),
                sample_count=len(rows),
            )

        edges = self._infer_edges(by_workflow_order, nodes)
        entry = self._roots(nodes.keys(), edges)
        terminal = self._leaves(nodes.keys(), edges)

        return WorkflowSchema(
            workflow_name=workflow_name,
            nodes=nodes,
            edges=edges,
            entry_nodes=entry,
            terminal_nodes=terminal,
            sample_trace_count=len(traces),
        )

    @staticmethod
    def _loadj(v: Any) -> Any:
        if isinstance(v, (dict, list)):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return {}
        return {}

    @staticmethod
    def _infer_schema(samples: list[Any]) -> dict:
        builder = SchemaBuilder()
        for s in samples:
            if s is None:
                continue
            builder.add_object(s)
        return builder.to_schema()

    def _classify_fields(self, schema: dict, samples: list[Any]) -> list[FieldInfo]:
        """Walk the JSON schema and tag each leaf with a structural role."""
        fields: list[FieldInfo] = []
        self._walk_schema(schema, path="", samples=samples, out=fields)
        return fields

    def _walk_schema(self, schema: dict, path: str, samples: list[Any], out: list[FieldInfo]) -> None:
        if not isinstance(schema, dict):
            return
        t = schema.get("type")
        if t == "object" or "properties" in schema:
            for k, sub in (schema.get("properties") or {}).items():
                child_samples = [self._get(s, k) for s in samples]
                self._walk_schema(sub, f"{path}.{k}" if path else k, child_samples, out)
            return
        if t == "array":
            item = schema.get("items") or {}
            child_samples: list[Any] = []
            for s in samples:
                if isinstance(s, list):
                    child_samples.extend(s[:3])
            self._walk_schema(item, f"{path}[]", child_samples, out)
            return

        observed = [s for s in samples if s is not None]
        json_type = t if isinstance(t, str) else (t[0] if isinstance(t, list) and t else "unknown")
        role = self._classify_leaf(json_type, observed)
        cardinality = len({self._hashable(v) for v in observed}) if observed else None
        out.append(
            FieldInfo(
                path=path or "$",
                json_type=json_type or "unknown",
                role=role,
                cardinality=cardinality,
                sample_values=observed[:3],
            )
        )

    @staticmethod
    def _classify_leaf(json_type: str, observed: list[Any]) -> FieldRole:
        if json_type == "boolean":
            return "boolean"
        if json_type in ("integer", "number"):
            return "numeric"
        if json_type == "string":
            if not observed:
                return "free_text"
            n_unique = len({v for v in observed if isinstance(v, str)})
            avg_len = sum(len(v) for v in observed if isinstance(v, str)) / max(len(observed), 1)
            avg_words = sum(len(v.split()) for v in observed if isinstance(v, str)) / max(len(observed), 1)
            # Low-cardinality short strings => categorical (e.g. "VERIFIED" / "APPROVED")
            if n_unique <= max(5, len(observed) // 4) and avg_len < 32 and avg_words < 5:
                return "categorical"
            # Identifier-like (ids, dates, hashes)
            if any(any(p.match(v) for p in _ID_PATTERNS) for v in observed if isinstance(v, str)):
                return "identifier"
            # Long prose => free text
            if avg_words >= 4 or avg_len >= 40:
                return "free_text"
            return "identifier"
        return "structured"

    @staticmethod
    def _get(obj: Any, key: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(key)
        return None

    @staticmethod
    def _hashable(v: Any) -> Any:
        if isinstance(v, (dict, list)):
            return json.dumps(v, sort_keys=True, default=str)
        return v

    def _infer_edges(
        self,
        by_workflow_order: dict[str, list[str]],
        nodes: dict[str, NodeSchema],
    ) -> list[Edge]:
        """Two signals: temporal order within a workflow run, and output->input field overlap."""
        adjacency: dict[tuple[str, str], int] = defaultdict(int)
        for order in by_workflow_order.values():
            for src, dst in zip(order, order[1:]):
                if src != dst:
                    adjacency[(src, dst)] += 1

        edges: list[Edge] = []
        for (src, dst), count in adjacency.items():
            if count < 1:
                continue
            shared = self._shared_fields(nodes.get(src), nodes.get(dst))
            edges.append(Edge(src=src, dst=dst, fields_passed=shared))
        return edges

    @staticmethod
    def _shared_fields(src: NodeSchema | None, dst: NodeSchema | None) -> list[str]:
        if not src or not dst:
            return []
        # Compare leaf keys (last path segment) — a coarse but generic signal.
        src_keys = {f.path.split(".")[-1].replace("[]", "") for f in src.output_fields}
        dst_keys = {f.path.split(".")[-1].replace("[]", "") for f in dst.input_fields}
        return sorted(src_keys & dst_keys)

    @staticmethod
    def _roots(all_nodes, edges: list[Edge]) -> list[str]:
        has_incoming = {e.dst for e in edges}
        return sorted(n for n in all_nodes if n not in has_incoming)

    @staticmethod
    def _leaves(all_nodes, edges: list[Edge]) -> list[str]:
        has_outgoing = {e.src for e in edges}
        return sorted(n for n in all_nodes if n not in has_outgoing)
