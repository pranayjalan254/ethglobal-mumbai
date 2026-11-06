"""
Comprehensive unit tests for SlotPay FastAPI endpoints and services.
"""

from __future__ import annotations

import unittest
from fastapi.testclient import TestClient
from main import app


class TestSlotPayAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("Arkiv", data["database"])
        self.assertIn("Hedera", data["payments"])

    def test_list_services_returns_list(self):
        response = self.client.get("/api/services")
        self.assertEqual(response.status_code, 200)
        services = response.json()
        self.assertIsInstance(services, list)
        # No seed data — may be empty until real Arkiv entities exist

    def test_filter_services_by_category_and_price(self):
        response = self.client.get("/api/services", params={"category": "Engineering", "max_price": 20.0})
        self.assertEqual(response.status_code, 200)
        services = response.json()
        self.assertIsInstance(services, list)
        for s in services:
            self.assertEqual(s["category"], "Engineering")
            self.assertLessEqual(s["price"], 20.0)

    def test_get_service_by_id_not_found(self):
        # No seed data — unknown IDs return 404
        response = self.client.get("/api/services/nonexistent")
        self.assertEqual(response.status_code, 404)

    def test_create_and_update_service(self):
        payload = {
            "title": "Hedera Token Integration Consultation",
            "category": "Engineering",
            "skills": ["Hedera", "HTS", "Python"],
            "description": "Deep-dive pairing on Hedera Token Service.",
            "price": 35.0,
            "currency": "USDC",
            "durationMin": 60,
            "providerType": "human",
            "owner": "0x1234567890abcdef1234567890abcdef12345678",
        }
        res = self.client.post("/api/services", json=payload)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        self.assertEqual(created["title"], payload["title"])
        self.assertEqual(created["status"], "draft")
        new_id = created["id"]

        # Update service
        update_payload = dict(payload, price=45.0)
        res_update = self.client.put(f"/api/services/{new_id}", json=update_payload)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["price"], 45.0)

        # Publish service to Arkiv
        res_pub = self.client.post(f"/api/services/{new_id}/publish", json={"days": 30})
        self.assertEqual(res_pub.status_code, 200)
        pub_data = res_pub.json()
        self.assertTrue(pub_data["entity_key"].startswith("0x"))

        # Renew service
        res_renew = self.client.post(f"/api/services/{new_id}/renew", json={"days": 60})
        self.assertEqual(res_renew.status_code, 200)

        # Unpublish service
        res_unpub = self.client.delete(f"/api/services/{new_id}/publish")
        self.assertEqual(res_unpub.status_code, 200)

    def test_availability_and_slots(self):
        # Get provider availability
        res = self.client.get("/api/availability")
        self.assertEqual(res.status_code, 200)
        slots = res.json()
        self.assertIsInstance(slots, list)

        # Publish availability cells
        pub_res = self.client.post("/api/availability", json={"cells": ["0-10", "1-14", "2-16"]})
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.json()["count"], 3)

    def test_booking_x402_with_created_service(self):
        # Create a service first (no seed data)
        payload = {
            "title": "Test Python session",
            "category": "Engineering",
            "skills": ["Python"],
            "description": "Test service.",
            "price": 0.05,
            "currency": "USDC",
            "durationMin": 60,
            "providerType": "human",
            "owner": "0x5d8d26cBEa05632ABF3a3cf87E1f3806AD34de77",
        }
        svc_res = self.client.post("/api/services", json=payload)
        self.assertEqual(svc_res.status_code, 201)
        svc_id = svc_res.json()["id"]

        # Create booking (triggers 402 challenge)
        req = {
            "serviceId": svc_id,
            "slotId": f"{svc_id}-1-10",
            "buyerWallet": "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
        }
        b_res = self.client.post("/api/bookings", json=req)
        self.assertEqual(b_res.status_code, 200)
        b_data = b_res.json()
        self.assertIn("payment", b_data)
        payment = b_data["payment"]
        self.assertEqual(payment["status"], 402)
        self.assertEqual(payment["scheme"], "exact")
        self.assertIn("payTo", payment)

        # Confirm booking
        conf_req = {
            "serviceId": svc_id,
            "slotStart": "2026-11-07T10:00:00Z",
            "buyer": "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
        }
        conf_res = self.client.post("/api/bookings/confirm", json=conf_req)
        self.assertEqual(conf_res.status_code, 200)
        receipt = conf_res.json()
        self.assertTrue(receipt["bookingRef"].startswith("SP-"))
        self.assertTrue(receipt["txId"].startswith("0.0."))

        # List bookings
        list_res = self.client.get("/api/bookings", params={"role": "buyer"})
        self.assertEqual(list_res.status_code, 200)
        self.assertGreater(len(list_res.json()), 0)

    def test_provider_stats_and_wallet(self):
        stats_res = self.client.get("/api/provider/stats")
        self.assertEqual(stats_res.status_code, 200)
        stats = stats_res.json()
        self.assertIn("publishedServices", stats)
        self.assertIn("earningsUsdc", stats)

        tx_res = self.client.get("/api/wallet/transactions")
        self.assertEqual(tx_res.status_code, 200)
        txs = tx_res.json()
        self.assertIsInstance(txs, list)

    def test_swarm_upload(self):
        file_content = b"Mock portfolio PDF content for Swarm storage test."
        res = self.client.post(
            "/api/swarm/upload",
            content=file_content,
            headers={"content-type": "application/pdf", "x-filename": "test_portfolio.pdf"},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("reference", data)
        self.assertTrue(data["reference"].startswith("0x"))

    def test_agent_chat_stream(self):
        req = {
            "message": "Find me a Python developer available tomorrow under $20 and book it.",
            "limit": 25.0,
            "autoApprove": True,
        }
        res = self.client.post("/api/agent/chat", json=req)
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/event-stream", res.headers.get("content-type", ""))

        content = res.text
        self.assertIn("data:", content)
        self.assertIn("understand", content)
        self.assertIn("discover", content)


if __name__ == "__main__":
    unittest.main()
