from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/")
async def list_scores(request: Request, workflow_id: str | None = None):
    db = request.app.state.db
    rows = db.get_reliability_scores(workflow_id=workflow_id)
    deltas = db.get_sandbagging_deltas(workflow_id=workflow_id)
    for row in rows:
        agent = row.get("agent_name")
        if agent in deltas:
            row["sandbagging_delta"] = deltas[agent]
    return rows
