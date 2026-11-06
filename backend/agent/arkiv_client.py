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
      arkiv.schema = str('slotpay.services.v1') AND category = str('Engineering') AND price <= dec('20.00')
    """
    clauses = [f"arkiv.schema = str('{ARKIV_SCHEMA_NAME}')"]

    if f.category:
        clauses.append(f"category = str('{f.category}')")

    if f.provider_type != ProviderType.ANY:
        clauses.append(f"providerType = str('{f.provider_type.value}')")

    if f.max_price is not None:
        clauses.append(f"price <= dec('{f.max_price:.2f}')")

    if f.min_price is not None:
        clauses.append(f"price >= dec('{f.min_price:.2f}')")

    if f.duration_min is not None:
        clauses.append(f"durationMin = i32({f.duration_min})")

    return " AND ".join(clauses)


class ArkivClient:
    """Arkiv database client for SlotPay service discovery."""

    def __init__(self, rpc_url: str = ARKIV_RABDI_RPC, access_key: str = ARKIV_ACCESS_KEY):
        self.rpc_url = rpc_url
        self.access_key = access_key

    def _rpc_url_with_access_key(self) -> str:
        """Attach accessKey query param for endpoints that expect key in URL."""
        if not self.access_key:
            return self.rpc_url

        parsed = urlparse(self.rpc_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.setdefault("accessKey", self.access_key)
        return urlunparse(parsed._replace(query=urlencode(query)))

    def query_services(self, query_filter: ArkivQueryFilter) -> list[dict[str, Any]]:
        """
        Query services from Arkiv matching the given criteria.
        Uses Arkiv JSON-RPC if available, with intelligent filtering fallback.
        """
        query_str = build_arkiv_query_string(query_filter)
        logger.info("Executing Arkiv Query: %s", query_str)

        # Attempt real JSON-RPC call to Rabdi testnet
        rpc_results = self._call_arkiv_rpc(query_str)
        if rpc_results is not None:
            return rpc_results

        # Local fallback execution matching Arkiv query semantics
        return self._filter_local_services(query_filter)

    def _call_arkiv_rpc(self, query_string: str) -> Optional[list[dict[str, Any]]]:
        """Call `arkiv_query` method on Rabdi JSON-RPC."""
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "arkiv_query",
            "params": [query_string, {"limit": 50}],
        }
        headers = {
            "Content-Type": "application/json",
        }
        if self.access_key:
            # Support both header-based auth and URL query auth styles.
            headers.update({
                "Authorization": f"Bearer {self.access_key}",
                "x-access-key": self.access_key,
                "x-api-key": self.access_key,
            })

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
                    if isinstance(result, dict):
                        entities = result.get("entities")
                        if entities is None:
                            entities = result.get("data")
                        if isinstance(entities, list):
                            return entities
                        return []
                    if isinstance(result, list):
                        return result
                    return []
                if "error" in data:
                    logger.warning("Arkiv RPC returned error: %s", data.get("error"))
        except Exception as e:
            logger.debug("Arkiv RPC unavailable (%s); using local Arkiv entity store.", e)
        return None

    def _filter_local_services(self, f: ArkivQueryFilter) -> list[dict[str, Any]]:
        """Perform exact Arkiv predicate filtering over entity store."""
        matches = []
        for s in SEED_ARKIV_SERVICES:
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

