"""
Swarm Decentralized Storage router for SlotPay FastAPI backend.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from services.swarm_service import swarm_service

router = APIRouter(prefix="/api/swarm", tags=["Swarm Decentralized Storage"])


@router.post("/upload")
async def upload_file(request: Request) -> dict:
    """Store document or portfolio asset and return Swarm reference hash."""
    content = await request.body()
    filename = request.headers.get("x-filename", "upload.bin")
    return swarm_service.upload_file_bytes(filename, content)
