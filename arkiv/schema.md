# Arkiv Schema Specification ⸺ OASIS Protocol

This document details the on-chain entity schemas, ownership architecture, indexed query fields, and expiration policies implemented on the Arkiv Rabdi testnet (Chain ID `7794095`) for OASIS Protocol.

---

## 1. Entity Schemas

### A. Services Schema (`slotpay.services.v1`)
Represents professional consultation listings published by human providers and autonomous AI subagents.

```typescript
export const ServicesSchema = defineSchema("slotpay.services.v1", {
  title: str().indexed(),
  category: str().indexed(),
  skills: str().indexed(),
  providerType: str().indexed(), // "human" | "ai"
  providerName: str(),
  providerWallet: addr().indexed(),
  price: dec().indexed(),
  currency: str().indexed(), // "HBAR" | "USDC"
  durationMin: i32().indexed(),
  description: str(),
  nextSlot: str().indexed(),
  rating: dec().indexed(),
  swarmRef: str(), // Unencrypted 64-hex Swarm content address of verified portfolio/credentials
});
```

- **Owner**: The Provider's wallet address (`providerWallet`). Only the provider's private key can update or delete their service entity.
- **Expiration (TTL)**: 30 days. Providers refresh or re-publish active services periodically, preventing abandoned listings from cluttering search results.

---

### B. Availability Schema (`slotpay.availability.v1`)
Stores weekly recurring and slot-specific availability bitmasks for appointment booking.

```typescript
export const AvailabilitySchema = defineSchema("slotpay.availability.v1", {
  serviceId: str().indexed(),
  providerWallet: addr().indexed(),
  weekOffset: i32().indexed(),
  availableSlotsMask: str(), // Compact bitmask representation of 15-minute booking intervals
  updatedAt: str(),
});
```

- **Owner**: The Provider's wallet address (`providerWallet`).
- **Expiration (TTL)**: 7 days. Automatically expires with the rolling weekly calendar schedule.

---

### C. Reservation Schema (`slotpay.reservation.v1`)
Records claimed appointment slots, payment settlement hashes, and slot burn states.

```typescript
export const ReservationSchema = defineSchema("slotpay.reservation.v1", {
  slotId: str().indexed(),
  serviceId: str().indexed(),
  providerWallet: addr().indexed(),
  customerWallet: addr().indexed(),
  paymentTransactionId: str().indexed(), // Hedera Testnet transaction ID
  status: str().indexed(), // "confirmed" | "completed" | "cancelled"
  start: str().indexed(),
  durationMin: i32(),
});
```

- **Owner**: OASIS Platform Operator (`0xc819c505B7Bb52ef8a77311d09526E46F8403C09`). Owned by the protocol to guarantee that slots are burned immutably upon verified x402 payment, preventing double-booking without altering provider-owned service entities.
- **Expiration (TTL)**: 14 days. Retained until the booked consultation is delivered and verified, then cleanly garbage-collected.

---

## 2. Indexed Fields & Query Strategy

OASIS takes advantage of Arkiv's native indexing across all key discovery parameters:
- `category` & `skills`: Fast keyword and domain categorization (e.g. `category = str('Engineering')`).
- `providerType`: Instant discrimination between human specialists and 24/7 autonomous AI agents (`providerType = str('ai')`).
- `price`: Range filtering and ceiling budgets (`price <= dec(50.00)`).
- `rating`: Sorting by verified customer ratings (`ORDER BY rating DESC`).
- `nextSlot`: Immediate scheduling availability (`ORDER BY nextSlot ASC`).

---

## 3. Entity Ownership & Security Rules

1. **Decentralized Seller Sovereignty**: Sellers hold exclusive cryptographic control over their listings (`slotpay.services.v1`). Neither the platform nor any other user can mutate their hourly rates, descriptions, or linked Swarm documents.
2. **Immutable Slot Burning via Protocol Reservations**: To avoid modifying seller entities during booking, reservations are recorded as independent `slotpay.reservation.v1` entities owned by the platform. The frontend and agent join services and active reservations in memory to filter out booked slots.
3. **Privacy Compliance with Swarm**: Raw Swarm access keys are strictly kept off Arkiv. The `swarmRef` stores only public content-addressed hashes (`bzz://`).

