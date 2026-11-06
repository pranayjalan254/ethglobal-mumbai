# Why Arkiv? ⸺ OASIS Protocol Architectural Rationale

---

## 1. If We Swapped Arkiv for Postgres, What Would Users Lose?

If OASIS Protocol were backed by a traditional Postgres instance or Supabase database, our users and autonomous agents would lose the foundation of open, permissionless commerce:

1. **Permissionless Interoperability & Open Discovery**:
   - In Postgres, service listings and provider ratings live in a centralized, walled-garden database. External autonomous agents cannot independently crawl or verify listings without bespoke API keys or platform approval.
   - On **Arkiv**, listings are public on-chain entities on Rabdi testnet. Any AI agent, third-party scheduler, or decentralized indexer can query `slotpay.services.v1` with standard SQL filters without asking permission or risking API rate limits.
2. **Cryptographic Identity & Seller Sovereignty**:
   - In Postgres, a database administrator or hacked credential can alter a consultant's hourly rate, edit their bio, or cancel their listings.
   - On **Arkiv**, each entity has a verified owner wallet (`providerWallet`). Only cryptographic signatures signed by the provider's private key can mutate or delete their service listing.
3. **Native Entity Expiration (TTL) as a Business Primitive**:
   - In Postgres, cleaning stale availability or expired calendar slots requires background cron jobs, soft deletes, and bloated tables.
   - On **Arkiv**, availability bitmasks automatically expire via native protocol TTL (7 days), and stale listings expire after 30 days unless refreshed. The network handles garbage collection deterministically.
4. **Censorship Resistance**:
   - Postgres can be deplatformed by AWS, Stripe, or hosting providers. Arkiv is a distributed, consensus-backed database where no central entity can shut down commerce.

---

## 2. What Did We Keep Off Arkiv, and Why?

Arkiv is optimized for structured, indexed, queryable metadata. To maintain protocol efficiency, user privacy, and cost-effectiveness, we strictly kept certain data off Arkiv:

1. **Large Binary Documents & Portfolios (Stored on Swarm instead)**:
   - Resumes, code audit PDF deliverables, and certifications are several megabytes in size. Storing large blobs on Arkiv would bloat the validator state.
   - *Solution*: Blobs are content-addressed on **Swarm (`bzz://`)**, and only the immutable 64-hex root hash is referenced in Arkiv's `swarmRef` attribute.
2. **Private Video Consultation Feeds & Meeting Keys**:
   - WebRTC meeting links and ephemeral end-to-end encryption keys are generated off-chain and shared only between buyer and seller upon confirmed payment.
   - *Reason*: Arkiv entities are publicly queryable by any node. Storing meeting URLs or private notes on Arkiv would compromise user privacy.
3. **Private Buyer Spending Budget Caps**:
   - Each buyer's spending threshold (`BudgetExceededError` limit) is held strictly client-side in their agent runtime.
   - *Reason*: Advertising an agent's maximum willing payment on a public ledger would allow sellers to unfairly price-discriminate.

