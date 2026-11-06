"""
Unit tests for Arkiv client.
"""

from __future__ import annotations

import time
import unittest
from agent.arkiv_client import arkiv_client, ARKIV_AVAILABILITY_SCHEMA, ARKIV_RESERVATION_SCHEMA
from schemas.arkiv import ArkivQueryFilter, ProviderType


class TestArkivClient(unittest.TestCase):
    def setUp(self):
        # Reset local reservations before each test
        arkiv_client._reservations.clear()
        arkiv_client._slot_reservations.clear()

    def test_arkiv_schema_name(self):
        self.assertEqual(ARKIV_AVAILABILITY_SCHEMA, "slotpay.availability.v1")
        self.assertEqual(ARKIV_RESERVATION_SCHEMA, "slotpay.reservation.v1")

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

    def test_create_pending_claim(self):
        """PendingSlotClaim is owned by platform wallet and expires in 5 minutes."""
        claim = arkiv_client.create_pending_claim(
            slot_id="slot_test_1",
            availability_entity_key="0xabc123",
            provider_id="provider_alice",
            customer_wallet="0x1111222233334444555566667777888899990000",
            duration_sec=300,
        )
        self.assertEqual(claim["type"], "slot_reservation")
        self.assertEqual(claim["status"], "pending")
        self.assertEqual(claim["slotId"], "slot_test_1")
        self.assertEqual(claim["owner"], arkiv_client.platform_wallet)
        self.assertGreater(claim["expires_at_epoch"], time.time() + 290)
        self.assertFalse(arkiv_client.is_slot_available("slot_test_1"))

    def test_create_confirmed_reservation(self):
        """ConfirmedReservation records payment tx ID and marks slot as reserved."""
        res = arkiv_client.create_confirmed_reservation(
            slot_id="slot_test_2",
            payment_tx_id="0.0.9185802@173000.123456789",
            availability_entity_key="0xabc123",
            provider_id="provider_bob",
            customer_wallet="0x2222333344445555666677778888999900001111",
        )
        self.assertEqual(res["type"], "slot_reservation")
        self.assertEqual(res["status"], "confirmed")
        self.assertEqual(res["paymentTransactionId"], "0.0.9185802@173000.123456789")
        self.assertEqual(res["owner"], arkiv_client.platform_wallet)
        self.assertFalse(arkiv_client.is_slot_available("slot_test_2"))

    def test_availability_discovery_three_slots_example(self):
        """
        Validates the exact example from the requirement:
        Provider publishes 3 slots:
          Slot A (11 AM) -> Confirmed
          Slot B (2 PM)  -> Pending, expires in 3 minutes
          Slot C (4 PM)  -> None (available)
        Discovery must return only slot C.
        """
        slots = [
            {"id": "slot_A", "time": "11 AM", "service_id": "srv_1"},
            {"id": "slot_B", "time": "2 PM", "service_id": "srv_1"},
            {"id": "slot_C", "time": "4 PM", "service_id": "srv_1"},
        ]

        # Slot A is Confirmed
        arkiv_client.create_confirmed_reservation(
            slot_id="slot_A",
            payment_tx_id="0.0.9185802@173000.1",
        )

        # Slot B is Pending (expires in 3 minutes)
        arkiv_client.create_pending_claim(
            slot_id="slot_B",
            duration_sec=180,
        )

        # Slot C has no reservation

        available = arkiv_client.filter_available_slots(slots)
        self.assertEqual(len(available), 1)
        self.assertEqual(available[0]["id"], "slot_C")

    def test_expired_pending_claim_becomes_available(self):
        """When a pending claim expires, the slot becomes available again."""
        slots = [{"id": "slot_timed", "time": "10 AM"}]
        # Create claim that expired 1 second ago
        claim = arkiv_client.create_pending_claim(slot_id="slot_timed", duration_sec=1)
        claim["expires_at_epoch"] = time.time() - 1

        self.assertTrue(arkiv_client.is_slot_available("slot_timed"))
        available = arkiv_client.filter_available_slots(slots)
        self.assertEqual(len(available), 1)
        self.assertEqual(available[0]["id"], "slot_timed")


if __name__ == "__main__":
    unittest.main()
