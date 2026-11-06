"""
Bookings router for OASIS FastAPI backend.
Handles Hedera x402 payment requirements challenges and confirmations.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query

from schemas.api import (
    BookingConfirmInput,
    BookingCreateInput,
    BookingCreateResponse,
    BookingSchema,
    ReceiptSchema,
)
from services.booking_service import booking_service

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])


@router.post("", response_model=BookingCreateResponse)
def create_booking(body: BookingCreateInput) -> dict:
    """
    Generate an HTTP 402 challenge with exact Hedera payment parameters
    required to book the requested service slot.
    """
    service_id = body.serviceId or (body.service.get("id") if body.service else "s1")
    slot_id = body.slotId or body.slot_id or f"{service_id}-1-10"

    return booking_service.create_booking_challenge(
        service_id=service_id,
        slot_id=slot_id,
        buyer_wallet=body.buyerWallet,
    )


@router.post("/confirm", response_model=ReceiptSchema)
def confirm_booking_direct(body: BookingConfirmInput) -> dict:
    """Confirm settled Hedera payment and burn slot entity from Arkiv."""
    service_id = body.serviceId or (body.service.get("id") if body.service else "s1")
    slot_start = body.slotStart or "2026-11-06T10:00:00Z"
    tx_id = body.txIdOverride or body.txId

    return booking_service.confirm_booking(
        service_id=service_id,
        slot_start=slot_start,
        tx_id_override=tx_id,
        buyer=body.buyer or "You",
        service_data=body.service,
    )


@router.post("/{booking_id}/confirm", response_model=ReceiptSchema)
def confirm_booking_by_id(booking_id: str, body: BookingConfirmInput) -> dict:
    """Confirm booking using booking ID in route path."""
    return confirm_booking_direct(body)


@router.get("", response_model=list[BookingSchema])
def list_bookings(
    role: str = Query("buyer", description="buyer or provider"),
    wallet: Optional[str] = Query(None),
) -> list[dict]:
    """Retrieve bookings list filtered by buyer or provider role."""
    return booking_service.list_bookings(role=role, wallet=wallet)

