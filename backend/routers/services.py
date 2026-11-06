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

    return service_store.list_services(
        q=q,
        category=category,
        skill=skill,
        provider_type=provider_type,
        min_price=min_price,
        max_price=max_price,
        date=date,
        duration=duration,
        sort=sort,
    )


@router.get("/{service_id}", response_model=ServiceSchema)
def get_service(service_id: str) -> dict:
    """Retrieve service details by ID."""
    svc = service_store.get_service(service_id)
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

