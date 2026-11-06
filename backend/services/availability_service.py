"""
Availability Service - Slot publication, dynamic slot generation, and claim reservations.
Implements Arkiv Reservation Architecture:
- Providers own and publish AvailabilitySlot entities.
- OASIS platform wallet owns and publishes SlotReservation entities.
- OASIS never modifies or deletes provider-owned entities.
- Marketplaces determine availability by combining provider-owned records
  with active OASIS reservation records.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import time
from typing import Any, Optional

from agent.arkiv_client import arkiv_client
from services.service_store import at_offset, generate_hex


class AvailabilityService:
    """Manages provider schedules, slot generation, and Arkiv-based claim reservations."""

    def __init__(self) -> None:
        self._provider_cells: dict[str, list[str]] = {}
        self._published_meta: dict[str, dict[str, Any]] = {}

    def get_provider_availability(self, owner: Optional[str] = None) -> list[dict[str, Any]]:
        """Return slot availability blocks for the provider combined with active Arkiv reservations."""
        key = (owner or "default").lower()
        published_cells = self._provider_cells.get(key)

        slots: list[dict[str, Any]] = []
        active_reservations = {r["slotId"]: r for r in arkiv_client.query_reservations()}

        if published_cells:
            for cell in sorted(published_cells):
                try:
                    d_str, h_str = cell.split("-", 1)
                    d, h = int(d_str), int(h_str)
                    slot_id = f"slot_{d}_{h}"
                    start_iso = at_offset(d + 1, h)
                    res = active_reservations.get(slot_id) or active_reservations.get(f"srv_1-{d + 1}-{h}")

                    status = "open"
                    claim_expires = None
                    tx_id = None
                    booking_ref = None
                    res_id = None

                    if res:
                        res_id = res.get("reservationId")
                        if res.get("status") == "confirmed":
                            status = "booked"
                            tx_id = res.get("paymentTransactionId")
                            booking_ref = res_id
                        elif res.get("status") == "pending":
                            status = "claimed"
                            claim_expires = res.get("expiresAt")

                    if status == "open":
                        try:
                            start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
                            if start_dt.timestamp() <= time.time():
                                status = "expired"
                        except Exception:
                            pass

                    slots.append({
                        "id": slot_id,
                        "cellKey": cell,
                        "start": start_iso,
                        "durationMin": 60,
                        "status": status,
                        "claimExpiresAt": claim_expires,
                        "txId": tx_id,
                        "bookingRef": booking_ref,
                        "reservationId": res_id,
                    })
                except Exception:
                    continue
        else:
            base_slots = [
                {"id": "sl1", "cellKey": "0-10", "start": at_offset(1, 10), "durationMin": 60, "status": "open"},
                {"id": "sl2", "cellKey": "0-11", "start": at_offset(1, 11), "durationMin": 60, "status": "claimed", "claimExpiresAt": (datetime.now() + timedelta(minutes=4, seconds=32)).isoformat() + "Z"},
                {"id": "sl3", "cellKey": "1-14", "start": at_offset(1, 14), "durationMin": 60, "status": "booked", "txId": "0.0.9185802@1793955000.123", "bookingRef": "SP-BK8492"},
                {"id": "sl4", "cellKey": "2-9", "start": at_offset(2, 9), "durationMin": 60, "status": "open"},
                {"id": "sl5", "cellKey": "2-10", "start": at_offset(2, 10), "durationMin": 60, "status": "open"},
                {"id": "sl6", "cellKey": "3-15", "start": at_offset(3, 15), "durationMin": 60, "status": "booked", "txId": "0.0.9185802@1793955040.456", "bookingRef": "SP-BK9012"},
            ]
            for slot in base_slots:
                res = active_reservations.get(slot["id"])
                if res:
                    if res.get("status") == "confirmed":
                        slot["status"] = "booked"
                        slot["txId"] = res.get("paymentTransactionId")
                        slot["bookingRef"] = res.get("reservationId")
                    elif res.get("status") == "pending":
                        slot["status"] = "claimed"
                        slot["claimExpiresAt"] = res.get("expiresAt")
                        slot["reservationId"] = res.get("reservationId")
                if slot.get("status") == "open":
                    try:
                        start_dt = datetime.fromisoformat(slot["start"].replace("Z", "+00:00"))
                        if start_dt.timestamp() <= time.time():
                            slot["status"] = "expired"
                    except Exception:
                        pass
            slots = base_slots

        return slots

    def publish_availability(
        self,
        cells: list[str],
        owner: Optional[str] = None,
        entity_key: Optional[str] = None,
        tx_ref: Optional[str] = None,
    ) -> dict[str, Any]:
        """Save weekly schedule hours and publish provider availability on Arkiv."""
        key = (owner or "default").lower()
        self._provider_cells[key] = cells
        assigned_entity_key = entity_key or generate_hex(64)
        now = datetime.now()
        expires = now + timedelta(days=30)
        meta = {
            "entity_key": assigned_entity_key,
            "count": len(cells),
            "cells": cells,
            "published_at": now.isoformat() + "Z",
            "expires_at": expires.isoformat() + "Z",
            "tx_hash": tx_ref or generate_hex(64),
        }
        self._published_meta[key] = meta
        return {
            "entity_key": assigned_entity_key,
            "count": len(cells),
        }

    def get_published_meta(self, owner: Optional[str] = None) -> dict[str, Any]:
        """Retrieve stored metadata for published availability entity on Arkiv."""
        key = (owner or "default").lower()
        cells = self._provider_cells.get(key)
        meta = self._published_meta.get(key, {})
        return {
            "cells": cells or [],
            "is_published": bool(cells),
            "entity_key": meta.get("entity_key"),
            "count": len(cells) if cells else 0,
            "published_at": meta.get("published_at"),
            "expires_at": meta.get("expires_at"),
            "tx_hash": meta.get("tx_hash"),
        }

    def get_service_slots(self, service_id: str, date: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Generate time slots for a service and reconcile with Arkiv reservation entities.
        Excludes or flags slots with unexpired pending claims or confirmed reservations.
        """
        slots: list[dict[str, Any]] = []
        hours = [9, 10, 11, 13, 14, 15, 16, 17]
        active_reservations = {r["slotId"]: r for r in arkiv_client.query_reservations()}

        for d in range(1, 4):
            for h in hours:
                slot_id = f"{service_id}-{d}-{h}"
                res = active_reservations.get(slot_id)

                status = "open"
                claim_expires = None

                if res:
                    if res.get("status") == "confirmed":
                        status = "booked"
                    elif res.get("status") == "pending":
                        status = "claimed"
                        claim_expires = res.get("expiresAt")
                else:
                    # Deterministic baseline slot status for demo realism
                    r = (d * 31 + h * 7 + len(service_id)) % 5
                    if r == 0:
                        status = "booked"
                    elif r == 1:
                        status = "claimed"
                        claim_expires = (datetime.now() + timedelta(minutes=4, seconds=32)).isoformat() + "Z"

                start_iso = at_offset(d, h)
                if date and not start_iso.startswith(date):
                    continue

                if status == "open":
                    try:
                        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
                        if start_dt.timestamp() <= time.time():
                            status = "expired"
                    except Exception:
                        pass

                slots.append({
                    "id": slot_id,
                    "serviceId": service_id,
                    "start": start_iso,
                    "durationMin": 60,
                    "status": status,
                    "claimExpiresAt": claim_expires,
                })

        return slots

    def get_available_service_slots(self, service_id: str, date: Optional[str] = None) -> list[dict[str, Any]]:
        """Return only genuinely available slots (no active pending claim and no confirmed booking)."""
        all_slots = self.get_service_slots(service_id, date)
        active_reservations = arkiv_client.query_reservations()
        return [s for s in all_slots if s["status"] == "open" and arkiv_client.is_slot_available(s["id"], active_reservations)]

    def claim_slot(
        self,
        slot_id: str,
        customer_wallet: str = "0x71C2a0b3C4E5f61A2b3f4E5d6C7b8A9F0e1D2c3B",
        availability_entity_key: str = "",
        provider_id: str = "",
    ) -> dict[str, Any]:
        """
        Create a SlotPay-owned PendingSlotClaim on Arkiv.
        Holds slot for 5 minutes.
        """
        record = arkiv_client.create_pending_claim(
            slot_id=slot_id,
            availability_entity_key=availability_entity_key,
            provider_id=provider_id,
            customer_wallet=customer_wallet,
            duration_sec=300,
        )
        return {
            "claim_id": record["reservationId"],
            "expires_at": record["expiresAt"],
            "reseOASIS": record,
        }

    def confirm_slot_reservation(
        self,
        slot_id: str,
        tx_id: str,
        customer_wallet: str = "0x71C2a0b3C4E5f61A2b3f4E5d6C7b8A9F0e1D2c3B",
        service_id: str = "",
        provider_id: str = "",
    ) -> dict[str, Any]:
        """
        Create a SlotPay-owned ConfirmedReservation on Arkiv upon successful payment.
        Does NOT modify or delete provider-owned entities.
        """
        return arkiv_client.create_confirmed_reservation(
            slot_id=slot_id,
            payment_tx_id=tx_id,
            availability_entity_key=service_id,
            provider_id=provider_id,
            customer_wallet=customer_wallet,
        )

    def burn_slot(self, slot_id: str) -> None:
        """
        DeprecateOASISn B burn method.
        Under the reservation architecture, provider entities are never deleted.
        """
        pass


# Singleton instance
availability_service = AvailabilityService()

