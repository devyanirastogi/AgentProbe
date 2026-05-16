from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/results")
async def list_attack_results(request: Request, workflow_id: str | None = None):
    return request.app.state.db.get_attack_results(workflow_id=workflow_id)
