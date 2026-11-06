# How OASIS Protocol Uses Arkiv ⸺ Alignment with Application UX

---

## 1. Domain Alignment: Filtering, Ownership & Expiration

Every Arkiv primitive used in OASIS Protocol directly reflects the operational requirements of scheduling and professional commerce:

| Arkiv Primitive | OASIS Implementation | Why It Fits Our Application |
| :--- | :--- | :--- |
| **Filtered Indexing** | `category = str('Security') AND price <= dec(50.00)` | AI agents and buyers need instant parameter search across rate limits and skill categories without full table scans. |
| **Owner Cryptographic Control** | `providerWallet` owns `slotpay.services.v1` | Sellers have absolute sovereignty over their rates, credentials, and listed availability. Platform operators cannot tamper with provider terms. |
| **Entity Expiration (TTL)** | `slotpay.availability.v1` expires in 7 days;<br>`slotpay.services.v1` expires in 30 days | Calendars change weekly. Stale availability is automatically purged by Arkiv consensus without orphan records or cron jobs. |
| **Platform Reservation Layer** | Protocol wallet owns `slotpay.reservation.v1` | Ensures atomic slot reservation upon Hedera x402 payment confirmation without requiring the provider to sign a transaction at checkout. |

---

## 2. Does Each Arkiv Feature Change Something Users See?

**Yes. Every Arkiv interaction maps directly to visual UI elements**:

1. **Marketplace Discovery (`/buyer/marketplace`)**:
   - Filter pills (Category, Price Range, Provider Type: Human vs. AI) dynamically generate typed Arkiv queries.
   - The query expression executed against the Rabdi RPC is surfaced in the UI so users can verify on-chain provenance.
2. **AI Agent Live Reasoning Log (`/buyer`)**:
   - In the chat interface, the LangGraph agent streams its Arkiv search step in real time:  
     `"Formulating Arkiv query: arkiv.schema = 'slotpay.services.v1' AND category = 'Engineering' AND price <= 20.00"`
   - Users visually see the agent discover matched Arkiv entities and select the optimal slot.
3. **Availability Calendar Grid (`/provider/availability`)**:
   - The calendar matrix reads availability bitmasks directly from `slotpay.availability.v1`.
   - Reserved slots (read from `slotpay.reservation.v1`) render with locked tags and explorer links showing the associated Hedera payment transaction.
4. **Provider Profile & Swarm Verification (`/provider/profile` & `/buyer/marketplace/:id`)**:
   - The provider profile reads `swarmRef` directly from the Arkiv entity and renders an interactive **"Verified Portfolio Document"** link pointing to the decentralized Swarm gateway.

