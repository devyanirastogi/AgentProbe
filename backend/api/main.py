import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from workflows.agents.pipeline import BankingPipeline
from workflows.healthcare_agents.pipeline import HealthcarePipeline
from workflows._telemetry import init_langfuse
from agentprobe import TraceIngester, AttackGenerator, AttackRunner, JudgeEvaluator, ReliabilityScorer
from db import get_db
from .routes import traces, attacks, scores


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize LangFuse before instantiating any pipeline so observations
    # have a live client to send to.
    init_langfuse()
    app.state.db = get_db()
    app.state.pipeline = BankingPipeline(sandbox=True)
    app.state.healthcare_pipeline = HealthcarePipeline(sandbox=True)
    yield


app = FastAPI(title="AgentProbe API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(traces.router, prefix="/api/traces", tags=["traces"])
app.include_router(attacks.router, prefix="/api/attacks", tags=["attacks"])
app.include_router(scores.router, prefix="/api/scores", tags=["scores"])


@app.post("/api/probe/test-endpoint")
async def test_endpoint(req: dict):
    """Preflight reachability check for the user's target pipeline URL.

    Body: {"url": str, "auth_header": str | None}
    Returns: {"ok": bool, "status": int|None, "latency_ms": int, "error": str|None,
              "url": str, "response_keys": list[str]|None}

    Sends a minimal probe POST `{"documents": {}}` so the user can confirm the
    URL responds (and that auth, if any, is accepted) before launching a full
    attack sweep against it.
    """
    import time
    import httpx

    url = (req.get("url") or "").strip()
    if not url:
        return {"ok": False, "error": "url is required", "url": url, "status": None, "latency_ms": 0, "response_keys": None}
    if url.endswith("/run") is False and "/api/pipeline/run" not in url:
        # Allow base URLs; mirror the runner's normalization for clarity.
        url = f"{url.rstrip('/')}/api/pipeline/run"

    headers = {}
    auth = req.get("auth_header")
    if auth:
        headers["Authorization"] = auth

    start = time.perf_counter()
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(url, json={"documents": {}}, headers=headers)
        latency_ms = int((time.perf_counter() - start) * 1000)
        body_keys = None
        try:
            body = resp.json()
            if isinstance(body, dict):
                body_keys = sorted(body.keys())
        except Exception:
            pass
        return {
            "ok": 200 <= resp.status_code < 500,  # 4xx still means "reachable"
            "status": resp.status_code,
            "latency_ms": latency_ms,
            "error": None if resp.status_code < 400 else f"HTTP {resp.status_code}",
            "url": url,
            "response_keys": body_keys,
        }
    except Exception as e:
        return {
            "ok": False,
            "status": None,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "error": str(e)[:300],
            "url": url,
            "response_keys": None,
        }


@app.post("/api/pipeline/run")
async def run_pipeline(application: dict):
    """Run the 4-agent banking pipeline.

    Accepts optional fields injected by AgentProbe:
    - framing: "formal" | "casual"  — sandbagging detection
    - override_extraction: dict      — cascade attack (bypass Agent 1)
    """
    pipeline: BankingPipeline = app.state.pipeline
    result = pipeline.run(application)
    return result


@app.post("/api/healthcare/run")
async def run_healthcare(application: dict):
    """Run the 4-agent healthcare pre-authorization pipeline.

    Same contract as /api/pipeline/run — accepts the AgentProbe-injected fields
    (framing, override_extraction) and returns {workflow_id, stages, final_decision}.
    Point the AgentProbe runner at this URL to red-team the healthcare workflow
    interchangeably with banking.
    """
    pipeline: HealthcarePipeline = app.state.healthcare_pipeline
    result = pipeline.run(application)
    return result


@app.post("/api/ingest/csv")
async def ingest_csv(file: UploadFile = File(...)):
    """Accept a LangFuse CSV export and ingest traces into the database."""
    db = app.state.db
    content = await file.read()
    ingester = TraceIngester(db=db)
    traces_data = ingester.ingest_csv(content.decode("utf-8"))
    return {"ingested": len(traces_data), "traces": traces_data[:5]}


@app.websocket("/ws/probe")
async def probe_websocket(websocket: WebSocket):
    """Stream live AgentProbe sweep results over WebSocket."""
    await websocket.accept()
    db = app.state.db

    try:
        config = await websocket.receive_json()
        workflow_id = config.get("workflow_id", str(uuid.uuid4()))

        await websocket.send_json({"event": "started", "workflow_id": workflow_id})

        # Stage 1: ingest traces
        await websocket.send_json({"event": "stage", "stage": "ingesting_traces"})
        ingester = TraceIngester(db=db)

        csv_content = config.get("csv_content")
        if csv_content:
            traces_data = ingester.ingest_csv(csv_content)
        else:
            traces_data = db.get_traces(workflow_id=workflow_id, limit=config.get("trace_limit", 50))

        await websocket.send_json({"event": "traces_ingested", "count": len(traces_data)})

        # Stage 2: generate attacks
        await websocket.send_json({"event": "stage", "stage": "generating_attacks"})
        generator = AttackGenerator(db=db)
        scenarios = await asyncio.to_thread(
            generator.generate,
            traces_data,
            attacks_per_type=config.get("attacks_per_type", 3),
            workflow_description=config.get("workflow_name") or None,
        )
        max_scenarios = config.get("max_scenarios")
        if max_scenarios:
            scenarios = scenarios[:max_scenarios]
        await websocket.send_json({"event": "attacks_generated", "count": len(scenarios)})

        # Stage 3 + 4: run attacks in parallel and stream results as they complete
        pipeline_url = config.get("pipeline_url") or "http://localhost:8000"
        auth_header  = config.get("auth_header") or None
        runner = AttackRunner(pipeline_base_url=pipeline_url, auth_header=auth_header, db=db)
        judge = JudgeEvaluator(db=db)
        evaluated = []

        for i, scenario in enumerate(scenarios):
            await websocket.send_json({
                "event": "attacking",
                "index": i,
                "total": len(scenarios),
                "scenario": scenario,
            })
            run_result = await asyncio.to_thread(runner.run_scenario, scenario)
            judged = await asyncio.to_thread(judge.evaluate, scenario, run_result)
            evaluated.append(judged)
            await websocket.send_json({
                "event": "result",
                "index": i,
                "result": {
                    **judged,
                    "scenario": {
                        "attack_type": scenario.get("attack_type"),
                        "target_node_id": scenario.get("target_node_id") or scenario.get("target_agent"),
                        "description": scenario.get("description"),
                    },
                },
            })

        # Stage 4b: score
        await websocket.send_json({"event": "stage", "stage": "scoring"})
        scorer = ReliabilityScorer(db=db)
        agent_scores = scorer.compute_agent_scores(evaluated, scenarios, workflow_id)
        workflow_score = scorer.compute_workflow_score(agent_scores)

        await websocket.send_json({
            "event": "complete",
            "workflow_score": workflow_score,
            "agent_scores": agent_scores,
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"event": "error", "message": str(e)})
        await websocket.close()
