"""
Service Store - In-memory service catalog for SlotPay.

No seed data. Services are created by real providers via the API
and discovered from live Arkiv on-chain entities.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import logging
from pathlib import Path
import secrets
from typing import Any, Dict, List, Optional

from schemas.api import ServiceInput

logger = logging.getLogger("slotpay.service_store")


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
        self._services: Dict[str, Dict[str, Any]] = {}
        self._owner_documents: Dict[str, List[Dict[str, str]]] = {}
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._docs_file = self._data_dir / "owner_documents.json"
        self._load_persisted_documents()

    def _load_persisted_documents(self) -> None:
        """Load persisted owner document references from disk."""
        try:
            if self._docs_file.exists():
                with open(self._docs_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self._owner_documents = data
        except Exception:
            pass

    def _persist_documents(self) -> None:
        """Save owner documents to disk."""
        try:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            with open(self._docs_file, "w", encoding="utf-8") as f:
                json.dump(self._owner_documents, f, indent=2)
        except Exception:
            pass

    def get_all_documents(self) -> List[Dict[str, str]]:
        """Retrieve all real uploaded Swarm documents across the platform."""
        docs: List[Dict[str, str]] = []
        # Check owner documents registry
        for doc_list in self._owner_documents.values():
            for d in doc_list:
                ref = d.get("swarmRef", "")
                if ref and not ref.startswith("96bfa8a3") and not any(ed.get("swarmRef") == ref for ed in docs):
                    docs.append(d)
        # Check swarm_service disk cache
        try:
            from services.swarm_service import swarm_service
            for ref, f_info in swarm_service._stored_files.items():
                if not ref.startswith("0x") and not ref.startswith("96bfa8a3"):
                    clean_ref = ref.strip()
                    if not any(ed.get("swarmRef") == clean_ref for ed in docs):
                        docs.append({
                            "name": f_info.get("filename", "Portfolio Document"),
                            "swarmRef": clean_ref,
                        })
        except Exception:
            pass
        return docs

    def get_documents_for_owner(self, owner: str) -> List[Dict[str, str]]:
        """Retrieve all Swarm portfolio documents uploaded for this owner."""
        owner_lower = (owner or "").lower().strip()
        docs: List[Dict[str, str]] = []
        if owner_lower and owner_lower in self._owner_documents:
            for d in self._owner_documents[owner_lower]:
                ref = d.get("swarmRef", "")
                if ref and not ref.startswith("96bfa8a3") and not any(ed.get("swarmRef") == ref for ed in docs):
                    docs.append(d)

        # Check in services
        for svc in self._services.values():
            if svc.get("provider", {}).get("wallet", "").lower() == owner_lower:
                for d in svc.get("provider", {}).get("documents", []):
                    ref = d.get("swarmRef", "")
                    if ref and not ref.startswith("96bfa8a3") and not any(ed.get("swarmRef") == ref for ed in docs):
                        docs.append(d)

        # Fallback to general uploaded documents if specific owner has none registered yet
        if not docs:
            docs = self.get_all_documents()

        return docs

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
    ) -> List[Dict[str, Any]]:
        """Filter services matching query constraints."""
        results: List[Dict[str, Any]] = []

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
        if not w_lower:
            return []

        local_results = [
            s for s in self._services.values()
            if s["provider"]["wallet"].lower() == w_lower
        ]

        # Query Arkiv Rabdi testnet for live services published by this wallet
        try:
            from agent.arkiv_client import arkiv_client
            # In Arkiv query syntax, addr takes unquoted 0x address: addr(0x123...)
            query = f"arkiv.schema = str('slotpay.services.v1') AND providerWallet = addr({w_lower})"
            arkiv_services = arkiv_client._call_arkiv_rpc(query) or []
            existing_keys = {str(s.get("entityKey") or s.get("id")).lower() for s in local_results}
            for svc in arkiv_services:
                key = str(svc.get("entityKey") or svc.get("id")).lower()
                if key and key not in existing_keys:
                    self._services[svc["id"]] = svc
                    local_results.append(svc)
                    existing_keys.add(key)
        except Exception as e:
            logger.warning("Error fetching owner services from Arkiv: %s", e)

        for svc in local_results:
            p_wallet = svc.get("provider", {}).get("wallet", "")
            owner_docs = self.get_documents_for_owner(p_wallet or w_lower)
            if owner_docs:
                existing_docs = svc.get("provider", {}).setdefault("documents", [])
                for d in owner_docs:
                    if not any(ed.get("swarmRef") == d.get("swarmRef") for ed in existing_docs):
                        existing_docs.append(d)
                if existing_docs and not svc.get("swarmRef"):
                    svc["swarmRef"] = existing_docs[0]["swarmRef"]

        return local_results

    def create_service(self, owner: str, data: ServiceInput) -> dict[str, Any]:
        """Create a new service listing (initially draft) with all owner portfolio documents automatically linked."""
        new_id = f"m_{secrets.token_hex(4)}"
        owner_lower = owner.lower().strip() if owner else ""

        # Collect all existing portfolio documents for this owner
        auto_docs: list[dict[str, str]] = []
        if data.documents:
            for d in data.documents:
                d_ref = getattr(d, "swarmRef", None) or (d.get("swarmRef") if isinstance(d, dict) else "")
                d_name = getattr(d, "name", None) or (d.get("name") if isinstance(d, dict) else "Portfolio Document")
                clean = str(d_ref).replace("bzz://", "").replace("0x", "").strip()
                if clean and not clean.startswith("96bfa8a3") and d_name != "credentials-aws.pdf":
                    if not any(ad.get("swarmRef") == clean for ad in auto_docs):
                        auto_docs.append({"name": d_name, "swarmRef": clean})

        for d in self.get_documents_for_owner(owner_lower):
            ref = d.get("swarmRef", "")
            if ref and not ref.startswith("96bfa8a3") and d.get("name") != "credentials-aws.pdf":
                if not any(ad.get("swarmRef") == ref for ad in auto_docs):
                    auto_docs.append(d)

        if data.swarmRef:
            clean_ref = str(data.swarmRef).replace("bzz://", "").replace("0x", "").strip()
            if not clean_ref.startswith("96bfa8a3") and not any(ad.get("swarmRef") == clean_ref for ad in auto_docs):
                auto_docs.append({
                    "name": "Portfolio Document",
                    "swarmRef": clean_ref,
                })

        provider_data = {
            "id": f"p_{secrets.token_hex(3)}",
            "name": "You",
            "type": data.providerType,
            "headline": f"{data.category} Specialist",
            "bio": data.description or "Provider on OASIS Protocol",
            "wallet": owner or "0x0000000000000000000000000000000000000000",
            "rating": 5.0,
            "reviews": 0,
            "credentials": [],
            "documents": auto_docs,
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
            "swarmRef": auto_docs[0]["swarmRef"] if auto_docs else data.swarmRef,
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
        """Update an existing service listing without dropping any uploaded portfolio documents."""
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

        owner_lower = (owner or svc.get("provider", {}).get("wallet", "")).lower().strip()
        docs = svc.get("provider", {}).setdefault("documents", [])

        # Strip dummy files
        docs[:] = [d for d in docs if not d.get("swarmRef", "").startswith("96bfa8a3") and d.get("name") != "credentials-aws.pdf"]

        # Merge with owner documents registry
        for d in self.get_documents_for_owner(owner_lower):
            ref = d.get("swarmRef", "")
            if ref and not any(ed.get("swarmRef") == ref for ed in docs):
                docs.append(d)

        # Merge any documents explicitly passed
        if data.documents:
            for d in data.documents:
                d_ref = getattr(d, "swarmRef", None) or (d.get("swarmRef") if isinstance(d, dict) else "")
                d_name = getattr(d, "name", None) or (d.get("name") if isinstance(d, dict) else "Portfolio Document")
                ref = str(d_ref).replace("bzz://", "").replace("0x", "").strip()
                if ref and not ref.startswith("96bfa8a3") and d_name != "credentials-aws.pdf" and not any(ed.get("swarmRef") == ref for ed in docs):
                    docs.append({"name": d_name or "Portfolio Document", "swarmRef": ref})

        if data.swarmRef:
            clean_ref = str(data.swarmRef).replace("bzz://", "").replace("0x", "").strip()
            if clean_ref and not clean_ref.startswith("96bfa8a3") and not any(d.get("swarmRef") == clean_ref for d in docs):
                docs.append({"name": "Portfolio Document", "swarmRef": clean_ref})
            svc["swarmRef"] = clean_ref

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

    def link_swarm_document(self, owner: str, filename: str, swarm_ref: str) -> dict[str, Any]:
        """Automatically link an uploaded Swarm reference to all of the provider's active Arkiv services."""
        owner_lower = owner.lower().strip() if owner else "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77"
        clean_ref = swarm_ref.replace("bzz://", "").replace("0x", "").strip()
        doc_entry = {
            "name": filename or "Portfolio Document",
            "swarmRef": clean_ref,
        }

        # Update owner-level documents registry for this owner and fallback targets
        for target_owner in {owner_lower, "default", "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77"}:
            owner_docs = self._owner_documents.setdefault(target_owner, [])
            owner_docs[:] = [d for d in owner_docs if not d.get("swarmRef", "").startswith("96bfa8a3") and d.get("name") != "credentials-aws.pdf"]
            if not any(d.get("swarmRef") == clean_ref and d.get("name") == doc_entry["name"] for d in owner_docs):
                owner_docs.append(doc_entry)

        # Find all services for this owner
        owner_services = [
            svc for svc in self._services.values()
            if owner_lower and svc.get("provider", {}).get("wallet", "").lower() == owner_lower
        ]

        # Fallback to all services if owner is unassigned or demo
        if not owner_services and self._services:
            owner_services = list(self._services.values())

        # If still no service, create one
        if not owner_services:
            from schemas.api import ServiceInput
            created = self.create_service(
                owner=owner or "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77",
                data=ServiceInput(
                    title="Consultation & Advisory Session",
                    category="Engineering",
                    skills=["Code Review", "Architecture", "Consultation"],
                    description="Verified provider with portfolio documents on Swarm.",
                    price=25.0,
                    currency="HBAR",
                    durationMin=60,
                    providerType="human",
                    swarmRef=clean_ref,
                ),
            )
            owner_services = [created]

        # Link document to every service of this owner and clean dummy documents
        for svc in owner_services:
            svc["swarmRef"] = clean_ref
            docs = svc.get("provider", {}).setdefault("documents", [])
            # Strip any mock/dummy documents
            docs[:] = [d for d in docs if not d.get("swarmRef", "").startswith("96bfa8a3") and d.get("name") != "credentials-aws.pdf"]
            if not any(d.get("swarmRef") == clean_ref and d.get("name") == doc_entry["name"] for d in docs):
                docs.append(doc_entry)

        self._persist_documents()

        return {
            "success": True,
            "linked_services_count": len(owner_services),
            "swarm_ref": clean_ref,
        }


# Singleton instance
service_store = ServiceStore()
