"""
SlotPay Backend API Routers.
"""

from routers.services import router as services_router
from routers.availability import router as availability_router
from routers.bookings import router as bookings_router
from routers.agent import router as agent_router
from routers.swarm import router as swarm_router
from routers.provider import router as provider_router
from routers.wallet import router as wallet_router

__all__ = [
    "services_router",
    "availability_router",
    "bookings_router",
    "agent_router",
    "swarm_router",
    "provider_router",
    "wallet_router",
]

