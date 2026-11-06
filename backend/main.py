"""
SlotPay Backend - Autonomous Commerce Network.
FastAPI Application linking Frontend, Arkiv Web3 Database, and Hedera x402 Autonomous Payments.
"""

from __future__ import annotations

from datetime import datetime
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from agent.graph import execute_autonomous_agent
from config import ARKIV_RABDI_RPC
from routers import (
    agent_router,
    availability_router,
    bookings_router,
    provider_router,
    services_router,
    swarm_router,
    wallet_router,
    x402_router,
)

# -----------------------------------------------------------------------------
# FastAPI App Initialization
# -----------------------------------------------------------------------------
app = FastAPI(
    title="SlotPay API",
    description="Autonomous Commerce Network powered by Arkiv Web3 Database and Hedera x402 Payments.",
    version="1.0.0",
)

# Enable CORS for frontend clients (Vite, TanStack Start, Next.js, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(services_router)
app.include_router(availability_router)
app.include_router(bookings_router)
app.include_router(agent_router)
app.include_router(swarm_router)
app.include_router(provider_router)
app.include_router(wallet_router)
app.include_router(x402_router)


@app.get("/")
@app.get("/api/health")
def health_check() -> dict:
    """System health check and network configuration."""
    return {
        "status": "healthy",
        "service": "SlotPay Autonomous Commerce API",
        "version": "1.0.0",
        "database": "Arkiv Rabdi Testnet",
        "arkiv_rpc": ARKIV_RABDI_RPC,
        "payments": "Hedera x402 (fee-payer exact scheme)",
        "network": os.getenv("HEDERA_NETWORK", "hedera:testnet"),
        "timestamp": datetime.now().isoformat() + "Z",
    }


# -----------------------------------------------------------------------------
# CLI Autonomous Agent Demo Execution
# -----------------------------------------------------------------------------
def run_autonomous_demo() -> None:
    ref_date = datetime.now().strftime("%Y-%m-%d (%A)")
    print("=" * 80)
    print(" SlotPay Autonomous Commerce: Arkiv Discovery & Hedera x402 Payments")
    print(f" Reference Date: {ref_date}")
    print("=" * 80)

    # Scenario 1: Autonomous Flow under Approved Budget
    query_1 = (
        "Find me a Python developer available tomorrow for a one-hour consultation "
        "under $20. Choose the best available option and book it."
    )
    print("\n[Scenario 1] Autonomous Booking Within Approved Budget")
    print(f"User Query: \"{query_1}\"")
    print("-" * 80)

    state_1 = execute_autonomous_agent(query_1, reference_date=ref_date)
    parsed_1 = state_1.get("parsed_request")
    if parsed_1:
        print(f"1. Interpreted Request: {parsed_1.summary}")
        print(f"   Action:              {parsed_1.agent_decision.action.value}")
        print(f"   Strategy:            {parsed_1.agent_decision.selection_strategy.value}")
        print(f"   Approved Budget Cap: ${parsed_1.agent_decision.auto_approve_budget:.2f} USDC")

    print("\n2. Arkiv Discovery:")
    print(f"   Discovered Services: {len(state_1.get('discovered_services', []))} listings matching filter.")
    selected_1 = state_1.get("selected_service")
    if selected_1:
        p_name = selected_1.get("provider_name") or selected_1.get("provider", {}).get("name", "Provider")
        p_wallet = selected_1.get("provider_wallet") or selected_1.get("provider", {}).get("wallet", "0x0")
        print(f"   Selected Candidate:  {p_name} - {selected_1.get('title', 'Service')}")
        print(f"   Provider Rating:     {selected_1.get('rating', 0)} / 5.0 ({selected_1.get('reviews', 0)} reviews)")
        print(f"   Price:               ${selected_1.get('price', 0.0):.2f} {selected_1.get('currency', 'USDC')}")
        print(f"   Wallet:              {p_wallet}")

    print("\n3. Slot Reservation:")
    slot_1 = state_1.get("selected_slot")
    if slot_1:
        print(f"   Claim ID:            {slot_1['claim_id']}")
        print(f"   Appointment Time:    {slot_1['slot_time']}")

    print("\n4. Hedera x402 Payment Challenge & Autonomous Settlement:")
    challenge_1 = state_1.get("x402_challenge")
    if challenge_1:
        print(f"   HTTP Status:         {challenge_1['status']} Payment Required")
        print(f"   Scheme:              {challenge_1['scheme']} (Hedera fee-payer model)")
        print(f"   Network:             {challenge_1['network']}")
        print(f"   Fee Payer:           {challenge_1['fee_payer']} (Facilitator sponsors gas)")

    if state_1.get("payment_settled"):
        receipt = state_1["settlement_receipt"]
        print(f"\n   [STATUS: AUTONOMOUS PAYMENT SETTLED ON HEDERA]")
        print(f"   Transaction ID:      {receipt['tx_id']}")
        print(f"   Amount Settled:      ${receipt['amount_settled']:.2f} {receipt['currency']}")
        print(f"   HashScan Explorer:   {receipt['hashscan_url']}")
        print(f"   Gas Sponsored:       {receipt['facilitator_fee_sponsored']}")
    else:
        print(f"   [STATUS: AWAITING APPROVAL]")

    # Scenario 2: Budget Cap Protection
    query_2 = (
        "Find me a smart contract auditor for my Solidity contracts under $50. "
        "Choose the best option and book it."
    )
    print("\n" + "=" * 80)
    print("[Scenario 2] Budget Protection: Required Price Exceeds Authorized Cap")
    print(f"User Query: \"{query_2}\"")
    print("-" * 80)

    state_2 = execute_autonomous_agent(query_2, reference_date=ref_date)
    parsed_2 = state_2.get("parsed_request")
    if parsed_2:
        print(f"1. Interpreted Request: {parsed_2.summary}")
        print(f"   Approved Budget Cap: ${parsed_2.agent_decision.auto_approve_budget:.2f} USDC")

    print("\n2. Arkiv Discovery & Price Check:")
    selected_2 = state_2.get("selected_service")
    if selected_2:
        p_name_2 = selected_2.get("provider_name") or selected_2.get("provider", {}).get("name", "Provider")
        print(f"   Available Service:   {p_name_2} (${selected_2.get('price', 0.0):.2f} USDC)")

    print(f"\n3. Autonomous Payment Decision:")
    if not state_2.get("payment_settled"):
        print("   [STATUS: BLOCKED BY BUDGET GUARD]")
        print(f"   Requires Approval:   {state_2.get('requires_approval')}")
        print(f"   Reason:              {state_2.get('error_message') or 'Price exceeds budget cap'}")
    print("=" * 80)


if __name__ == "__main__":
    if "--demo" in sys.argv:
        run_autonomous_demo()
    else:
        # Run FastAPI with Uvicorn
        port = int(os.getenv("PORT", "8000"))
        host = os.getenv("HOST", "0.0.0.0")
        print(f"Starting SlotPay FastAPI server on {host}:{port}...")
        uvicorn.run("main:app", host=host, port=port, reload=True)
