#!/usr/bin/env python3
"""Export LangFuse traces filtered by workflow tag.

Pipelines tag every run with a `workflow:<name>` tag via the @tag_workflow
decorator. This script uses the LangFuse fetch API to pull the matching traces
plus their observations and writes them to a JSON file.

Usage:
    python scripts/export_traces.py --workflow healthcare --out healthcare_traces.json
    python scripts/export_traces.py --workflow banking    --out banking_traces.json
    python scripts/export_traces.py --workflow healthcare --limit 50

Requirements:
    LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (and LANGFUSE_HOST if not cloud)
    set in backend/.env or in the environment.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow", required=True, choices=["healthcare", "banking"],
                        help="Which pipeline's traces to export.")
    parser.add_argument("--out", default=None,
                        help="Output JSON file. Defaults to <workflow>_traces.json.")
    parser.add_argument("--limit", type=int, default=100,
                        help="Max traces to pull (default: 100).")
    parser.add_argument("--with-observations", action="store_true",
                        help="Also fetch per-trace observations (spans + generations). Slower.")
    args = parser.parse_args()

    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        sys.exit("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set; cannot connect.")

    from langfuse import Langfuse
    lf = Langfuse()

    tag = f"workflow:{args.workflow}"
    print(f"Fetching LangFuse traces with tag={tag!r} (limit {args.limit})...")
    try:
        resp = lf.fetch_traces(tags=tag, limit=args.limit)
    except Exception as e:
        sys.exit(f"LangFuse fetch_traces failed: {e}")

    traces = resp.data or []
    if not traces:
        print("No matching traces. Did you run the pipeline after the tagging change?")
        sys.exit(0)

    serialized = []
    for t in traces:
        # Convert pydantic models to plain dicts
        trace_dict = t.model_dump(mode="json") if hasattr(t, "model_dump") else dict(t)
        if args.with_observations:
            try:
                obs_resp = lf.fetch_observations(trace_id=trace_dict["id"], limit=200)
                trace_dict["observations"] = [
                    o.model_dump(mode="json") if hasattr(o, "model_dump") else dict(o)
                    for o in (obs_resp.data or [])
                ]
            except Exception as e:
                trace_dict["observations_error"] = str(e)
        serialized.append(trace_dict)

    payload = {
        "workflow": args.workflow,
        "trace_count": len(serialized),
        "traces": serialized,
    }

    out_path = args.out or f"{args.workflow}_traces.json"
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)

    size = os.path.getsize(out_path)
    print(f"Wrote {len(serialized)} traces -> {out_path} ({size:,} bytes)")


if __name__ == "__main__":
    main()
