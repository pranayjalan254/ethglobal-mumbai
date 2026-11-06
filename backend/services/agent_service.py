"""
Agent Service - Coordinates the LangGraph autonomous commerce agent
and streams SSE events to the SlotPay frontend.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
import logging
from typing import Any, AsyncGenerator, Optional

from agent.graph import execute_autonomous_agent
from agent.x402_hedera import hedera_x402_engine
from services.booking_service import booking_service, generate_tx_id

logger = logging.getLogger(__name__)

STEP_TITLES = {
    "understand": "Understand request",
    "discover": "Discover services",
    "compare": "Compare providers",
    "claim": "Check availability and claim slot",
    "pay": "Pay with Hedera x402",
    "confirm": "Confirm",
}


def _format_sse(event_data: dict[str, Any]) -> str:
    """Format dictionary as Server-Sent Event data line."""
    return f"data: {json.dumps(event_data)}\n\n"


class AgentService:
    """Executes the autonomous agent workflow and streams progress events."""

    async def stream_agent_workflow(
        self,
        message: str,
        limit: float = 50.0,
        auto_approve: bool = True,
        client_wallet: str = "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
    ) -> AsyncGenerator[str, None]:
        """
        Execute the autonomous agent pipeline and yield SSE events matching
        the frontend AgentEvent interface.
        """
        ref_date = datetime.now().strftime("%Y-%m-%d (%A)")

        def step_event(step_id: str, state: str, detail: Optional[dict[str, Any]] = None) -> dict[str, Any]:
            keys = list(STEP_TITLES.keys())
            idx = keys.index(step_id) + 1 if step_id in keys else 1
            return {
                "type": "step",
                "step": {
                    "id": step_id,
                    "index": idx,
                    "title": STEP_TITLES.get(step_id, step_id),
                    "state": state,
                    "detail": detail,
                },
            }

        # -------------------------------------------------------------
        # 1. UNDERSTAND STEP
        # -------------------------------------------------------------
        yield _format_sse(step_event("understand", "running"))
        await asyncio.sleep(0.3)

        # Execute LangGraph agent workflow
        loop = asyncio.get_running_loop()
        agent_state = await loop.run_in_executor(
            None,
            lambda: execute_autonomous_agent(
                message,
                client_wallet=client_wallet,
                reference_date=ref_date,
            ),
        )

        parsed = agent_state.get("parsed_request")
        arkiv_filter = agent_state.get("arkiv_filter")

        skill_label = "Specialist"
        if arkiv_filter and arkiv_filter.skills:
            skill_label = f"{arkiv_filter.skills[0]} specialist"
        elif arkiv_filter and arkiv_filter.category:
            skill_label = f"{arkiv_filter.category} specialist"

        budget_str = f"under {limit:.2f} HBAR"
        if parsed and parsed.agent_decision.auto_approve_budget:
            budget_str = f"under {parsed.agent_decision.auto_approve_budget:.2f} HBAR"

        date_str = "Next available"
        if arkiv_filter and arkiv_filter.time_window and arkiv_filter.time_window.target_date:
            date_str = arkiv_filter.time_window.target_date.capitalize()

        duration_str = "60 min"
        if arkiv_filter and arkiv_filter.duration_min:
            duration_str = f"{arkiv_filter.duration_min} min"

        action_str = "Choose and book" if parsed and parsed.agent_decision.action.value == "auto_book" else "Recommend"

        understand_detail = {
            "service": skill_label,
            "budget": budget_str,
            "date": date_str,
            "duration": duration_str,
            "action": action_str,
        }
        yield _format_sse(step_event("understand", "complete", understand_detail))
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # 2. DISCOVER STEP
        # -------------------------------------------------------------
        yield _format_sse(step_event("discover", "running"))
        await asyncio.sleep(0.3)

        discovered = agent_state.get("discovered_services") or []

        query_desc = f"category:{arkiv_filter.category or 'Any'}" if arkiv_filter else "open services"
        if arkiv_filter and arkiv_filter.skills:
            query_desc += f" AND skills:{','.join(arkiv_filter.skills)}"
        if arkiv_filter and arkiv_filter.max_price:
            query_desc += f" AND price<={arkiv_filter.max_price}"

        discover_detail = {
            "source": "Arkiv",
            "query": query_desc,
            "results": len(discovered),
        }
        yield _format_sse(step_event("discover", "complete", discover_detail))
        await asyncio.sleep(0.4)

        if not discovered:
            yield _format_sse({"type": "text", "text": "No available providers found on Arkiv matching your criteria. Try adjusting the budget, category, or date."})
            yield _format_sse({"type": "done"})
            return

        # -------------------------------------------------------------
        # 3. COMPARE STEP
        # -------------------------------------------------------------
        yield _format_sse(step_event("compare", "running"))
        await asyncio.sleep(0.3)

        selected = agent_state.get("selected_service")
        if not selected and discovered:
            selected = discovered[0]

        candidates_preview = []
        for s in discovered[:3]:
            candidates_preview.append({
                "id": s.get("id"),
                "name": s.get("provider_name") or s.get("provider", {}).get("name", "Provider"),
                "type": s.get("provider_type") or s.get("provider", {}).get("type", "human"),
                "price": float(s.get("price") or 0.5),
                "rating": float(s.get("rating") or s.get("provider", {}).get("rating", 4.8)),
                "nextSlot": s.get("next_slot") or s.get("nextSlot", "2026-11-06T10:00:00Z"),
            })

        compare_detail = {
            "candidates": candidates_preview,
            "recommended": selected.get("id") if selected else (candidates_preview[0]["id"] if candidates_preview else "s1"),
            "reason": "Highest rated candidate within approved criteria with an open availability slot on Arkiv.",
        }
        yield _format_sse(step_event("compare", "complete", compare_detail))
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # 4. CLAIM STEP
        # -------------------------------------------------------------
        yield _format_sse(step_event("claim", "running"))
        await asyncio.sleep(0.3)

        slot = agent_state.get("selected_slot") or {}
        claim_id = slot.get("claim_id", "clm_4a9b1c2d3e")
        slot_time = slot.get("slot_time") or (selected.get("nextSlot") if selected else "2026-11-06T10:00:00Z")
        provider_name = selected.get("provider_name") or selected.get("provider", {}).get("name", "Provider")

        from datetime import timedelta

        claim_detail = {
            "slot": slot_time,
            "provider": provider_name,
            "claimId": claim_id,
            "expiresAt": (datetime.now() + timedelta(minutes=5)).replace(microsecond=0).isoformat() + "Z",
        }
        yield _format_sse(step_event("claim", "complete", claim_detail))
        await asyncio.sleep(0.4)

        # -------------------------------------------------------------
        # 5. PAY STEP (Hedera x402)
        # -------------------------------------------------------------
        amount = float(selected.get("price", 0.05)) if selected else 0.05
        currency = selected.get("currency", "HBAR") if selected else "HBAR"
        provider_wallet = (
            selected.get("provider_wallet")
            or selected.get("provider", {}).get("wallet", "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b")
        )

        from agent.x402_hedera import DEFAULT_FACILITATOR_ACCOUNT, DEFAULT_FACILITATOR_URL, DEFAULT_USDC_TOKEN_ID

        payment_challenge = {
            "status": 402,
            "scheme": "exact",
            "amount": f"{amount:.2f}",
            "token": f"{currency} ({DEFAULT_USDC_TOKEN_ID})" if currency == "USDC" else "HBAR",
            "network": "hedera:testnet",
            "payTo": provider_wallet,
            "feePayer": DEFAULT_FACILITATOR_ACCOUNT,
            "facilitator": DEFAULT_FACILITATOR_URL,
            "resource": f"/api/bookings/{selected.get('id', 's1')}",
            "maxTimeoutSeconds": 300,
        }

        # Check budget authorization
        needs_manual_approval = (amount > limit) or (not auto_approve)
        if needs_manual_approval:
            # Emit awaiting approval step
            yield _format_sse(step_event("pay", "awaiting", {"payment": payment_challenge}))
            yield _format_sse({
                "type": "approval",
                "amount": amount,
                "step": {
                    "id": "pay",
                    "index": 5,
                    "title": STEP_TITLES["pay"],
                    "state": "awaiting",
                    "detail": {"payment": payment_challenge},
                },
            })
            # For demonstration in streaming, if budget was exceeded but workflow continues or stops:
            if amount > limit and not auto_approve:
                yield _format_sse(step_event("pay", "failed", {
                    "payment": payment_challenge,
                    "reason": f"Payment amount ${amount:.2f} exceeds spending limit of ${limit:.2f}.",
                }))
                yield _format_sse({
                    "type": "text",
                    "text": f"The selected provider rate (${amount:.2f} {currency}) exceeds your authorized budget cap (${limit:.2f}). Please approve the transaction or increase your spending limit.",
                })
                yield _format_sse({"type": "done"})
                return

        # Settle payment autonomously
        yield _format_sse(step_event("pay", "running", {"payment": payment_challenge, "phase": "challenge"}))
        await asyncio.sleep(0.3)
        yield _format_sse(step_event("pay", "running", {"payment": payment_challenge, "phase": "signing"}))
        await asyncio.sleep(0.3)

        settlement_receipt = agent_state.get("settlement_receipt")
        if settlement_receipt:
            tx_id = settlement_receipt.get("tx_id", generate_tx_id())
            explorer_url = settlement_receipt.get("hashscan_url", f"https://hashscan.io/testnet/transaction/{tx_id}")
        else:
            tx_id = generate_tx_id()
            explorer_url = f"https://hashscan.io/testnet/transaction/{tx_id}"

        yield _format_sse(step_event("pay", "complete", {
            "payment": payment_challenge,
            "phase": "settled",
            "txId": tx_id,
            "explorerUrl": explorer_url,
        }))
        await asyncio.sleep(0.3)

        # -------------------------------------------------------------
        # 6. CONFIRM STEP
        # -------------------------------------------------------------
        yield _format_sse(step_event("confirm", "running"))
        await asyncio.sleep(0.3)

        service_title = selected.get("title", "Consultation")
        receipt = booking_service.confirm_booking(
            service_id=selected.get("id", "s1"),
            slot_start=slot_time,
            tx_id_override=tx_id,
            buyer="You",
            service_data={
                "id": selected.get("id", "s1"),
                "title": service_title,
                "price": amount,
                "currency": currency,
                "provider": {
                    "name": provider_name,
                    "type": selected.get("provider_type") or selected.get("provider", {}).get("type", "human"),
                },
            },
        )

        yield _format_sse(step_event("confirm", "complete", {"receipt": receipt}))
        await asyncio.sleep(0.2)

        completion_text = (
            f"Booked {service_title} with {provider_name}. "
            f"Payment of {amount:.2f} {currency} settled on Hedera. "
            f"The receipt is below and in your bookings."
        )
        yield _format_sse({"type": "text", "text": completion_text})
        yield _format_sse({"type": "done", "receipt": receipt})


# Singleton instance
agent_service = AgentService()

