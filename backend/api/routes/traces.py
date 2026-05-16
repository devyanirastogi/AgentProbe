from fastapi import APIRouter, Request
from db import SnowflakeClient

router = APIRouter()


@router.get("/")
async def list_traces(request: Request, workflow_id: str | None = None, limit: int = 100):
    db: SnowflakeClient = request.app.state.db
    return db.get_traces(workflow_id=workflow_id, limit=limit)
