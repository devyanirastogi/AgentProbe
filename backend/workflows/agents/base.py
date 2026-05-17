import time
from abc import ABC, abstractmethod

import anthropic

try:
    from langfuse.decorators import observe, langfuse_context
    _LF_OK = True
except Exception:
    _LF_OK = False
    def observe(*_args, **_kwargs):
        def deco(fn): return fn
        return deco if _args and callable(_args[0]) is False else _args[0] if _args else deco


class BaseAgent(ABC):
    name: str = "base"
    model: str = "claude-haiku-4-5-20251001"

    def __init__(self, sandbox: bool = False):
        self.client = anthropic.Anthropic()
        self.sandbox = sandbox

    @observe(name="agent", capture_input=False, capture_output=False)
    def run(self, input_data: dict, trace_id: str | None = None) -> dict:
        if _LF_OK:
            try:
                langfuse_context.update_current_observation(
                    name=self.name, input=input_data,
                )
            except Exception:
                pass

        start = time.monotonic()
        result = self._call(input_data)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        result["_meta"] = {
            "agent": self.name,
            "latency_ms": elapsed_ms,
            "model": self.model,
        }

        if _LF_OK:
            try:
                langfuse_context.update_current_observation(output=result)
            except Exception:
                pass
        return result

    @abstractmethod
    def _call(self, input_data: dict) -> dict:
        ...

    @observe(name="anthropic.chat", as_type="generation", capture_input=False, capture_output=False)
    def _chat(self, system: str, user: str) -> tuple[str, int]:
        if _LF_OK:
            try:
                langfuse_context.update_current_observation(
                    name=f"{self.name}.anthropic",
                    model=self.model,
                    input=[{"role": "system", "content": system},
                           {"role": "user", "content": user}],
                )
            except Exception:
                pass

        resp = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text
        in_tok, out_tok = resp.usage.input_tokens, resp.usage.output_tokens

        if _LF_OK:
            try:
                langfuse_context.update_current_observation(
                    output=text,
                    usage={"input": in_tok, "output": out_tok, "total": in_tok + out_tok},
                )
            except Exception:
                pass
        return text, in_tok + out_tok
