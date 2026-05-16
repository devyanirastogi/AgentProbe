from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/")
async def list_traces(request: Request, workflow_id: str | None = None, limit: int = 100):
    return request.app.state.db.get_traces(workflow_id=workflow_id, limit=limit)
