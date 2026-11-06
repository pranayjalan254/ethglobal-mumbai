"""
Service Store - In-memory service catalog for SlotPay.

No seed data. Services are created by real providers via the API
and discovered from live Arkiv on-chain entities.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import secrets
from typing import Any, Optional

from schemas.api import ServiceInput


def generate_hex(length: int = 64) -> str:
    """Generate random hex hash string prefixed with 0x."""
    return "0x" + secrets.token_hex(length // 2)


def at_offset(days: int, hour: int, minute: int = 0) -> str:
    """Return ISO date string relative to current time."""
    target = datetime.now() + timedelta(days=days)
    target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return target.isoformat() + "Z"


class ServiceStore:
    """Manages the catalog of provider-created services in SlotPay."""

    def __init__(self) -> None:
        self._services: dict[str, dict[str, Any]] = {}

    def list_services(
        self,
        q: Optional[str] = None,
        category: Optional[str] = None,
        skill: Optional[str] = None,
        provider_type: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        date: Optional[str] = None,
        duration: Optional[int] = None,
        sort: Optional[str] = None,
        owner: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Filter services matching query constraints."""
        results: list[dict[str, Any]] = []

        q_lower = q.lower().strip() if q else None
        skill_lower = skill.lower().strip() if skill else None
        owner_lower = owner.lower().strip() if owner else None

        for s in self._services.values():
            if owner_lower:
                if s["provider"]["wallet"].lower() != owner_lower:
                    continue

            if q_lower:
                combined = f"{s['title']} {s['description']} {' '.join(s['skills'])} {s['provider']['name']}".lower()
                if q_lower not in combined:
                    continue

            if category and s["category"].lower() != category.lower():
                continue

            if skill_lower:
                if not any(skill_lower in sk.lower() for sk in s["skills"]):
                    continue

            if provider_type and provider_type != "any":
                if s["provider"]["type"] != provider_type:
                    continue

            if min_price is not None and s["price"] < min_price:
                continue
            if max_price is not None and s["price"] > max_price:
                continue

            if duration and duration > 0 and s["durationMin"] != duration:
                continue

            if date:
                slot_date = s["nextSlot"][:10]
                if slot_date > date:
                    continue

            results.append(s)

        if sort == "price":
            results.sort(key=lambda x: x["price"])
        elif sort == "earliest":
            results.sort(key=lambda x: x["nextSlot"])
        elif sort == "rating":
            results.sort(key=lambda x: -x["provider"].get("rating", 0))

        return results

    def get_service(self, service_id: str) -> Optional[dict[str, Any]]:
        """Retrieve a single service by ID."""
        return self._services.get(service_id)

    def get_service_by_entity_key(self, entity_key: str) -> Optional[dict[str, Any]]:
        """Retrieve a service by its Arkiv entity key."""
        if not entity_key:
            return None
        for s in self._services.values():
            if s.get("entityKey") == entity_key:
                return s
        return None

    def list_my_services(self, owner_wallet: str) -> list[dict[str, Any]]:
        """Retrieve services owned by a specific provider wallet."""
        w_lower = (owner_wallet or "").lower().strip()
        return [
            s for s in self._services.values()
            if s["provider"]["wallet"].lower() == w_lower
        ]

    def create_service(self, owner: str, data: ServiceInput) -> dict[str, Any]:
        """Create a new service listing (initially draft)."""
        new_id = f"m_{secrets.token_hex(4)}"
        provider_data = {
            "id": f"p_{secrets.token_hex(3)}",
            "name": "You",
            "type": data.providerType,
            "headline": f"{data.category} Specialist",
            "bio": data.description or "Provider on SlotPay",
            "wallet": owner or "0x0000000000000000000000000000000000000000",
            "rating": 5.0,
            "reviews": 0,
            "credentials": [],
            "documents": [],
        }

        service_dict = {
            "id": new_id,
            "title": data.title,
            "category": data.category,
            "skills": data.skills,
            "description": data.description,
            "price": data.price,
            "currency": data.currency,
            "durationMin": data.durationMin,
            "provider": provider_data,
            "status": "draft",
            "entityKey": None,
            "expiresAt": None,
            "nextSlot": at_offset(1, 10),
            "location": "remote",
        }

        self._services[new_id] = service_dict
        return service_dict

    def update_service(self, owner: str, service_id: str, data: ServiceInput) -> Optional[dict[str, Any]]:
        """Update an existing service listing."""
        svc = self._services.get(service_id)
        if not svc:
            return None

        svc["title"] = data.title
        svc["category"] = data.category
        svc["skills"] = data.skills
        svc["description"] = data.description
        svc["price"] = data.price
        svc["currency"] = data.currency
        svc["durationMin"] = data.durationMin
        svc["provider"]["type"] = data.providerType
        return svc

    def publish_service(
        self,
        service_id: str,
        days: int = 30,
        entity_key: Optional[str] = None,
        tx_ref: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Publish service to Arkiv with time-scoping expiresAt."""
        svc = self._services.get(service_id)
        if not svc:
            return None

        entity_key = entity_key or svc.get("entityKey") or generate_hex(64)
        tx_ref = tx_ref or generate_hex(64)
        expires_at = at_offset(days, 0)

        svc["status"] = "published"
        svc["entityKey"] = entity_key
        svc["txRef"] = tx_ref
        svc["expiresAt"] = expires_at

        return {
            "entity_key": entity_key,
            "tx_ref": tx_ref,
            "expires_at": expires_at,
        }

    def renew_service(self, service_id: str, days: int = 30) -> Optional[dict[str, Any]]:
        """Renew Arkiv listing duration."""
        svc = self._services.get(service_id)
        if not svc:
            return None

        expires_at = at_offset(days, 0)
        svc["status"] = "published"
        svc["expiresAt"] = expires_at
        if not svc.get("entityKey"):
            svc["entityKey"] = generate_hex(64)

        return {"expires_at": expires_at}

    def unpublish_service(self, service_id: str) -> bool:
        """Unpublish service from Arkiv (sets status to draft)."""
        svc = self._services.get(service_id)
        if not svc:
            return False

        svc["status"] = "draft"
        svc["expiresAt"] = None
        return True


# Singleton instance
service_store = ServiceStore()
