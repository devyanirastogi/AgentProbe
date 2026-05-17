"""LangFuse telemetry for the pipeline packages.

Call init_langfuse() once at process startup (api/main.py lifespan, or top of a
seed script). It is idempotent and a no-op when LANGFUSE_PUBLIC_KEY/SECRET_KEY
are not set, so it stays safe in environments where LangFuse isn't configured.

Trace structure produced:

    Trace: <workflow>_pipeline (tags=["workflow:<workflow>"], metadata.workflow=<workflow>)
      Span: <agent_name>                                  (BaseAgent.run)
        Generation: <agent_name>.anthropic               (BaseAgent._chat)
          model, input, output, usage{input,output,total}

The tag_workflow() decorator marks the root span and pushes workflow metadata
onto the LangFuse trace context — that's what makes pipeline filtering possible
in the LangFuse UI and via the fetch API.
"""
import functools
import os


_initialized = False


def init_langfuse() -> bool:
    """Initialize the LangFuse client from env vars. Returns True if LangFuse is
    active after the call, False if skipped (missing creds or error).

    LangFuse picks up LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_HOST
    from the process environment automatically — we just confirm the keys are
    present and warm up the singleton so the first agent call doesn't pay init
    latency."""
    global _initialized
    if _initialized:
        return True

    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        return False

    try:
        from langfuse import Langfuse
        Langfuse()  # singleton init from env
        _initialized = True
        return True
    except Exception as e:
        print(f"[telemetry] LangFuse init failed, traces disabled: {e}")
        return False


def flush_langfuse() -> None:
    """Force-flush buffered events. Call at the end of short-lived scripts so
    events aren't lost when the process exits before the background sender runs."""
    if not _initialized:
        return
    try:
        from langfuse.decorators import langfuse_context
        langfuse_context.flush()
    except Exception:
        pass


def tag_workflow(workflow: str):
    """Decorator that wraps a pipeline.run() so every nested agent span is
    contained in a trace tagged with `workflow:<name>` — enables LangFuse UI/API
    filtering for export by pipeline.

    Applied unconditionally: when LangFuse isn't initialized, observe() still
    runs but the events have no exporter. We do NOT gate on env vars at
    decoration time because the env may not be loaded yet when pipeline modules
    are first imported (e.g. uvicorn import order).
    """
    try:
        from langfuse.decorators import observe, langfuse_context
    except Exception:
        return lambda fn: fn

    def decorator(fn):
        @observe(name=f"{workflow}_pipeline")
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                langfuse_context.update_current_trace(
                    name=f"{workflow}_pipeline",
                    metadata={"workflow": workflow},
                    tags=[f"workflow:{workflow}"],
                )
            except Exception:
                pass
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Backwards-compat shims — previous code paths called init_laminar/flush_laminar.
# Keep the old names as aliases so seed scripts and the API lifespan work whether
# they've been updated or not.
# ---------------------------------------------------------------------------
def init_laminar() -> bool:  # pragma: no cover
    return init_langfuse()


def flush_laminar() -> None:  # pragma: no cover
    flush_langfuse()
