"""
Service Store - In-memory and Arkiv-backed service catalog for SlotPay.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import secrets
from typing import Any, Optional

from schemas.api import ProviderSchema, ServiceInput, ServiceSchema, SwarmDoc


def generate_hex(length: int = 64) -> str:
    """Generate random hex hash string prefixed with 0x."""
    return "0x" + secrets.token_hex(length // 2)


def at_offset(days: int, hour: int, minute: int = 0) -> str:
    """Return ISO date string relative to current time."""
    target = datetime.now() + timedelta(days=days)
    target = target.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return target.isoformat() + "Z"


class ServiceStore:
    """Manages the catalog of human and AI services in SlotPay."""

    def __init__(self) -> None:
        self._services: dict[str, dict[str, Any]] = {}
        self._my_services_by_owner: dict[str, list[str]] = {}
        self._seed_services()

    def _seed_services(self) -> None:
        """Seed initial realistic providers and services."""
        providers = {
            "anika": {
                "id": "p1",
                "name": "Anika Rao",
                "type": "human",
                "headline": "Senior Python engineer, data tooling",
                "bio": "Nine years building data pipelines and internal tools in Python. Former platform lead at a Bengaluru fintech. Short, focused consultations with a written summary afterwards.",
                "wallet": "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b",
                "rating": 4.9,
                "reviews": 132,
                "credentials": ["AWS Certified Data Engineer", "PSF Contributing Member"],
                "documents": [
                    {"name": "portfolio-2026.pdf", "swarmRef": generate_hex(64)},
                    {"name": "references.pdf", "swarmRef": generate_hex(64)},
                ],
            },
            "marcus": {
                "id": "p2",
                "name": "Marcus Lindqvist",
                "type": "human",
                "headline": "Smart contract auditor",
                "bio": "Independent auditor focused on Solidity and Hedera token service integrations. Over forty public audit reports.",
                "wallet": "0x8b21c4f0a9e3d7651b2c9f8e7a6d5c4b3a291f0e",
                "rating": 4.8,
                "reviews": 61,
                "credentials": ["Code4rena top 50 warden", "Certified Blockchain Security Professional"],
                "documents": [{"name": "audit-sample-lending.pdf", "swarmRef": generate_hex(64)}],
            },
            "sora": {
                "id": "p3",
                "name": "Sora Ito",
                "type": "human",
                "headline": "Product designer, UX reviews",
                "bio": "Design reviews for early-stage products. I look at flows, copy and accessibility and deliver a prioritised list of changes.",
                "wallet": "0x1c7e9d3b5a2f8604c1e7b9d2a5f3c8e6b4d0a917",
                "rating": 4.7,
                "reviews": 88,
                "credentials": [],
                "documents": [{"name": "case-studies.pdf", "swarmRef": generate_hex(64)}],
            },
            "priya": {
                "id": "p4",
                "name": "Priya Menon",
                "type": "human",
                "headline": "Technology and contracts lawyer",
                "bio": "Advocate, Bombay High Court. Advises startups on terms of service, data protection and token structuring.",
                "wallet": "0x6d4a2b8c0e1f3579a8b6c4d2e0f1a3b5c7d9e8f6",
                "rating": 5.0,
                "reviews": 24,
                "credentials": ["Bar Council of Maharashtra and Goa"],
                "documents": [],
            },
            "atlas": {
                "id": "p5",
                "name": "Atlas Research",
                "type": "ai",
                "headline": "Autonomous research agent",
                "bio": "Produces structured literature and market reviews with cited sources. Runs on demand; output delivered as a Swarm-stored report.",
                "wallet": "0xa0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d",
                "rating": 4.6,
                "reviews": 412,
                "credentials": [],
                "documents": [],
            },
            "reviewer": {
                "id": "p6",
                "name": "Reviewer-7",
                "type": "ai",
                "headline": "AI code-review agent",
                "bio": "Reviews pull requests for correctness, security and style. Supports Python, TypeScript, Rust and Solidity.",
                "wallet": "0xf1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e",
                "rating": 4.5,
                "reviews": 1290,
                "credentials": [],
                "documents": [],
            },
            "tomas": {
                "id": "p7",
                "name": "Tomás Ferreira",
                "type": "human",
                "headline": "Python and Django developer",
                "bio": "Backend developer, mostly Django and FastAPI. Happy to pair on debugging or architecture.",
                "wallet": "0x29c8e7f6d5a4b3c2e1f0a9b8c7d6e5f4a3b2c1d0",
                "rating": 4.8,
                "reviews": 47,
                "credentials": [],
                "documents": [],
            },
            "ledger": {
                "id": "p8",
                "name": "Ledgerline",
                "type": "ai",
                "headline": "Accounting reconciliation agent",
                "bio": "Reconciles on-chain and bank transactions into a clean ledger export. Handles USDC and HBAR.",
                "wallet": "0x5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d",
                "rating": 4.4,
                "reviews": 208,
                "credentials": [],
                "documents": [],
            },
        }

        seed_data = [
            {
                "id": "s1",
                "title": "One-hour Python consultation",
                "category": "Engineering",
                "skills": ["Python", "Pandas", "FastAPI"],
                "description": "Debugging, architecture or code review for Python projects. Includes a written summary.",
                "price": 18.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": providers["anika"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(1, 10),
                "location": "remote",
            },
            {
                "id": "s2",
                "title": "Smart contract audit scoping call",
                "category": "Security",
                "skills": ["Solidity", "Hedera", "Security Audit"],
                "description": "Review of your contracts and threat model, with a fixed quote for a full audit.",
                "price": 120.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": providers["marcus"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(2, 15),
                "location": "remote",
            },
            {
                "id": "s3",
                "title": "UX review of a product flow",
                "category": "Design",
                "skills": ["UX", "Accessibility", "Design Review"],
                "description": "A recorded walkthrough of one flow and a prioritised list of improvements.",
                "price": 45.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": providers["sora"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(1, 14),
                "location": "remote",
            },
            {
                "id": "s4",
                "title": "Terms of service review",
                "category": "Legal",
                "skills": ["Contracts", "Data Protection"],
                "description": "Plain-language review of your terms and privacy policy for Indian and EU users.",
                "price": 95.0,
                "currency": "USDC",
                "durationMin": 90,
                "provider": providers["priya"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(3, 11),
                "location": "remote",
            },
            {
                "id": "s5",
                "title": "Market research brief",
                "category": "Research",
                "skills": ["Research", "Citations", "Agent Payments", "Market Analysis"],
                "description": "A cited research brief on a market or technical topic, delivered in under an hour.",
                "price": 12.0,
                "currency": "USDC",
                "durationMin": 30,
                "provider": providers["atlas"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(0, 18, 30),
                "location": "remote",
            },
            {
                "id": "s6",
                "title": "AI pull request review",
                "category": "Security",
                "skills": ["Python", "Solidity", "Code Review", "AI"],
                "description": "Automated security & style review of pull requests up to 1,500 changed lines.",
                "price": 8.0,
                "currency": "USDC",
                "durationMin": 30,
                "provider": providers["reviewer"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(0, 17),
                "location": "remote",
            },
            {
                "id": "s7",
                "title": "Django & FastAPI pairing session",
                "category": "Engineering",
                "skills": ["Python", "Django", "FastAPI"],
                "description": "Live pairing on architecture, debugging, or API design in Python.",
                "price": 15.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": providers["tomas"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(1, 9),
                "location": "remote",
            },
            {
                "id": "s8",
                "title": "Monthly ledger reconciliation",
                "category": "Finance",
                "skills": ["Accounting", "USDC", "HBAR"],
                "description": "Reconcile one month of on-chain and bank activity into a CSV ledger.",
                "price": 30.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": providers["ledger"],
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(1, 12),
                "location": "remote",
            },
        ]

        for s in seed_data:
            self._services[s["id"]] = s

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
            # Filter by owner wallet if requested
            if owner_lower:
                p_wallet = s["provider"]["wallet"].lower()
                if p_wallet != owner_lower:
                    continue

            # Free text search
            if q_lower:
                combined = f"{s['title']} {s['description']} {' '.join(s['skills'])} {s['provider']['name']}".lower()
                if q_lower not in combined:
                    continue

            # Category
            if category and s["category"].lower() != category.lower():
                continue

            # Skill
            if skill_lower:
                if not any(skill_lower in sk.lower() for sk in s["skills"]):
                    continue

            # Provider type
            if provider_type and provider_type != "any":
                if s["provider"]["type"] != provider_type:
                    continue

            # Price bounds
            if min_price is not None and s["price"] < min_price:
                continue
            if max_price is not None and s["price"] > max_price:
                continue

            # Duration
            if duration and duration > 0 and s["durationMin"] != duration:
                continue

            # Available date (YYYY-MM-DD prefix)
            if date:
                slot_date = s["nextSlot"][:10]
                if slot_date > date:
                    continue

            results.append(s)

        # Sorting
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

    def list_my_services(self, owner_wallet: str) -> list[dict[str, Any]]:
        """Retrieve services owned by a specific provider wallet."""
        w_lower = (owner_wallet or "").lower().strip()
        matched = [
            s for s in self._services.values()
            if s["provider"]["wallet"].lower() == w_lower
        ]
        if matched:
            return matched

        # If user hasn't created custom services yet, create a default user profile with sample drafts
        me_provider = {
            "id": "me",
            "name": "You",
            "type": "human",
            "headline": "Specialist Provider",
            "bio": "Published provider on Arkiv open availability network.",
            "wallet": owner_wallet,
            "rating": 5.0,
            "reviews": 1,
            "credentials": [],
            "documents": [],
        }
        default_services = [
            {
                "id": f"m_{owner_wallet[:6]}_1",
                "title": "Python code review, one hour",
                "category": "Engineering",
                "skills": ["Python", "FastAPI"],
                "description": "Code review and architecture consultation.",
                "price": 18.0,
                "currency": "USDC",
                "durationMin": 60,
                "provider": me_provider,
                "status": "published",
                "entityKey": generate_hex(64),
                "expiresAt": at_offset(30, 0),
                "nextSlot": at_offset(1, 10),
                "location": "remote",
            },
            {
                "id": f"m_{owner_wallet[:6]}_2",
                "title": "FastAPI architecture session",
                "category": "Engineering",
                "skills": ["FastAPI", "Python", "Architecture"],
                "description": "Design reviews and scaling guidance.",
                "price": 40.0,
                "currency": "USDC",
                "durationMin": 90,
                "provider": me_provider,
                "status": "draft",
                "entityKey": None,
                "expiresAt": None,
                "nextSlot": at_offset(2, 11),
                "location": "remote",
            },
        ]
        for s in default_services:
            self._services[s["id"]] = s
        return default_services

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

    def publish_service(self, service_id: str, days: int = 30) -> Optional[dict[str, Any]]:
        """Publish service to Arkiv with time-scoping expiresAt."""
        svc = self._services.get(service_id)
        if not svc:
            return None

        entity_key = svc.get("entityKey") or generate_hex(64)
        tx_ref = generate_hex(64)
        expires_at = at_offset(days, 0)

        svc["status"] = "published"
        svc["entityKey"] = entity_key
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

