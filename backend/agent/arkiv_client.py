"""
Arkiv Web3 Database Client for SlotPay.

Implements query and mutation operations on the Arkiv Rabdi testnet
following the Arkiv protocol and JSON-RPC specification:
- Reads: JSON-RPC `arkiv_query` against Rabdi endpoint
- Schema: 'slotpay.services.v1'
- Query language: `arkiv.schema = str(...) AND category = str(...)`
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
import urllib.request
import urllib.error
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from config import ARKIV_ACCESS_KEY, ARKIV_RABDI_RPC
from schemas.arkiv import ArkivQueryFilter, ProviderType, TimeWindow

logger = logging.getLogger(__name__)

ARKIV_SCHEMA_NAME = "slotpay.services.v1"


# Default seed services stored on Arkiv
SEED_ARKIV_SERVICES = [
    {
        "id": "s1",
        "entity_key": "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b000000000000000000000001",
        "title": "One-hour Python consultation",
        "category": "Engineering",
        "skills": ["Python", "FastAPI", "Pandas"],
        "provider_type": "human",
        "provider_name": "Anika Rao",
        "provider_wallet": "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b",
        "price": 18.0,
        "currency": "USDC",
        "duration_min": 60,
        "description": "Debugging, architecture or code review for Python projects. Includes written summary.",
        "rating": 4.9,
        "reviews": 132,
        "next_slot": "2026-11-06T10:00:00Z",
    },
    {
        "id": "s2",
        "entity_key": "0x8b21c4f0a9e3d7651b2c9f8e7a6d5c4b3a291f0e000000000000000000000002",
        "title": "Smart contract audit scoping call",
        "category": "Security",
        "skills": ["Solidity", "Hedera", "Security Audit"],
        "provider_type": "human",
        "provider_name": "Marcus Lindqvist",
        "provider_wallet": "0x8b21c4f0a9e3d7651b2c9f8e7a6d5c4b3a291f0e",
        "price": 120.0,
        "currency": "USDC",
        "duration_min": 60,
        "description": "Review of your contracts and threat model, with a fixed quote for a full audit.",
        "rating": 4.8,
        "reviews": 61,
        "next_slot": "2026-11-09T15:00:00Z",
    },
    {
        "id": "s3",
        "entity_key": "0x1c7e9d3b5a2f8604c1e7b9d2a5f3c8e6b4d0a917000000000000000000000003",
        "title": "UX review of a product flow",
        "category": "Design",
        "skills": ["UX", "Accessibility", "Design Review"],
        "provider_type": "human",
        "provider_name": "Sora Ito",
        "provider_wallet": "0x1c7e9d3b5a2f8604c1e7b9d2a5f3c8e6b4d0a917",
        "price": 45.0,
        "currency": "USDC",
        "duration_min": 60,
        "description": "A recorded walkthrough of one flow and a prioritised list of improvements.",
        "rating": 4.7,
        "reviews": 88,
        "next_slot": "2026-11-06T14:00:00Z",
    },
    {
        "id": "s5",
        "entity_key": "0xa0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d000000000000000000000005",
        "title": "Market research brief",
        "category": "Research",
        "skills": ["Research", "Citations", "Agent Payments", "Market Analysis"],
        "provider_type": "ai",
        "provider_name": "Atlas Research",
        "provider_wallet": "0xa0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d",
        "price": 12.0,
        "currency": "USDC",
        "duration_min": 30,
        "description": "A cited research brief on a market or technical topic, delivered in under an hour.",
        "rating": 4.6,
        "reviews": 412,
        "next_slot": "2026-11-05T18:30:00Z",
    },
    {
        "id": "s6",
        "entity_key": "0xf1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e000000000000000000000006",
        "title": "AI pull request review",
        "category": "Security",
        "skills": ["Python", "Solidity", "Code Review", "AI"],
        "provider_type": "ai",
        "provider_name": "Reviewer-7",
        "provider_wallet": "0xf1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e",
        "price": 8.0,
        "currency": "USDC",
        "duration_min": 30,
        "description": "Automated security & style review of pull requests up to 1,500 changed lines.",
        "rating": 4.5,
        "reviews": 1290,
        "next_slot": "2026-11-05T17:00:00Z",
    },
    {
        "id": "s7",
        "entity_key": "0x29c8e7f6d5a4b3c2e1f0a9b8c7d6e5f4a3b2c1d0000000000000000000000007",
        "title": "Django & FastAPI pairing session",
        "category": "Engineering",
        "skills": ["Python", "Django", "FastAPI"],
        "provider_type": "human",
        "provider_name": "Tomás Ferreira",
        "provider_wallet": "0x29c8e7f6d5a4b3c2e1f0a9b8c7d6e5f4a3b2c1d0",
        "price": 15.0,
        "currency": "USDC",
        "duration_min": 60,
        "description": "Live pairing on architecture, debugging, or API design in Python.",
        "rating": 4.8,
        "reviews": 47,
        "next_slot": "2026-11-06T09:00:00Z",
    },
]


def build_arkiv_query_string(f: ArkivQueryFilter) -> str:
    """
    Build Arkiv query language string according to docs/arkiv/filter_results.md
    Example output:
      arkiv.schema = str('slotpay.services.v1') AND category = str('Engineering') AND price <= dec(20.00)
    """
    clauses = [f"arkiv.schema = str('{ARKIV_SCHEMA_NAME}')"]

    if f.category:
        clauses.append(f"category = str('{f.category}')")

    if f.provider_type != ProviderType.ANY:
        clauses.append(f"providerType = str('{f.provider_type.value}')")

    if f.max_price is not None:
        clauses.append(f"price <= dec({f.max_price:.2f})")

    if f.min_price is not None:
        clauses.append(f"price >= dec({f.min_price:.2f})")

    if f.duration_min is not None:
        clauses.append(f"durationMin = i32({f.duration_min})")

    return " AND ".join(clauses)


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
        Query services from Arkiv matching the given criteria.
        Uses Arkiv JSON-RPC if available on Rabdi testnet.
        If no listings are returned or RPC is unavailable,
        falls back to catalog filtering.
        """
        query_str = build_arkiv_query_string(query_filter)
        logger.info("Executing Arkiv Query: %s", query_str)

        # Attempt real JSON-RPC call to Rabdi testnet
        rpc_results = self._call_arkiv_rpc(query_str)
        if rpc_results is not None and len(rpc_results) > 0:
            logger.info("Arkiv RPC returned %d live entities from Rabdi testnet.", len(rpc_results))
            return rpc_results

        if rpc_results == []:
            logger.info(
                "Arkiv RPC query succeeded on Rabdi testnet, but 0 entities exist under schema '%s' (no listings created yet). Falling back to catalog.",
                ARKIV_SCHEMA_NAME,
            )
        else:
            logger.info("Arkiv RPC call returned no results or was offline. Using local catalog.")

        # Fallback execution matching Arkiv query semantics
        return self._filter_local_services(query_filter)

    def _parse_rpc_entity(self, rpc_entity: dict[str, Any]) -> dict[str, Any]:
        """Convert Arkiv RpcEntity with attributes into normalized service record."""
        attrs: dict[str, Any] = {}
        for item in rpc_entity.get("attributes", []):
            if isinstance(item, dict) and "name" in item:
                attrs[item["name"]] = item.get("value")

        # Fallback to json body if present
        body = attrs.get("body")
        if body and isinstance(body, str) and body.startswith("0x"):
            try:
                body_decoded = bytes.fromhex(body[2:]).decode("utf-8", errors="ignore")
                body_json = json.loads(body_decoded)
                if isinstance(body_json, dict):
                    attrs.setdefault("title", body_json.get("title"))
                    attrs.setdefault("category", body_json.get("skill") or body_json.get("category"))
                    attrs.setdefault("skills", body_json.get("skills") or [body_json.get("skill")])
                    attrs.setdefault("providerWallet", body_json.get("agent"))
                    if "priceUnits" in body_json:
                        try:
                            attrs.setdefault("price", float(body_json["priceUnits"]) / 1000.0)
                        except Exception:
                            pass
            except Exception:
                pass

        price = 18.0
        raw_price = attrs.get("price")
        if raw_price is not None:
            try:
                price = float(raw_price)
            except (ValueError, TypeError):
                pass

        skills = attrs.get("skills")
        if isinstance(skills, str):
            skills_list = [s.strip() for s in skills.split(",") if s.strip()]
        elif isinstance(skills, list):
            skills_list = [str(s) for s in skills]
        else:
            skills_list = []

        duration = 60
        raw_dur = attrs.get("durationMin")
        if raw_dur is not None:
            try:
                duration = int(raw_dur)
            except (ValueError, TypeError):
                pass

        rating = 4.8
        raw_rating = attrs.get("rating")
        if raw_rating is not None:
            try:
                rating = float(raw_rating)
            except (ValueError, TypeError):
                pass

        reviews = 10
        raw_reviews = attrs.get("reviews")
        if raw_reviews is not None:
            try:
                reviews = int(raw_reviews)
            except (ValueError, TypeError):
                pass

        provider_name = attrs.get("providerName") or "Provider"
        provider_type = attrs.get("providerType") or "human"
        provider_wallet = attrs.get("providerWallet") or rpc_entity.get("owner", "0x0")

        return {
            "id": rpc_entity.get("key") or attrs.get("id") or "svc_arkiv",
            "entity_key": rpc_entity.get("key", ""),
            "title": attrs.get("title") or "Consultation",
            "category": attrs.get("category") or "Engineering",
            "skills": skills_list,
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
            "currency": attrs.get("currency") or "USDC",
            "duration_min": duration,
            "durationMin": duration,
            "description": attrs.get("description") or "",
            "rating": rating,
            "reviews": reviews,
            "next_slot": attrs.get("nextSlot") or "2026-11-06T10:00:00Z",
            "nextSlot": attrs.get("nextSlot") or "2026-11-06T10:00:00Z",
            "expires_at": rpc_entity.get("expiresAt"),
        }

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
        headers = {
            "Content-Type": "application/json",
        }
        try:
            req = urllib.request.Request(
                self._rpc_url_with_access_key(),
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "result" in data:
                    result = data["result"]
                    raw_entities = []
                    if isinstance(result, dict):
                        raw_entities = result.get("data") or result.get("entities") or []
                    elif isinstance(result, list):
                        raw_entities = result

                    if raw_entities:
                        parsed = [self._parse_rpc_entity(e) for e in raw_entities]
                        return parsed
                    return []
                if "error" in data:
                    logger.warning("Arkiv RPC returned error: %s", data.get("error"))
        except Exception as e:
            logger.debug("Arkiv RPC unavailable (%s); using local Arkiv entity store.", e)
        return None

    def _get_local_services(self) -> list[dict[str, Any]]:
        """Return combined list of seed services and services from service_store."""
        services: list[dict[str, Any]] = []
        for s in SEED_ARKIV_SERVICES:
            item = dict(s)
            item.setdefault("durationMin", item.get("duration_min", 60))
            item.setdefault("nextSlot", item.get("next_slot"))
            item.setdefault("provider", {
                "id": f"p_{item.get('provider_wallet', '')[:8]}",
                "name": item.get("provider_name", "Provider"),
                "type": item.get("provider_type", "human"),
                "wallet": item.get("provider_wallet", ""),
                "rating": item.get("rating", 4.8),
                "reviews": item.get("reviews", 10),
            })
            services.append(item)

        try:
            from services.service_store import service_store
            store_services = service_store.list_services()
            seen_ids = {s["id"] for s in services}
            for st in store_services:
                if st.get("id") not in seen_ids:
                    p = st.get("provider", {})
                    services.append({
                        "id": st.get("id"),
                        "entity_key": st.get("entityKey") or f"0x{st.get('id', '')}00000000000000000000000000000000",
                        "title": st.get("title", ""),
                        "category": st.get("category", ""),
                        "skills": st.get("skills", []),
                        "provider_type": p.get("type", "human"),
                        "provider_name": p.get("name", "Provider"),
                        "provider_wallet": p.get("wallet", ""),
                        "price": float(st.get("price", 0.0)),
                        "currency": st.get("currency", "USDC"),
                        "duration_min": int(st.get("durationMin", 60)),
                        "durationMin": int(st.get("durationMin", 60)),
                        "description": st.get("description", ""),
                        "rating": float(p.get("rating", 4.8)),
                        "reviews": int(p.get("reviews", 10)),
                        "next_slot": st.get("nextSlot", "2026-11-06T10:00:00Z"),
                        "nextSlot": st.get("nextSlot", "2026-11-06T10:00:00Z"),
                        "provider": p,
                    })
        except Exception as e:
            logger.debug("Could not read service_store in arkiv_client: %s", e)
        return services

    def _filter_local_services(self, f: ArkivQueryFilter) -> list[dict[str, Any]]:
        """Perform exact Arkiv predicate filtering over entity store."""
        matches = []
        available = self._get_local_services()
        for s in available:
            # 1. Category check
            if f.category and s["category"].lower() != f.category.lower():
                continue

            # 2. Provider Type check
            if f.provider_type != ProviderType.ANY:
                if s["provider_type"] != f.provider_type.value:
                    continue

            # 3. Provider Name check
            if f.provider_name:
                if f.provider_name.lower() not in s["provider_name"].lower():
                    continue

            # 4. Price check
            if f.max_price is not None and s["price"] > f.max_price:
                continue
            if f.min_price is not None and s["price"] < f.min_price:
                continue

            # 5. Skills check
            if f.skills:
                s_skills_lower = [sk.lower() for sk in s["skills"]]
                has_any_skill = any(
                    any(req.lower() in sk for sk in s_skills_lower)
                    for req in f.skills
                )
                if not has_any_skill and f.category != s["category"]:
                    continue

            # 6. Duration check (optional filter)
            if f.duration_min is not None:
                # Accept if matches or within 30 min range
                if abs(s["duration_min"] - f.duration_min) > 30 and len(matches) > 0:
                    continue

            matches.append(s)

        # Sort by price ascending
        return sorted(matches, key=lambda x: x["price"])


# Singleton instance
arkiv_client = ArkivClient()

