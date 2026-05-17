"""AgentProbe public API.

Lazy imports so optional deps (langfuse, snowflake) aren't required to use
the analyzer / generators / scorer in isolation (e.g. in tests or notebooks).
"""
import importlib
from typing import Any

__all__ = [
    "TraceIngester",
    "AttackGenerator",
    "AttackRunner",
    "JudgeEvaluator",
    "ReliabilityScorer",
    "WorkflowAnalyzer",
]

_LAZY = {
    "TraceIngester": ("agentprobe.ingester", "TraceIngester"),
    "AttackGenerator": ("agentprobe.generator", "AttackGenerator"),
    "AttackRunner": ("agentprobe.runner", "AttackRunner"),
    "JudgeEvaluator": ("agentprobe.judge", "JudgeEvaluator"),
    "ReliabilityScorer": ("agentprobe.scorer", "ReliabilityScorer"),
    "WorkflowAnalyzer": ("agentprobe.analyzer", "WorkflowAnalyzer"),
}


def __getattr__(name: str) -> Any:
    if name in _LAZY:
        module_path, attr = _LAZY[name]
        return getattr(importlib.import_module(module_path), attr)
    raise AttributeError(f"module 'agentprobe' has no attribute {name!r}")
