"""
SlotPay Backend - Arkiv Query Parser Agent Runner.

Demonstrates parsing natural language queries into validated Arkiv database query objects
and autonomous agent decision schemas using LangGraph and Groq.
"""

from __future__ import annotations

import json
from datetime import datetime
from agent.graph import parse_service_query


TEST_CASES = [
    {
        "name": "Case 1: Developer consultation with auto-book intent (User Example)",
        "query": "Find me a Python developer available tomorrow for a one-hour consultation under $20. Choose the best available option and book it.",
    },
    {
        "name": "Case 2: Smart contract audit with named provider",
        "query": "I need a smart contract audit from Marcus Lindqvist next Monday for up to $150.",
    },
    {
        "name": "Case 3: Autonomous AI agent research brief with autonomous payment",
        "query": "Get a cited market research brief on agent payments today for under $15 and pay for it.",
    },
    {
        "name": "Case 4: Design review with weekly scheduling",
        "query": "Book a UX review of our onboarding flow this week, budget $50.",
    },
    {
        "name": "Case 5: AI code review agent browsing with low price cap",
        "query": "Show me AI code review agents under $10.",
    },
    {
        "name": "Case 6: Legal & compliance consultation",
        "query": "Need a lawyer for terms of service and token compliance.",
    },
]


def run_demo() -> None:
    ref_date = datetime.now().strftime("%Y-%m-%d (%A)")
    print("=" * 80)
    print(" SlotPay Natural Language -> Arkiv Query Parser (LangGraph + Groq)")
    print(f" Reference Date: {ref_date}")
    print("=" * 80)

    for i, test in enumerate(TEST_CASES, start=1):
        print(f"\n[{i}/{len(TEST_CASES)}] {test['name']}")
        print(f"Query: \"{test['query']}\"")
        print("-" * 80)

        result = parse_service_query(test["query"], reference_date=ref_date)

        # 1. Human Summary
        print(f"Summary:        {result.summary}")
        print(f"Actionable:     {result.is_actionable}")

        # 2. Arkiv Query Filter Object
        print("\nArkiv Database Query Filter:")
        print(json.dumps(result.arkiv_filter.model_dump(exclude_none=True), indent=2))

        # 3. Parameters ready to send to Arkiv /listServices API
        print("\nArkiv API Parameters:")
        print(json.dumps(result.arkiv_filter.to_arkiv_params(), indent=2))

        # 4. Agent Decision & Autonomy
        print("\nAgent Booking Decision:")
        print(json.dumps(result.agent_decision.model_dump(exclude_none=True), indent=2))
        print("=" * 80)


if __name__ == "__main__":
    run_demo()
