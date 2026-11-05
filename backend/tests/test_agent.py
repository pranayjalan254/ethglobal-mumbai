"""
Unit tests for the SlotPay Natural Language Query Parser Agent.
"""

from __future__ import annotations

import unittest
from agent.graph import parse_service_query
from schemas.arkiv import ProviderType
from schemas.request import AgentAction


class TestQueryParserAgent(unittest.TestCase):
    def setUp(self):
        self.ref_date = "2026-11-05 (Thursday)"

    def test_user_python_consultation_case(self):
        query = (
            "Find me a Python developer available tomorrow for a one-hour "
            "consultation under $20. Choose the best available option and book it."
        )
        res = parse_service_query(query, reference_date=self.ref_date)

        self.assertTrue(res.is_actionable)
        self.assertEqual(res.arkiv_filter.category, "Engineering")
        self.assertTrue(any("python" in s.lower() for s in res.arkiv_filter.skills))
        self.assertEqual(res.arkiv_filter.duration_min, 60)
        self.assertLessEqual(res.arkiv_filter.max_price, 20.0)

        # Time window resolution
        self.assertIsNotNone(res.arkiv_filter.time_window)
        self.assertEqual(res.arkiv_filter.time_window.resolved_date, "2026-11-06")

        # Autonomous booking intent
        self.assertEqual(res.agent_decision.action, AgentAction.AUTO_BOOK)
        self.assertEqual(res.agent_decision.auto_approve_budget, 20.0)

    def test_ai_agent_research_case(self):
        query = "Get a cited market research brief on agent payments today for under $15 and pay for it."
        res = parse_service_query(query, reference_date=self.ref_date)

        self.assertTrue(res.is_actionable)
        self.assertEqual(res.arkiv_filter.category, "Research")
        self.assertLessEqual(res.arkiv_filter.max_price, 15.0)
        self.assertEqual(res.agent_decision.action, AgentAction.AUTO_BOOK)

    def test_named_provider_security_audit(self):
        query = "I need a smart contract audit from Marcus Lindqvist next Monday for up to $150."
        res = parse_service_query(query, reference_date=self.ref_date)

        self.assertTrue(res.is_actionable)
        self.assertEqual(res.arkiv_filter.category, "Security")
        self.assertIsNotNone(res.arkiv_filter.provider_name)
        self.assertIn("Marcus", res.arkiv_filter.provider_name)
        self.assertEqual(res.arkiv_filter.max_price, 150.0)

    def test_empty_or_vague_query(self):
        res = parse_service_query("", reference_date=self.ref_date)
        self.assertFalse(res.is_actionable)


if __name__ == "__main__":
    unittest.main()

