"""
Unit tests for Arkiv client.
"""

from __future__ import annotations

import unittest
from agent.arkiv_client import arkiv_client, ARKIV_AVAILABILITY_SCHEMA
from schemas.arkiv import ArkivQueryFilter, ProviderType


class TestArkivClient(unittest.TestCase):
    def test_arkiv_schema_name(self):
        self.assertEqual(ARKIV_AVAILABILITY_SCHEMA, "slotpay.availability.v1")

    def test_matches_filter_price(self):
        """_matches_filter rejects services over max_price."""
        f = ArkivQueryFilter(max_price=10.0)
        svc = {
            "price": 50.0,
            "provider_type": "human",
            "provider_name": "Test",
            "duration_min": 60,
        }
        self.assertFalse(arkiv_client._matches_filter(svc, f))

    def test_matches_filter_pass(self):
        """_matches_filter accepts services within budget."""
        f = ArkivQueryFilter(max_price=20.0, provider_type=ProviderType.HUMAN)
        svc = {
            "price": 0.05,
            "provider_type": "human",
            "provider_name": "Pranay",
            "duration_min": 60,
        }
        self.assertTrue(arkiv_client._matches_filter(svc, f))

    def test_query_services_returns_list(self):
        """query_services always returns a list (may be empty if Rabdi unreachable)."""
        f = ArkivQueryFilter(max_price=20.0)
        # In sandboxed test env, Rabdi is unreachable so returns []
        services = arkiv_client.query_services(f)
        self.assertIsInstance(services, list)
        for s in services:
            self.assertLessEqual(s["price"], 20.0)
            self.assertIn("provider_name", s)
            self.assertIn("provider_wallet", s)


if __name__ == "__main__":
    unittest.main()
