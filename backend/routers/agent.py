"""
Autonomous Agent router for SlotPay FastAPI backend.
Streams real-time execution steps and Hedera x402 payment events via SSE.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from schemas.api import AgentChatRequest
from services.agent_service import agent_service

router = APIRouter(prefix="/api/agent", tags=["Autonomous Agent"])


@router.post("/chat")
async def chat_agent_stream(body: AgentChatRequest) -> StreamingResponse:
    """
    Stream autonomous agent reasoning, Arkiv service discovery,
    slot claim, and Hedera x402 autonomous checkout over SSE.
    """
    stream_generator = agent_service.stream_agent_workflow(
        message=body.message,
        limit=body.limit,
        auto_approve=body.autoApprove,
        client_wallet=body.clientWallet or "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
    )

    return StreamingResponse(
        stream_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

