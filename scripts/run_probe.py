#!/usr/bin/env python3
"""CLI entry point to run a full AgentProbe sweep without the web UI."""
import json
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from agentprobe import TraceIngester, AttackGenerator, AttackRunner, JudgeEvaluator, ReliabilityScorer
from db import get_db


def main():
    workflow_id = str(uuid.uuid4())
    db = get_db()

    print("=== AgentProbe — Adversarial Red-Teaming Engine ===\n")

    # Stage 1: ingest traces (CSV file or LangFuse API)
    print("[1/4] Ingesting traces...")
    ingester = TraceIngester(db=db)

    csv_path = os.getenv("AGENTPROBE_CSV")
    if csv_path and os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8") as f:
            traces = ingester.ingest_csv(f.read())
        print(f"      {len(traces)} trace spans ingested from CSV: {csv_path}\n")
    else:
        traces = ingester.ingest(limit=50)
        print(f"      {len(traces)} trace spans ingested from LangFuse API.\n")

    # Stage 2: generate attacks
    print("[2/4] Generating adversarial scenarios...")
    generator = AttackGenerator(db=db)
    scenarios = generator.generate(traces, attacks_per_type=3)
    print(f"      {len(scenarios)} attack scenarios generated.\n")

    # Stage 3 + 4a: run attacks and judge
    print("[3/4] Executing attacks...")
    runner = AttackRunner(db=db)
    judge = JudgeEvaluator(db=db)
    evaluated = []

    for i, scenario in enumerate(scenarios):
        print(f"      [{i+1}/{len(scenarios)}] {scenario['attack_type']} → {scenario['target_agent']}", end=" ", flush=True)
        run_result = runner.run_scenario(scenario)
        judged = judge.evaluate(scenario, run_result)
        verdict = judged.get("verdict", "?")
        print(f"→ {verdict}")
        evaluated.append(judged)

    # Stage 4b: score
    print()
    print("[4/4] Computing reliability scores...")
    scorer = ReliabilityScorer(db=db)
    agent_scores = scorer.compute_agent_scores(evaluated, scenarios, workflow_id)
    workflow_score = scorer.compute_workflow_score(agent_scores)

    print(f"\n{'='*50}")
    print(f"Workflow Reliability Score: {workflow_score}%")
    print(f"{'='*50}")
    for agent, metrics in agent_scores.items():
        print(f"\n  {agent}")
        for k, v in metrics.items():
            if v is not None:
                print(f"    {k}: {v:.1f}%")

    fails = sum(1 for r in evaluated if r.get("verdict") == "FAIL")
    print(f"\n  Total: {len(evaluated)} attacks | {fails} FAIL | {len(evaluated)-fails} PASS/PARTIAL")
    print("\nResults stored in DB.")


if __name__ == "__main__":
    main()
