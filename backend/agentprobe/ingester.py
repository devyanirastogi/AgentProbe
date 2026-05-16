"""Stage 1: Pull traces from LangFuse and normalize into Snowflake."""
import os
from langfuse import Langfuse
from db import SnowflakeClient


class TraceIngester:
    def __init__(self, db: SnowflakeClient | None = None):
        self.lf = Langfuse(
            secret_key=os.environ["LANGFUSE_SECRET_KEY"],
            public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
            host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        self.db = db or SnowflakeClient()

    def ingest(self, workflow_name: str = "bank-account-opening", limit: int = 100) -> list[dict]:
        """Fetch traces from LangFuse and store in Snowflake. Returns normalized trace list."""
        traces_page = self.lf.fetch_traces(name=workflow_name, limit=limit)
        normalized = []

        for trace in traces_page.data:
            for obs in trace.observations or []:
                record = {
                    "trace_id": f"{trace.id}:{obs.id}",
                    "workflow_id": trace.id,
                    "agent_name": obs.name or "unknown",
                    "input": obs.input or {},
                    "output": obs.output or {},
                    "tokens": (obs.usage.total_tokens if obs.usage else None),
                    "latency_ms": (
                        int((obs.end_time - obs.start_time).total_seconds() * 1000)
                        if obs.end_time and obs.start_time
                        else None
                    ),
                }
                self.db.insert_trace(record)
                normalized.append(record)

        return normalized
