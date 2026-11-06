"""
Unit tests for Arkiv client and query builder.
"""

from __future__ import annotations

import unittest
from agent.arkiv_client import build_arkiv_query_string, arkiv_client
from schemas.arkiv import ArkivQueryFilter, ProviderType


class TestArkivClient(unittest.TestCase):
    def test_query_string_builder(self):
        f = ArkivQueryFilter(
            category="Engineering",
            provider_type=ProviderType.HUMAN,
            max_price=20.0,
            duration_min=60,
        )
        q = build_arkiv_query_string(f)

        self.assertIn("arkiv.schema = str('slotpay.services.v1')", q)
        self.assertIn("category = str('Engineering')", q)
        self.assertIn("providerType = str('human')", q)
        self.assertIn("price <= dec('20.00')", q)
        self.assertIn("durationMin = i32(60)", q)

    def test_arkiv_query_services(self):
        f = ArkivQueryFilter(
            category="Engineering",
            skills=["Python"],
            max_price=20.0,
        )
        services = arkiv_client.query_services(f)
        self.assertGreater(len(services), 0)

        for s in services:
            self.assertEqual(s["category"], "Engineering")
            self.assertLessEqual(s["price"], 20.0)


if __name__ == "__main__":
    unittest.main()

