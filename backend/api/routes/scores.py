from fastapi import APIRouter, Request
from db import SnowflakeClient

router = APIRouter()


@router.get("/")
async def list_scores(request: Request, workflow_id: str | None = None):
    db: SnowflakeClient = request.app.state.db
    return db.get_reliability_scores(workflow_id=workflow_id)
