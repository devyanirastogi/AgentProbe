import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from agents.pipeline import BankingPipeline
from agentprobe import TraceIngester, AttackGenerator, AttackRunner, JudgeEvaluator, ReliabilityScorer
from db import SnowflakeClient
from .routes import traces, attacks, scores


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = SnowflakeClient()
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
    pipeline: BankingPipeline = app.state.pipeline
    result = pipeline.run(application)
    return result


@app.websocket("/ws/probe")
async def probe_websocket(websocket: WebSocket):
    """Stream live AgentProbe sweep results over WebSocket."""
    await websocket.accept()
    db: SnowflakeClient = app.state.db
    pipeline: BankingPipeline = app.state.pipeline

    try:
        config = await websocket.receive_json()
        workflow_id = config.get("workflow_id", str(uuid.uuid4()))

        await websocket.send_json({"event": "started", "workflow_id": workflow_id})

        # Stage 1: ingest
        await websocket.send_json({"event": "stage", "stage": "ingesting_traces"})
        ingester = TraceIngester(db=db)
        traces_data = ingester.ingest(limit=config.get("trace_limit", 50))
        await websocket.send_json({"event": "traces_ingested", "count": len(traces_data)})

        # Stage 2: generate attacks
        await websocket.send_json({"event": "stage", "stage": "generating_attacks"})
        generator = AttackGenerator(db=db)
        scenarios = generator.generate(traces_data, attacks_per_type=config.get("attacks_per_type", 3))
        await websocket.send_json({"event": "attacks_generated", "count": len(scenarios)})

        # Stage 3: run attacks
        runner = AttackRunner(db=db)
        judge = JudgeEvaluator(db=db)
        run_results = []
        evaluated = []

        for i, scenario in enumerate(scenarios):
            await websocket.send_json({"event": "attacking", "index": i, "total": len(scenarios), "scenario": scenario})
            run_result = runner.run_scenario(scenario, pipeline=pipeline)
            judged = judge.evaluate(scenario, run_result)
            run_results.append(run_result)
            evaluated.append(judged)
            await websocket.send_json({"event": "result", "index": i, "result": judged})

        # Stage 4: score
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
