import time
from abc import ABC, abstractmethod
from typing import Any

import anthropic
from langfuse import Langfuse

_langfuse = None


def get_langfuse() -> Langfuse | None:
    global _langfuse
    if _langfuse is None:
        try:
            _langfuse = Langfuse()
        except Exception:
            pass
    return _langfuse


class BaseAgent(ABC):
    name: str = "base"
    model: str = "claude-sonnet-4-6"

    def __init__(self, sandbox: bool = False):
        self.client = anthropic.Anthropic()
        self.sandbox = sandbox

    def run(self, input_data: dict, trace_id: str | None = None) -> dict:
        lf = get_langfuse()
        span = None
        if lf and trace_id:
            span = lf.span(
                name=self.name,
                trace_id=trace_id,
                input=input_data,
            )

        start = time.monotonic()
        result = self._call(input_data)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        result["_meta"] = {
            "agent": self.name,
            "latency_ms": elapsed_ms,
            "model": self.model,
        }

        if span:
            span.end(output=result)

        return result

    @abstractmethod
    def _call(self, input_data: dict) -> dict:
        ...

    def _chat(self, system: str, user: str) -> tuple[str, int]:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text, resp.usage.input_tokens + resp.usage.output_tokens
