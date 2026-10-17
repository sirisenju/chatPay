# Authorized Testnet workspace

User approved implementing chat, recipients, payment review, Freighter approval, receipt, and activity using the Testnet backend. Match supplied desktop design; adapt sidebar and columns for smaller viewports.

1. Verify Freighter SEP-53 authentication signatures in backend while preserving existing raw signatures.
2. Add same-origin API gateway with HttpOnly session cookie, backend bearer authentication, request allowlist, CSRF origin checks, timeouts, and no-store responses.
3. Let’s Chat requests a challenge, signs it in Freighter, verifies with backend, and enters /chat. The server validates the session before rendering workspace data. Disconnect invalidates the cookie.
4. Build workspace: shared sidebar, live balance, chat composer, recipients, payment preview with explicit recipient confirmation, wallet approval, submitted/confirmed receipt, and paginated activity.
5. Submit only a reviewed, unexpired preview after explicit Freighter approval. Verify current account/network and returned signer. Rejection never submits; ambiguous submission failures require status reconciliation before retry.
6. Verify with wallet/payment tests, HTTP dependency simulation, and browser checks including unauthorized direct navigation and responsive layouts. No sample balances or fake confirmations in the production UI.

Backend target: CHATPAY_API_URL server override; local development defaults to http://localhost:4000 and production defaults to https://chatpay-7anj.onrender.com. No environment files accessed. Future services attach behind the same API client.
