from fastapi import APIRouter, Request
from db import SnowflakeClient

router = APIRouter()


@router.get("/results")
async def list_attack_results(request: Request, workflow_id: str | None = None):
    db: SnowflakeClient = request.app.state.db
    return db.get_attack_results(workflow_id=workflow_id)
