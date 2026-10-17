# ChatPay Testnet workspace

The authenticated workspace is `/chat`. Its server component verifies the backend session before returning private workspace content. API calls use `/api/chatpay/*`; the Next.js gateway stores the backend token in an HttpOnly, SameSite=Strict cookie. The browser does not store bearer tokens.

## Backend connection

Backend selection is automatic:

| Frontend runtime | Default backend |
| --- | --- |
| Local development (`npm run dev`) | `http://localhost:4000` |
| Production build, including Vercel Production/Preview | `https://chatpay-7anj.onrender.com` |

`CHATPAY_API_URL` overrides either default. To point local development at the hosted backend:

```sh
CHATPAY_API_URL=https://chatpay-7anj.onrender.com npm run dev
```

Start the backend using its existing setup and configuration. No environment files were created or read during this task. `CHATPAY_API_URL` belongs to the Next.js server, so it does not need a `NEXT_PUBLIC_` prefix. Use HTTPS for a hosted backend.

The backend auth service includes the Freighter SEP-53 verification change. Deploy that backend change alongside the frontend when using a hosted backend; older raw-only verification rejects modern Freighter sign-in signatures.

## Vercel configuration

In Vercel → Project → Settings → Environment Variables, set `CHATPAY_API_URL` to `https://chatpay-7anj.onrender.com` for Production and Preview, then redeploy. It is server-only; no `NEXT_PUBLIC_` variable is required. Remove any old override pointing to localhost. With no override, production already defaults to Render.

The API host switch does not change the Stellar network. Wallet connection and signing remain on Stellar Testnet; Mainnet needs a separate backend/network configuration review.

If Render is unavailable or waking from an idle instance, the frontend can still return an unavailable-backend error. Changing the URL alone does not verify backend health.

## User flow

1. Connect Freighter on Stellar Testnet.
2. Choose Let’s Chat and approve the wallet’s single-use sign-in message. This message does not send funds.
3. Save a recipient’s full public Stellar address.
4. Submit a payment command to prepare a backend-generated preview.
5. Review the full address, amount, asset, and fee, then check the recipient confirmation box.
6. Choose Approve in your wallet and approve in Freighter. Only that signed XDR is sent to the backend.
7. View the backend’s submitted/confirmed status and receipt in chat or Activity. An uncertain submission is reconciled by payment ID; it is never automatically resubmitted.

Disconnect removes the HttpOnly session and workspace access. It does not revoke Freighter’s extension-level site permission. Account/network changes require reconnection. A refresh retains backend authorization via the cookie, but still checks the current Freighter account and network before showing the client workspace.

## Checks

- Frontend: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Isolated backend signature tests: `npm run test:auth-message` from `chatpay-backend/` (Node with TypeScript stripping support, e.g. Node 22.18+).
- Full backend suite was not run: backend dependencies were unavailable and their installation was declined.

## Local HTTP simulation

The QA fixture is derived from the backend route contracts and contains synthetic data. It is not a backend implementation and must never be used as a production backend. It does not cryptographically validate wallet signatures; the separate backend signature tests cover that primitive.

```sh
postman simulation run postman/simulations/workspace.sim.yaml --port 4900 --no-history --output ndjson
```

In another terminal, start an isolated Next.js preview:

```sh
CHATPAY_API_URL=http://localhost:4900/backend CHATPAY_BUILD_DIR=.next/qa npm run dev -- --port 3100
```

The verified browser flow used test-only Freighter responses injected through Chrome DevTools, not real extension approval or an on-chain transaction. It covered protected direct navigation, signed-message login, session-cookie flags, recipient saving, preview, rejected wallet approval, successful submission/receipt, Activity, logout, and desktop/tablet/mobile layouts.

Additional HTTP checks rejected missing/forged sessions, invalid sign-in signatures, untrusted origins, and unsupported endpoints. Stopping the simulation returned an actionable 503 and kept private workspace content hidden.

## Deployment configuration verification

The frontend resolves the backend URL on the server: explicit CHATPAY_API_URL override first, then the runtime default. Tests cover local/production targets, blank overrides, URL normalization, and invalid protocols. The Render health endpoint returned HTTP 200 with a healthy database during verification. All 24 frontend tests, TypeScript checks, and the production build passed. Existing Vercel environment-variable overrides still take priority and require correction/redeployment in Vercel.

The pending live-integration fee display fix was also completed: backend fee values are integer stroops, converted to XLM for display without floating-point rounding. No backend files were modified.
