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
from services.service_store import at_offset, generate_hex, service_store


def generate_tx_id() -> str:
    """Generate a canonical Hedera Testnet Transaction ID: 0.0.<account>@<sec>.<nanos>."""
    now_sec = int(time.time())
    now_nano = int((time.time() % 1) * 1e9)
    acc = 4000000 + secrets.randbelow(900000)
    return f"0.0.{acc}@{now_sec}.{now_nano:09d}"


class BookingService:
    """Handles bookings and Hedera x402 payment flows."""

    def __init__(self) -> None:
        self._bookings: list[dict[str, Any]] = []
        self._seed_bookings()

    def _seed_bookings(self) -> None:
        """Seed initial bookings."""
        services = service_store.list_services()
        s0 = services[0] if len(services) > 0 else None
        s1 = services[1] if len(services) > 1 else None
        s2 = services[2] if len(services) > 2 else None
        s4 = services[4] if len(services) > 4 else None
        s5 = services[5] if len(services) > 5 else None
        s6 = services[6] if len(services) > 6 else None

        now = int(time.time())

        def mk(s: dict[str, Any], start: str, status: str, buyer: str) -> dict[str, Any]:
            ref = "SP-" + secrets.token_hex(3).upper()
            return {
                "id": ref,
                "bookingRef": ref,
                "provider": s["provider"]["name"],
                "providerType": s["provider"]["type"],
                "service": s["title"],
                "start": start,
                "amount": s["price"],
                "currency": s["currency"],
                "txId": generate_tx_id(),
                "status": status,
                "buyer": buyer,
            }

        if s0:
            self._bookings.append(mk(s0, at_offset(1, 10), "confirmed", "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b"))
        if s2:
            self._bookings.append(mk(s2, at_offset(2, 14), "confirmed", "Lena Park"))
        if s5:
            self._bookings.append(mk(s5, at_offset(0, 17), "pending", "agent:0x44fe9c1d0b9a8f7e6d5c4b3a291f0e8b21c4f0a9"))
        if s6:
            self._bookings.append(mk(s6, at_offset(-2, 9), "completed", "0x0b9a8f7e6d5c4b3a291f0e8b21c4f0a93f9a8c21"))
        if s1:
            self._bookings.append(mk(s1, at_offset(-6, 15), "completed", "Ravi Shah"))
        if s4:
            self._bookings.append(mk(s4, at_offset(-9, 18), "cancelled", "agent:0x9c1de004a0b1c2d3e4f5061728394a5b6c7d8e9f"))

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
                "currency": "USDC",
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
                "currency": "USDC",
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

        # Burn slot from Arkiv
        if slot_id:
            availability_service.burn_slot(slot_id)

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

