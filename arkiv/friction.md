# Arkiv Developer Friction & Feedback ⸺ OASIS Protocol

This document outlines real developer friction points experienced while building OASIS Protocol on the Arkiv Rabdi testnet during ETHGlobal Mumbai 2026, accompanied by reproducible examples and concrete suggestions for protocol improvement.

---

## 1. Top Areas for Protocol Improvement

### A. First-Class Multi-Entity Joins or Compound Queries
- **The Problem**: When a buyer queries available services, the app must filter out slots that already have an active reservation. Because Arkiv queries operate on a single schema at a time (`from(ServicesSchema)`), we had to run two sequential queries (`slotpay.services.v1` and `slotpay.reservation.v1`) and manually perform an in-memory exclusion join.
- **Suggested Improvement**: Add basic foreign-key relation references or subquery filters, e.g.:
  ```sql
  WHERE id NOT IN (SELECT serviceId FROM slotpay.reservation.v1 WHERE status = 'confirmed')
  ```

### B. Python SDK Parity with TypeScript SDK
- **The Problem**: The `@arkiv-network/sdk` for TypeScript is rich and intuitive with fluent builders (`client.select().from(...).where(...).orderBy(...)`). However, in Python, our autonomous agent backend had to build raw SQL-like string queries over raw JSON-RPC (`arkiv_query`).
- **Suggested Improvement**: Release an official `arkiv-python` SDK offering type-safe query builders and Pydantic schema validation.

### C. Clearer JSON-RPC Error Encodings
- **The Problem**: When a syntax error occurs in an `arkiv_query` string (for instance, mismatched quotes or unindexed field filtering), the Rabdi testnet endpoint occasionally returns a generic `Internal server error (-32603)` or an unparsed string error without character offsets.
- **Suggested Improvement**: Structured JSON-RPC error details containing:
  - `error.data.column`: token/character index where parsing failed.
  - `error.data.expected`: list of valid tokens/operators.
  - `error.data.unindexedField`: specific field requiring indexing.

---

## 2. Specific Bug / Unexpected Behavior Report

### Issue: Case-Sensitivity in Schema Name Filtering
- **What We Expected**: Querying `arkiv.schema = str('slotpay.services.v1')` to be robust, or for case discrepancies in string attributes to allow case-insensitive modifiers (e.g. `ILIKE` or `LOWER(category) = 'engineering'`).
- **What Happened**: Strict equality checks failed when buyers entered mixed-case categories (e.g. `"Engineering"` vs `"engineering"`), forcing us to construct cumbersome `OR` chains across possible capitalizations:
  ```python
  clauses.append("(category = str('Design') OR category = str('design'))")
  ```
- **How to Reproduce**:
  1. Insert an entity with attribute `category: "Engineering"`.
  2. Query with `arkiv.schema = str('slotpay.services.v1') AND category = str('engineering')`.
  3. The query returns `0` results.
- **Suggested Fix**: Support case-insensitive functions: `lower(category) = str('engineering')` or native `ILIKE` operator in Arkiv query grammar.

