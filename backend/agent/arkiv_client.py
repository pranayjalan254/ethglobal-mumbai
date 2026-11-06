"""
Arkiv Web3 Database Client for SlotPay.

Queries the Arkiv Rabdi testnet for real on-chain availability entities.
Schema: 'slotpay.availability.v1'
No local seed data — returns empty list if Rabdi is unreachable.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
import urllib.request
import urllib.error

from config import ARKIV_ACCESS_KEY, ARKIV_RABDI_RPC
from schemas.arkiv import ArkivQueryFilter, ProviderType

logger = logging.getLogger(__name__)

ARKIV_AVAILABILITY_SCHEMA = "slotpay.availability.v1"


class ArkivClient:
    """Arkiv database client for SlotPay service discovery."""

    def __init__(self, rpc_url: str = ARKIV_RABDI_RPC, access_key: str = ARKIV_ACCESS_KEY):
        self.rpc_url = rpc_url
        self.access_key = access_key

    def _rpc_url_with_access_key(self) -> str:
        """Attach accessKey in the URL path segment for Rabdi RPC endpoint."""
        if not self.access_key:
            return self.rpc_url
        base = self.rpc_url.rstrip("/")
        if self.access_key in base:
            return base
        return f"{base}/{self.access_key}"

    def query_services(self, query_filter: ArkivQueryFilter) -> list[dict[str, Any]]:
        """
        Query live availability entities from Arkiv Rabdi testnet.
        Filters results in Python since availability entities don't carry category/skills attrs.
        Returns [] if RPC is unreachable.
        """
        # Query open availability slots from real on-chain data
        query_str = f"arkiv.schema = str('{ARKIV_AVAILABILITY_SCHEMA}') AND status = str('open')"
        logger.info("Executing Arkiv availability query: %s", query_str)

        raw = self._call_arkiv_rpc(query_str)
        if raw is None:
            logger.warning("Arkiv RPC unreachable. Returning empty results.")
            return []
        if not raw:
            logger.info("Arkiv returned 0 open availability entities.")
            return []

        logger.info("Arkiv RPC returned %d availability entities.", len(raw))

        # Parse and filter
        results = []
        for entity in raw:
            svc = self._parse_availability_entity(entity)
            if svc and self._matches_filter(svc, query_filter):
                results.append(svc)

        return results

    def _parse_availability_entity(self, entity: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Convert a slotpay.availability.v1 entity into a normalised service record."""
        attrs: dict[str, Any] = {}
        for item in entity.get("attributes", []):
            if isinstance(item, dict) and "name" in item:
                attrs[item["name"]] = item.get("value")

        provider_name = attrs.get("providerName") or "Provider"
        provider_wallet = attrs.get("providerWallet") or entity.get("owner", "0x0")
        provider_type = attrs.get("providerType") or "human"
        next_slot = attrs.get("nextSlot") or attrs.get("slotStart")
        duration = 60
        try:
            duration = int(attrs.get("durationMin", 60))
        except (ValueError, TypeError):
            pass

        price = 0.05
        try:
            price = float(attrs.get("price", 0.05))
        except (ValueError, TypeError):
            pass

        currency = attrs.get("currency") or "HBAR"
        title = attrs.get("title") or f"{provider_name} consultation"

        # Enrich with service_store data if available
        rating = 4.8
        reviews = 0
        skills: list[str] = []
        category = "Engineering"
        description = attrs.get("description") or ""

        entity_key = entity.get("key", "")
        try:
            from services.service_store import service_store
            matched = service_store.get_service_by_entity_key(entity_key)
            if matched:
                skills = matched.get("skills", [])
                category = matched.get("category", category)
                description = matched.get("description", description) or description
                p = matched.get("provider", {})
                rating = float(p.get("rating", rating))
                reviews = int(p.get("reviews", reviews))
        except Exception as e:
            logger.debug("service_store lookup failed: %s", e)

        return {
            "id": entity_key or "svc_arkiv",
            "entity_key": entity_key,
            "title": title,
            "category": category,
            "skills": skills,
            "provider_type": provider_type,
            "provider_name": provider_name,
            "provider_wallet": provider_wallet,
            "provider": {
                "id": f"p_{provider_wallet[:8]}",
                "name": provider_name,
                "type": provider_type,
                "wallet": provider_wallet,
                "rating": rating,
                "reviews": reviews,
            },
            "price": price,
            "currency": currency,
            "duration_min": duration,
            "durationMin": duration,
            "description": description,
            "rating": rating,
            "reviews": reviews,
            "next_slot": next_slot,
            "nextSlot": next_slot,
            "expires_at": entity.get("expiresAt"),
        }

    def _matches_filter(self, svc: dict[str, Any], f: ArkivQueryFilter) -> bool:
        """Filter a parsed service record against an ArkivQueryFilter."""
        if f.max_price is not None and svc["price"] > f.max_price:
            return False
        if f.min_price is not None and svc["price"] < f.min_price:
            return False
        if f.provider_type != ProviderType.ANY:
            if svc["provider_type"] != f.provider_type.value:
                return False
        if f.provider_name:
            if f.provider_name.lower() not in svc["provider_name"].lower():
                return False
        if f.duration_min is not None:
            if abs(svc["duration_min"] - f.duration_min) > 30:
                return False
        return True

    def _call_arkiv_rpc(self, query_string: str) -> Optional[list[dict[str, Any]]]:
        """Call `arkiv_query` method on Rabdi JSON-RPC."""
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "arkiv_query",
            "params": [
                query_string,
                {
                    "select": {
                        "key": True,
                        "owner": True,
                        "expiresAt": True,
                        "attributes": True,
                    },
                    "limit": "0x32",
                },
            ],
        }
        try:
            req = urllib.request.Request(
                self._rpc_url_with_access_key(),
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "result" in data:
                    result = data["result"]
                    raw_entities: list[dict[str, Any]] = []
                    if isinstance(result, dict):
                        raw_entities = result.get("data") or result.get("entities") or []
                    elif isinstance(result, list):
                        raw_entities = result
                    return raw_entities
                if "error" in data:
                    logger.warning("Arkiv RPC error: %s", data.get("error"))
        except Exception as e:
            logger.warning("Arkiv RPC call failed: %s", e)
        return None


# Singleton instance
arkiv_client = ArkivClient()
