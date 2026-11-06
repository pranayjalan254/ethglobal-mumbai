"""
Swarm Decentralized Storage router for OASIS FastAPI backend.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from services.swarm_service import swarm_service

router = APIRouter(prefix="/api/swarm", tags=["Swarm Decentralized Storage"])


@router.post("/upload")
async def upload_file(request: Request) -> dict:
    """Store document or portfolio asset and return Swarm reference hash."""
    content = await request.body()
    filename = request.headers.get("x-filename", "upload.bin")
    content_type = request.headers.get("content-type", "application/octet-stream")
    custom_ref = request.headers.get("x-swarm-ref")
    return swarm_service.upload_file_bytes(filename, content, content_type, custom_ref=custom_ref)


@router.get("/status")
def swarm_status() -> dict:
    """Return Swarm node connection status and active postage stamp batch info."""
    return swarm_service.get_status()


@router.get("/{reference}")
def get_file(reference: str):
    """Retrieve file content stored on Swarm, or redirect to live Swarm gateway (never 404)."""
    clean_ref = reference.replace("0x", "").replace("bzz://", "").strip()
    file_info = swarm_service.get_file(clean_ref)
    if file_info:
        return Response(
            content=file_info["data"],
            media_type=file_info["content_type"],
            headers={"Content-Disposition": f'inline; filename="{file_info["filename"]}"'},
        )

    # Redirect directly to official Swarm Gateway so the user sees the real resolution / approval page
    return RedirectResponse(
        url=f"https://gateway.ethswarm.org/bzz/{clean_ref}",
        status_code=307,
    )
