import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from agents.pipeline import BankingPipeline
from agentprobe import TraceIngester, AttackGenerator, AttackRunner, JudgeEvaluator, ReliabilityScorer
from db import get_db
from .routes import traces, attacks, scores


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = get_db()
    app.state.pipeline = BankingPipeline(sandbox=True)
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
            traces_data = ingester.ingest(limit=config.get("trace_limit", 50))

        await websocket.send_json({"event": "traces_ingested", "count": len(traces_data)})

        # Stage 2: generate attacks
        await websocket.send_json({"event": "stage", "stage": "generating_attacks"})
        generator = AttackGenerator(db=db)
        scenarios = generator.generate(traces_data, attacks_per_type=config.get("attacks_per_type", 3))
        await websocket.send_json({"event": "attacks_generated", "count": len(scenarios)})

        # Stage 3 + 4: run attacks and judge results
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
            run_result = runner.run_scenario(scenario)
            judged = judge.evaluate(scenario, run_result)
            evaluated.append(judged)
            await websocket.send_json({"event": "result", "index": i, "result": judged})

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
