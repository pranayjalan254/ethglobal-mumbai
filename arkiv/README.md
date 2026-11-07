
## 🧩 Track: Build on Arkiv (from scratch) ($4,000)

### Why Arkiv for OASIS Protocol?
Arkiv serves as the open, queryable data layer of OASIS. Providers connect their wallets and publish service profiles, offerings, pricing, and availability as wallet-owned Arkiv entities. 

A key architectural principle of OASIS is that **providers retain ownership of their published availability**. OASIS does not modify or delete provider-owned entities. Instead, the platform publishes separate reservation entities that other applications query to determine whether a slot is temporarily claimed or already booked.

### 1. Arkiv Network Configuration
- **Network**: Arkiv Rabdi Testnet
- **RPC Endpoint**: `https://rpc.rabdi.db-chain.testnet.arkiv.network`
- **Chain ID**: `7794095`
- **SDK**: `@arkiv-network/sdk` in TypeScript and native JSON-RPC `arkiv_query` in Python.

### 2. Entities & Schemas
| Schema Name | Owner Wallet | Purpose & Indexed Attributes | Expiration (TTL) |
| :--- | :--- | :--- | :--- |
| `slotpay.services.v1` | Provider Wallet | Service title, category, skills, hourly rate (`price`), duration, provider wallet, `swarmRef` | 30 days (auto-renewed by active provider) |
| `slotpay.availability.v1` | Provider Wallet | Weekly availability bitmasks, recurring booking intervals | 7 days (rolling weekly schedule) |
| `slotpay.reservation.v1` | OASIS Platform | Slot reservation claims, payment transaction IDs, slot burn state | 14 days (retains proof through consultation delivery) |

### 3. Wallet Addresses That Wrote Entities
- **Platform Signer Wallet**: `0xc819c505B7Bb52ef8a77311d09526E46F8403C09`
- **Demo Provider Wallet**: `0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77`

### 4. Live Query Judges Can Run
To test that Arkiv is live and returns filtered services directly from the Rabdi testnet:

```bash
curl -X POST "https://rpc.rabdi.db-chain.testnet.arkiv.network/ark_live_FkBVVU1GhNDlAKQwhXeZSxI5gs6BI7dR" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "arkiv_query",
    "params": [
      "arkiv.schema = str('\''slotpay.services.v1'\'') AND category = str('\''Design'\'') AND price <= dec(50.00)",
      {
        "select": { "key": true, "owner": true, "expiresAt": true, "attributes": true },
        "limit": "0x14"
      }
    ],
    "id": 1
  }'
```

### 5. Detailed Arkiv Documentation Files
Per the track judging criteria, all required in-depth evaluation documents are located in `/arkiv/`:
- [`/arkiv/schema.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/schema.md) — Comprehensive schema definitions, indexed fields, entity ownership rules, and TTL policies.
- [`/arkiv/friction.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/friction.md) — Developer friction points encountered and concrete improvements for the Arkiv protocol.
- [`/arkiv/reach.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/reach.md) — Target market, user personas, live usability, and post-hackathon roadmap.
- [`/arkiv/why-arkiv.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/why-arkiv.md) — Comparative analysis vs. Postgres and what data was intentionally kept off Arkiv.
- [`/arkiv/how-you-use-arkiv.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/how-you-use-arkiv.md) — Query filters, entity edit rights, and direct UI manifestations.

---

## 🐝 Track: Arkiv + Swarm Bonus ($500)

### Decentralized Credentials and Documents
OASIS uses Swarm as its decentralized file storage layer for provider credentials, certifications, licenses, and deliverables. The corresponding Swarm references are linked to provider profiles and service entities on Arkiv via the `swarmRef` attribute.

AI agents retrieve and evaluate these documents when assessing provider qualifications, comparing professionals, and recommending the most suitable service.

| Data Layer | Storage Target | Content & Privacy Model |
| :--- | :--- | :--- |
| **Arkiv** (Rabdi Testnet) | `slotpay.services.v1` | Structured, queryable metadata: hourly prices, categories, skills, availability, and on-chain booking receipts. |
| **Swarm** (`bzz://`) | Decentralized Blob Chunks | Large binary documents: provider verification certificates, audited resumes, sample penetration test reports, and deliverables. |

### Live Proofs & Links
- **Arkiv Entity Key on Rabdi Testnet**:  
  `0xce0939eb89cb38ac6d5f1761c1e93d23005f3428375be6147be49339949fe3a0`
- **Arkiv Entity Key Query URL on Rabdi Testnet**: 
  [https://rabdi.explorer.arkiv.network/tx/0xc9432550bf6384de2271d32327d83e954fd31b37996d2f22389e2b6a94f7a731](https://rabdi.explorer.arkiv.network/tx/0xc9432550bf6384de2271d32327d83e954fd31b37996d2f22389e2b6a94f7a731)
- **Linked Swarm Reference**:  
  `96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6`
- **Live Swarm Gateway Link**:  
  [https://bzz.link/forbidden?hash=69505afea8f1f85285923de9a130f09c00be50a14466f3913cd2ab063b225af2](https://bzz.link/forbidden?hash=69505afea8f1f85285923de9a130f09c00be50a14466f3913cd2ab063b225af2)
- **Postage Stamp Batch ID**:  
  `69505afea8f1f85285923de9a130f09c00be50a14466f3913cd2ab063b225af2` (Purchased by: `0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77`)

Full Swarm documentation, video timestamps, and reproduction steps: [`/arkiv/swarm.md`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/arkiv/swarm.md).