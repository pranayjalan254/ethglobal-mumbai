## Live Hedera x402 mode

The backend now uses genuine facilitator verify/settle flow and no longer simulates transaction ids.

### Required environment variables

- `HEDERA_CLIENT_ACCOUNT_ID` (example: `0.0.123456`)
- `HEDERA_CLIENT_PRIVATE_KEY` (ED25519 or ECDSA private key)
- `HEDERA_NETWORK` (default: `hedera:testnet`)
- `HEDERA_USDC_TOKEN_ID` (default: `0.0.429274` on testnet)
- `HEDERA_USDC_DECIMALS` (default: `6`)
- `X402_HTTP_TIMEOUT_SECONDS` (default: `20`)
- `X402_FACILITATOR_URL` (default: `https://facilitator.slotpay.network`)

Optional:

- The facilitator URL can also be overridden by passing a custom URL to `HederaX402PaymentEngine(...)`.

### Notes

- `pay_to` must be a Hedera account id in the form `0.0.x`.
- For HTS token payments, the client account must be associated with the token and funded.
- The facilitator must support Hedera `exact` scheme with `/verify` and `/settle` endpoints.
