"""
Swarm Decentralized Storage router for SlotPay FastAPI backend.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from services.swarm_service import swarm_service

router = APIRouter(prefix="/api/swarm", tags=["Swarm Decentralized Storage"])


@router.post("/upload")
async def upload_file(request: Request) -> dict:
    """Store document or portfolio asset and return Swarm reference hash."""
    content = await request.body()
    filename = request.headers.get("x-filename", "upload.bin")
    content_type = request.headers.get("content-type", "application/octet-stream")
    return swarm_service.upload_file_bytes(filename, content, content_type)


@router.get("/status")
def swarm_status() -> dict:
    """Return Swarm node connection status and active postage stamp batch info."""
    return swarm_service.get_status()


@router.get("/{reference}")
def get_file(reference: str):
    """Retrieve file content stored on Swarm or local Swarm cache."""
    file_info = swarm_service.get_file(reference)
    if not file_info:
        raise HTTPException(status_code=404, detail="Swarm reference not found")

    return Response(
        content=file_info["data"],
        media_type=file_info["content_type"],
        headers={"Content-Disposition": f'inline; filename="{file_info["filename"]}"'},
    )
