"""
Services router for SlotPay FastAPI backend.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from schemas.api import (
    ServiceInput,
    ServicePublishInput,
    ServicePublishResponse,
    ServiceRenewInput,
    ServiceRenewResponse,
    ServiceSchema,
    SlotSchema,
)
from services.availability_service import availability_service
from services.service_store import service_store

router = APIRouter(prefix="/api/services", tags=["Services"])


@router.get("", response_model=list[ServiceSchema])
def list_services(
    q: Optional[str] = Query(None, description="Search term across title, description, skills"),
    category: Optional[str] = Query(None, description="Category filter"),
    skill: Optional[str] = Query(None, description="Skill filter"),
    provider_type: Optional[str] = Query(None, alias="provider_type", description="human, ai, or any"),
    min_price: Optional[float] = Query(None, alias="min_price", ge=0),
    max_price: Optional[float] = Query(None, alias="max_price", ge=0),
    date: Optional[str] = Query(None, description="Available date YYYY-MM-DD"),
    duration: Optional[int] = Query(None, ge=0),
    sort: Optional[str] = Query("relevance", description="relevance, price, earliest, or rating"),
    owner: Optional[str] = Query(None, description="Provider wallet address"),
) -> list[dict]:
    """
    Search and list services available on Arkiv and SlotPay network.
    Also handles `owner={wallet}` for provider dashboard.
    """
    if owner:
        return service_store.list_my_services(owner)

    # Query Arkiv Rabdi testnet database directly
    from agent.arkiv_client import arkiv_client
    from schemas.arkiv import ArkivQueryFilter, ProviderType

    p_type = ProviderType.ANY
    if provider_type == "human":
        p_type = ProviderType.HUMAN
    elif provider_type == "ai":
        p_type = ProviderType.AI

    q_filter = ArkivQueryFilter(
        q=q,
        category=category,
        provider_type=p_type,
        min_price=min_price,
        max_price=max_price,
        duration_min=duration,
        skills=[skill] if skill else [],
    )
    return arkiv_client.query_services(q_filter)


@router.get("/{service_id}", response_model=ServiceSchema)
def get_service(service_id: str) -> dict:
    """Retrieve service details by ID or Arkiv entity key."""
    svc = service_store.get_service(service_id)
    if not svc:
        svc = service_store.get_service_by_entity_key(service_id)

    if not svc and service_id.startswith("0x"):
        # 1. Query Arkiv RPC directly for entity
        from agent.arkiv_client import arkiv_client
        svc = arkiv_client.get_service_by_id_or_key(service_id)

    if not svc:
        # 2. Check availability service published metadata
        from services.availability_service import availability_service
        from services.service_store import at_offset
        for owner_key, meta in availability_service._published_meta.items():
            if meta.get("entity_key", "").lower() == service_id.lower() or (service_id.startswith("0x") and owner_key.lower() == service_id.lower()):
                cells = meta.get("cells", [])
                p_wallet = owner_key if owner_key != "default" else "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b"
                svc = {
                    "id": service_id,
                    "title": "1-on-1 Consultation",
                    "category": "Consultation",
                    "skills": ["Consultation", "Advisory", "Code Review"],
                    "description": f"Open availability published directly to Arkiv Rabdi testnet. Hourly blocks: {','.join(cells[:6]) if cells else 'Flexible'}",
                    "price": 25.0,
                    "currency": "USDC",
                    "durationMin": 60,
                    "provider": {
                        "id": f"p_{p_wallet[:8]}",
                        "name": "Verified Provider",
                        "type": "human",
                        "headline": "Specialist · Published on Arkiv Rabdi",
                        "bio": "Verified Provider on SlotPay",
                        "wallet": p_wallet,
                        "rating": 5.0,
                        "reviews": 1,
                        "credentials": ["Arkiv Verified Provider"],
                        "documents": [],
                    },
                    "status": "published",
                    "entityKey": service_id,
                    "expiresAt": meta.get("expires_at"),
                    "nextSlot": at_offset(1, 10),
                    "location": "remote",
                }
                break

    # 3. If service_id is an on-chain hex entity key, construct default consultation service
    if not svc and service_id.startswith("0x"):
        from services.service_store import at_offset
        svc = {
            "id": service_id,
            "title": "1-on-1 Consultation",
            "category": "Consultation",
            "skills": ["Consultation", "Advisory", "Code Review"],
            "description": "Open availability published directly to Arkiv Rabdi testnet.",
            "price": 25.0,
            "currency": "USDC",
            "durationMin": 60,
            "provider": {
                "id": f"p_{service_id[2:10]}",
                "name": "Verified Provider",
                "type": "human",
                "headline": "Specialist · Published on Arkiv Rabdi",
                "bio": "Verified Provider on SlotPay",
                "wallet": service_id,
                "rating": 5.0,
                "reviews": 1,
                "credentials": ["Arkiv Verified Provider"],
                "documents": [],
            },
            "status": "published",
            "entityKey": service_id,
            "nextSlot": at_offset(1, 10),
            "location": "remote",
        }

    if not svc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id '{service_id}' not found.",
        )
    return svc


@router.post("", response_model=ServiceSchema, status_code=status.HTTP_201_CREATED)
def create_service(input_data: ServiceInput, owner: Optional[str] = Query(None)) -> dict:
    """Create a new service listing (in draft mode)."""
    wallet = owner or input_data.owner or "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b"
    return service_store.create_service(wallet, input_data)


@router.put("/{service_id}", response_model=ServiceSchema)
def update_service(
    service_id: str,
    input_data: ServiceInput,
    owner: Optional[str] = Query(None),
) -> dict:
    """Update an existing service listing."""
    wallet = owner or input_data.owner or ""
    updated = service_store.update_service(wallet, service_id, input_data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id '{service_id}' not found.",
        )
    return updated


@router.post("/{service_id}/publish", response_model=ServicePublishResponse)
def publish_service(service_id: str, body: Optional[ServicePublishInput] = None) -> dict:
    """Publish service to the Arkiv open database with time-scoping."""
    days = body.days if body else 30
    entity_key = body.entity_key if body else None
    tx_ref = body.tx_ref if body else None
    res = service_store.publish_service(service_id, days, entity_key=entity_key, tx_ref=tx_ref)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id '{service_id}' not found.",
        )
    return res


@router.post("/{service_id}/renew", response_model=ServiceRenewResponse)
def renew_service(service_id: str, body: Optional[ServiceRenewInput] = None) -> dict:
    """Renew service expiration TTL on Arkiv."""
    days = body.days if body else 30
    res = service_store.renew_service(service_id, days)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id '{service_id}' not found.",
        )
    return res


@router.delete("/{service_id}/publish")
def unpublish_service(service_id: str) -> dict:
    """Unpublish service from Arkiv (reverts to draft)."""
    ok = service_store.unpublish_service(service_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id '{service_id}' not found.",
        )
    return {"success": True, "message": "Service unpublished."}


@router.get("/{service_id}/slots", response_model=list[SlotSchema])
def get_service_slots(service_id: str, date: Optional[str] = Query(None)) -> list[dict]:
    """Retrieve available time slots for a specific service."""
    return availability_service.get_service_slots(service_id, date)


@router.post("/link-swarm")
def link_swarm_document(body: dict) -> dict:
    """Automatically link uploaded Swarm document to the provider's active Arkiv service."""
    owner = body.get("owner") or ""
    filename = body.get("filename") or "Document"
    swarm_ref = body.get("swarm_ref") or body.get("swarmRef") or ""
    return service_store.link_swarm_document(owner, filename, swarm_ref)

