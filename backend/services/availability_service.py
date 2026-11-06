"""
Availability Service - Slot publication, dynamic slot generation, and claim reservations.
Implements Option B ("Vanish & Burn"):
Slots exist on Arkiv only when open; booking/paying burns the slot entity.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import secrets
import time
from typing import Any, Optional

from services.service_store import at_offset, generate_hex


class AvailabilityService:
    """Manages provider schedules, slot generation, and claim holds."""

    def __init__(self) -> None:
        self._provider_cells: dict[str, list[str]] = {}
        self._claims: dict[str, dict[str, Any]] = {}
        self._burned_slots: set[str] = set()

    def get_provider_availability(self, owner: Optional[str] = None) -> list[dict[str, Any]]:
        """Return slot availability blocks for the provider."""
        now = int(time.time())
        return [
            {
                "id": "sl1",
                "start": at_offset(1, 10),
                "durationMin": 60,
                "status": "open",
            },
            {
                "id": "sl2",
                "start": at_offset(1, 11),
                "durationMin": 60,
                "status": "claimed",
                "claimExpiresAt": (datetime.now() + timedelta(minutes=4, seconds=32)).isoformat() + "Z",
            },
            {
                "id": "sl3",
                "start": at_offset(1, 14),
                "durationMin": 60,
                "status": "booked",
            },
            {
                "id": "sl4",
                "start": at_offset(2, 9),
                "durationMin": 60,
                "status": "open",
            },
            {
                "id": "sl5",
                "start": at_offset(2, 10),
                "durationMin": 60,
                "status": "open",
            },
            {
                "id": "sl6",
                "start": at_offset(3, 15),
                "durationMin": 60,
                "status": "booked",
            },
        ]

    def publish_availability(self, cells: list[str], owner: Optional[str] = None) -> dict[str, Any]:
        """Save weekly schedule hours and unblock slots on Arkiv."""
        key = (owner or "default").lower()
        self._provider_cells[key] = cells
        entity_key = generate_hex(64)
        return {
            "entity_key": entity_key,
            "count": len(cells),
        }

    def get_service_slots(self, service_id: str, date: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Generate available time slots for a specific service.
        Under Option B, if a slot has been burned, it is no longer listed.
        """
        slots: list[dict[str, Any]] = []
        hours = [9, 10, 11, 13, 14, 15, 16, 17]

        for d in range(1, 4):
            for h in hours:
                slot_id = f"{service_id}-{d}-{h}"
                if slot_id in self._burned_slots:
                    continue

                r = (d * 31 + h * 7 + len(service_id)) % 5
                status = "booked" if r == 0 else "claimed" if r == 1 else "open"

                claim_expires = None
                if slot_id in self._claims:
                    claim = self._claims[slot_id]
                    if claim["expires_at_epoch"] > time.time():
                        status = "claimed"
                        claim_expires = claim["expires_at_iso"]
                    else:
                        del self._claims[slot_id]

                start_iso = at_offset(d, h)
                if date and not start_iso.startswith(date):
                    continue

                slots.append({
                    "id": slot_id,
                    "serviceId": service_id,
                    "start": start_iso,
                    "durationMin": 60,
                    "status": status,
                    "claimExpiresAt": claim_expires,
                })

        return slots

    def claim_slot(self, slot_id: str) -> dict[str, Any]:
        """Reserve an open slot for 5 minutes."""
        now = datetime.now()
        expires = now + timedelta(minutes=5)
        claim_id = "clm_" + secrets.token_hex(5)

        self._claims[slot_id] = {
            "claim_id": claim_id,
            "expires_at_epoch": time.time() + 300,
            "expires_at_iso": expires.isoformat() + "Z",
        }

        return {
            "claim_id": claim_id,
            "expires_at": expires.isoformat() + "Z",
        }

    def burn_slot(self, slot_id: str) -> None:
        """Mark slot as burned (deleted from Arkiv under Option B)."""
        self._burned_slots.add(slot_id)
        if slot_id in self._claims:
            del self._claims[slot_id]


# Singleton instance
availability_service = AvailabilityService()

