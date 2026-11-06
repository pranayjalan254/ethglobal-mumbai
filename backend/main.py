"""
SlotPay Backend - Autonomous Commerce Demo.

Demonstrates:
1. Natural language query parsing into Arkiv database schema.
2. Arkiv open service discovery and candidate ranking.
3. Availability slot reservation claim.
4. Hedera x402 autonomous payment execution within approved budget cap.
5. Strict budget protection when requested price exceeds authorized limit.
"""

from __future__ import annotations

import json
from datetime import datetime
from agent.graph import execute_autonomous_agent, parse_service_query


def run_autonomous_demo() -> None:
    ref_date = datetime.now().strftime("%Y-%m-%d (%A)")
    print("=" * 80)
    print(" SlotPay Autonomous Commerce: Arkiv Discovery & Hedera x402 Payments")
    print(f" Reference Date: {ref_date}")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # Scenario 1: Autonomous Flow under Approved Budget ($20 budget, $18 service)
    # -------------------------------------------------------------------------
    query_1 = (
        "Find me a Python developer available tomorrow for a one-hour consultation "
        "under $20. Choose the best available option and book it."
    )
    print("\n[Scenario 1] Autonomous Booking Within Approved Budget")
    print(f"User Query: \"{query_1}\"")
    print("-" * 80)

    state_1 = execute_autonomous_agent(query_1, reference_date=ref_date)
    parsed_1 = state_1["parsed_request"]

    print(f"1. Interpreted Request: {parsed_1.summary}")
    print(f"   Action:              {parsed_1.agent_decision.action.value}")
    print(f"   Strategy:            {parsed_1.agent_decision.selection_strategy.value}")
    print(f"   Approved Budget Cap: ${parsed_1.agent_decision.auto_approve_budget:.2f} USDC")

    print("\n2. Arkiv Discovery:")
    print(f"   Discovered Services: {len(state_1.get('discovered_services', []))} listings matching filter.")
    selected_1 = state_1.get("selected_service")
    if selected_1:
        print(f"   Selected Candidate:  {selected_1['provider_name']} - {selected_1['title']}")
        print(f"   Provider Rating:     {selected_1.get('rating', 0)} / 5.0 ({selected_1.get('reviews', 0)} reviews)")
        print(f"   Price:               ${selected_1['price']:.2f} {selected_1['currency']}")
        print(f"   Wallet:              {selected_1['provider_wallet']}")

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

    # -------------------------------------------------------------------------
    # Scenario 2: Budget Cap Protection (Service costs $120, user budget $50)
    # -------------------------------------------------------------------------
    query_2 = (
        "Find me a smart contract auditor for my Solidity contracts under $50. "
        "Choose the best option and book it."
    )
    print("\n" + "=" * 80)
    print("[Scenario 2] Budget Protection: Required Price Exceeds Authorized Cap")
    print(f"User Query: \"{query_2}\"")
    print("-" * 80)

    state_2 = execute_autonomous_agent(query_2, reference_date=ref_date)
    parsed_2 = state_2["parsed_request"]

    print(f"1. Interpreted Request: {parsed_2.summary}")
    print(f"   Approved Budget Cap: ${parsed_2.agent_decision.auto_approve_budget:.2f} USDC")

    print("\n2. Arkiv Discovery & Price Check:")
    selected_2 = state_2.get("selected_service")
    if selected_2:
        print(f"   Available Service:   {selected_2['provider_name']} (${selected_2['price']:.2f} USDC)")

    print(f"\n3. Autonomous Payment Decision:")
    if not state_2.get("payment_settled"):
        print("   [STATUS: BLOCKED BY BUDGET GUARD]")
        print(f"   Requires Approval:   {state_2.get('requires_approval')}")
        print(f"   Reason:              {state_2.get('error_message') or 'Price exceeds budget cap'}")
    print("=" * 80)


if __name__ == "__main__":
    run_autonomous_demo()
