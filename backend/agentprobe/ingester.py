"""Stage 1: Pull traces from LangFuse (API or CSV export) and normalize into Snowflake."""
import csv
import io
import json
import os

from db import get_db


class TraceIngester:
    def __init__(self, db=None):
        self.db = db or get_db()
        self._lf = None
        try:
            from langfuse import Langfuse
            self._lf = Langfuse(
                secret_key=os.environ["LANGFUSE_SECRET_KEY"],
                public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
                host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # CSV ingestion (primary — no API credentials needed)
    # ------------------------------------------------------------------

    def ingest_csv(self, csv_content: str) -> list[dict]:
        """Parse a LangFuse CSV export and return normalized trace records.

        Expected CSV columns (LangFuse export format):
          id, traceId, traceName, type, name, input, output, parentObservationId, ...
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        normalized = []

        for row in reader:
            row_type = row.get("type", "").upper()
            if row_type not in ("SPAN", "GENERATION"):
                continue

            agent_name = row.get("name", "unknown")

            # Skip workflow-level root spans (e.g. "bank-account-opening") —
            # these are trace containers, not individual agent spans.
            if agent_name == row.get("traceName", ""):
                continue

            trace_id = f"{row.get('traceId', '')}:{row.get('id', '')}"
            workflow_id = row.get("traceId", "")

            try:
                input_data = json.loads(row.get("input") or "{}")
            except (json.JSONDecodeError, TypeError):
                input_data = {}

            try:
                output_data = json.loads(row.get("output") or "{}")
            except (json.JSONDecodeError, TypeError):
                output_data = {}

            tokens = None
            raw_tokens = row.get("totalTokens") or row.get("tokens")
            if raw_tokens:
                try:
                    tokens = int(raw_tokens)
                except (ValueError, TypeError):
                    pass

            latency_ms = None
            # Real LangFuse export uses "latencyMs"; also accept legacy variants
            raw_latency = row.get("latencyMs") or row.get("latency") or row.get("latency_ms")
            if raw_latency:
                try:
                    latency_ms = int(float(raw_latency))
                except (ValueError, TypeError):
                    pass

            record = {
                "trace_id": trace_id,
                "workflow_id": workflow_id,
                "agent_name": agent_name,
                "input": input_data,
                "output": output_data,
                "tokens": tokens,
                "latency_ms": latency_ms,
            }
            self.db.insert_trace(record)
            normalized.append(record)

        return normalized

    # ------------------------------------------------------------------
    # LangFuse API ingestion (fallback — requires credentials)
    # ------------------------------------------------------------------

    def ingest(self, workflow_name: str = "bank-account-opening", limit: int = 100) -> list[dict]:
        """Fetch traces from LangFuse API and store in Snowflake.
        Returns empty list if LangFuse is not configured."""
        if not self._lf:
            return []

        traces_page = self._lf.fetch_traces(name=workflow_name, limit=limit)
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
