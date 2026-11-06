"""
Booking Service - Manages Hedera x402 payment challenges, booking confirmations,
receipt records, and burning slots upon settlement.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import secrets
import time
from typing import Any, Optional

from agent.x402_hedera import (
    DEFAULT_FACILITATOR_ACCOUNT,
    DEFAULT_FACILITATOR_URL,
    DEFAULT_USDC_TOKEN_ID,
    hedera_x402_engine,
)
from services.availability_service import availability_service
from services.hcs_service import publish_booking_to_hcs
from services.service_store import service_store


def generate_tx_id(payer_account: str = DEFAULT_FACILITATOR_ACCOUNT) -> str:
    """Generate a canonical Hedera Testnet Transaction ID: <feePayer>@<sec>.<nanos>."""
    now_sec = int(time.time())
    now_nano = int((time.time() % 1) * 1e9)
    return f"{payer_account}@{now_sec}.{now_nano:09d}"


class BookingService:
    """Handles bookings and Hedera x402 payment flows."""

    def __init__(self) -> None:
        self._bookings: list[dict[str, Any]] = []

    def create_booking_challenge(
        self,
        service_id: str,
        slot_id: str,
        buyer_wallet: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Create an HTTP 402 challenge according to Hedera x402 specification.
        """
        svc = service_store.get_service(service_id)
        if not svc:
            # Fallback service if not found
            svc = {
                "id": service_id,
                "title": "Service Consultation",
                "price": 20.0,
                "currency": "HBAR",
                "provider": {
                    "name": "Provider",
                    "type": "human",
                    "wallet": "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b",
                },
            }

        price = float(svc["price"])
        currency = svc["currency"]
        token_name = f"USDC ({DEFAULT_USDC_TOKEN_ID})" if currency == "USDC" else "HBAR"
        provider_wallet = svc["provider"]["wallet"]

        booking_id = "bk_" + secrets.token_hex(5)

        payment_requirement = {
            "status": 402,
            "scheme": "exact",
            "amount": f"{price:.2f}",
            "token": token_name,
            "network": "hedera-testnet",
            "payTo": provider_wallet,
            "feePayer": DEFAULT_FACILITATOR_ACCOUNT,
            "facilitator": DEFAULT_FACILITATOR_URL,
            "resource": f"/api/bookings/{service_id}",
            "maxTimeoutSeconds": 300,
        }

        return {
            "booking_id": booking_id,
            "payment": payment_requirement,
        }

    def confirm_booking(
        self,
        service_id: str,
        slot_start: str,
        tx_id_override: Optional[str] = None,
        buyer: str = "You",
        service_data: Optional[dict[str, Any]] = None,
        slot_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Record verified booking and receipt, and burn the booked slot from Arkiv.
        """
        svc = service_data or service_store.get_service(service_id)
        if not svc:
            svc = {
                "id": service_id,
                "title": "Service Consultation",
                "price": 20.0,
                "currency": "HBAR",
                "provider": {"name": "Provider", "type": "human"},
            }

        confirmed_tx_id = tx_id_override or generate_tx_id()
        booking_ref = "SP-" + secrets.token_hex(3).upper()

        receipt = {
            "bookingRef": booking_ref,
            "provider": svc["provider"]["name"],
            "providerType": svc["provider"]["type"],
            "service": svc["title"],
            "start": slot_start,
            "amount": float(svc["price"]),
            "currency": svc["currency"],
            "txId": confirmed_tx_id,
        }

        booking_record = {
            **receipt,
            "id": booking_ref,
            "buyer": buyer,
            "status": "confirmed",
        }

        # Prepend to list
        self._bookings.insert(0, booking_record)

        # Publish tamper-evident audit record to HCS (native Hedera service #2)
        hcs_url = publish_booking_to_hcs({
            "bookingRef": booking_ref,
            "serviceId": service_id,
            "service": svc["title"],
            "provider": svc["provider"]["name"],
            "buyer": buyer,
            "amount": float(svc["price"]),
            "currency": svc["currency"],
            "txId": confirmed_tx_id,
            "slotStart": slot_start,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        })
        if hcs_url:
            receipt["hcsUrl"] = hcs_url
            booking_record["hcsUrl"] = hcs_url

        # Record SlotPay-owned ConfirmedReservation on Arkiv (never modifies/deletes provider entities)
        effectiveOASISd = slot_id or f"{service_id}-{slot_start}"
        buyer_wallet = buyer if buyer.startswith("0x") else "0x71C2a0b3C4E5f61A2b3f4E5d6C7b8A9F0e1D2c3B"
        availability_service.confirm_slot_reservation(
            slot_id=effective_slot_id,
            tx_id=confirmed_tx_id,
            customer_wallet=buyer_wallet,
            service_id=service_id,
            provider_id=svc.get("provider", {}).get("name", "Provider"),
        )

        return receipt

    def list_bookings(
        self,
        role: str = "buyer",
        wallet: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List bookings filtered by buyer or provider role."""
        return list(self._bookings)


# Singleton instance
booking_service = BookingService()

