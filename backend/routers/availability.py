"""
Availability and Slots router for SlotPay FastAPI backend.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query

from schemas.api import (
    AvailabilityPublishInput,
    AvailabilityPublishResponse,
    ClaimSlotResponse,
    SlotSchema,
)
from services.availability_service import availability_service

router = APIRouter(tags=["Availability & Slots"])


@router.get("/api/availability", response_model=list[SlotSchema])
def get_availability(owner: Optional[str] = Query(None)) -> list[dict]:
    """Retrieve slot schedule blocks for provider."""
    return availability_service.get_provider_availability(owner)


@router.get("/api/availability/meta")
def get_availability_meta(owner: Optional[str] = Query(None)) -> dict:
    """Retrieve metadata about published schedule and Arkiv entity."""
    return availability_service.get_published_meta(owner)


@router.post("/api/availability", response_model=AvailabilityPublishResponse)
def publish_availability(body: AvailabilityPublishInput) -> dict:
    """Save availability cells and unblock open slots on Arkiv."""
    return availability_service.publish_availability(body.cells, body.owner, body.entity_key, body.tx_ref)


@router.post("/api/slots/{slot_id}/claim", response_model=ClaimSlotResponse)
def claim_slot(slot_id: str) -> dict:
    """Acquire a 5-minute availability hold on a slot."""
    return availability_service.claim_slot(slot_id)

