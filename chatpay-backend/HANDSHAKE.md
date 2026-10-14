# ChatPay Frontend ↔ Backend Integration Contract (HandShake.md)

This document is the complete implementation guide for the **Frontend Developer or Frontend AI Agent** integrating with the ChatPay Backend and Stellar Testnet.

---

## 1. Quick Reference & Endpoints

| Environment | Base HTTP URL | WebSockets (Socket.IO) | Interactive Docs |
| :--- | :--- | :--- | :--- |
| **Local Development** | `http://localhost:4000` | `ws://localhost:4000` | `http://localhost:4000/docs` |
| **Production / Render** | `https://chatpay-backend.onrender.com` | `wss://chatpay-backend.onrender.com` | `https://chatpay-backend.onrender.com/docs` |

- **OpenAPI 3.1 Contract File**: [`openapi.json`](./openapi.json) (can be imported into Orval, OpenAPI Generator, or Swagger Editor).
- **Socket.IO Event Catalog**: [`docs/realtime-events.md`](./docs/realtime-events.md).

---

## 2. Cold-Start Prevention (Strategy 1 Option A: Uptime Monitor)

Render free instances spin down after 15 minutes of inactivity. To ensure the backend stays **awake 24/7 with instant zero-second response times**:

### Setup Free Uptime Ping:
1. Create a free account at **[UptimeRobot](https://uptimerobot.com/)** or **[cron-job.org](https://cron-job.org/)**.
2. Add a new HTTP monitor:
   - **URL**: `https://chatpay-backend.onrender.com/health` (or your Render URL)
   - **Interval**: **10 minutes**
   - **Method**: `GET`
3. **Result**: UptimeRobot pings `/health` every 10 minutes around the clock. Render's inactivity timer never expires, keeping the free container permanently warm and responsive.

### Frontend App Boot Ping (Best Practice):
At the top level of your frontend application (`App.tsx` or root layout), trigger a lightweight ping on mount to start cold-start warming immediately:

```typescript
// in App.tsx / useWakeup.ts
useEffect(() => {
  // 1. Immediate wakeup ping
  fetch(`${API_BASE_URL}/health`).catch(() => {});

  // 2. Refresh keep-alive while user has tab open
  const interval = setInterval(() => {
    fetch(`${API_BASE_URL}/health`).catch(() => {});
  }, 8 * 60 * 1000); // 8 minutes

  return () => clearInterval(interval);
}, []);
```

---

## 3. Stellar Testnet Constants

```typescript
export const STELLAR_TESTNET = {
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  usdc: {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
  },
  explorerTxUrl: "https://stellar.expert/explorer/testnet/tx",
  circleFaucetUrl: "https://faucet.circle.com/"
};
```

---

## 4. Wallet Authentication & Handshake Flow

ChatPay is **non-custodial**: the backend never handles secret keys. User identity is established by signing a single-use cryptographic challenge with the user's Stellar wallet (Freighter / Stellar Wallets Kit).

```
[ Frontend ]                                               [ Backend ]
     │                                                          │
     │ 1. POST /auth/challenge { publicKey }                    │
     ├─────────────────────────────────────────────────────────►│
     │ ◄────────────────────────────────────────────────────────┤
     │   Returns { challenge, nonce, expiresAt }                │
     │                                                          │
     │ 2. Wallet Signs Challenge text in browser:               │
     │    signature = await wallet.signMessage(challenge)       │
     │                                                          │
     │ 3. POST /auth/verify { publicKey, signature, nonce }     │
     ├─────────────────────────────────────────────────────────►│
     │ ◄────────────────────────────────────────────────────────┤
     │   Returns { token, user: { id, publicKey } }             │
     │                                                          │
     │ 4. Store token in memory / localStorage                  │
     │    Send as 'Authorization: Bearer <token>'               │
     │    or in Socket.IO handshake: { auth: { token } }        │
```

### Complete Code Snippet (Frontend Wallet Auth):

```typescript
import { isConnected, getPublicKey, signMessage } from "@stellar/freighter-api";

export async function loginWithFreighter(): Promise<string> {
  // 1. Verify Freighter is connected
  const connected = await isConnected();
  if (!connected) throw new Error("Freighter wallet extension not detected");

  const publicKey = await getPublicKey();

  // 2. Request single-use challenge from backend
  const chalRes = await fetch(`${API_BASE_URL}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey })
  });
  if (!chalRes.ok) throw new Error("Failed to get authentication challenge");
  const { challenge, nonce } = await chalRes.json();

  // 3. User signs challenge inside wallet extension
  const signedBuffer = await signMessage(challenge);
  const signature = Buffer.from(signedBuffer).toString("base64");

  // 4. Verify signature and obtain JWT session token
  const verifyRes = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey, signature, nonce })
  });
  if (!verifyRes.ok) throw new Error("Challenge verification failed");
  const { token, user } = await verifyRes.json();

  localStorage.setItem("chatpay_session_token", token);
  return token;
}
```

---

## 5. Wallet Balances & Trustline Status

Fetch the connected account's XLM & USDC balances directly from the backend:

```http
GET /me/wallet
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "publicKey": "GA5Z...",
  "exists": true,
  "nativeBalance": "99.8999900",
  "usdcBalance": "50.0000000",
  "hasUsdcTrustline": true
}
```

* **If `exists === false`**: Show prompt to fund account using Friendbot (`https://friendbot.stellar.org?addr={publicKey}`).
* **If `hasUsdcTrustline === false`**: Show a "Enable USDC" button so the user adds a trustline in Freighter before receiving/sending USDC.

---

## 6. Recipient Address Book API

Users send payments using aliases (e.g. "Send 10 USDC to Alex"). The address book resolves aliases to Stellar addresses.

| Method | Endpoint | Description | Payload / Query |
| :--- | :--- | :--- | :--- |
| `GET` | `/recipients` | List all saved recipients | None |
| `POST` | `/recipients` | Add new recipient | `{ "alias": "Alex", "address": "G..." }` |
| `PATCH` | `/recipients/:id` | Edit recipient | `{ "alias"?: "Alexander", "address"?: "G..." }` |
| `DELETE` | `/recipients/:id` | Remove recipient | None |

> [!NOTE]
> Aliases are unique per user and case-insensitive. Adding your own wallet address as a recipient returns a `SELF_TRANSFER_NOT_ALLOWED` error.

---

## 7. Natural-Language Command Processing (Chat UI)

When the user types a command in chat (e.g., `"Send 10 USDC to Alex"`, `"pay Alex 25"`, `"$50 to Bob"`):

```http
POST /commands
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Send 10 USDC to Alex",
  "clientMsgId": "3b24119c-c9d3-4a16-928e-8a2bf6132712"
}
```

### The 4 Response Types:

#### Case A: `preview` (Valid payment ready for wallet approval)
```json
{
  "type": "preview",
  "message": "Preview created to send 10.0000000 USDC to Alex",
  "preview": {
    "paymentId": "7df4e6c1-4b72-4d22-8d76-9d7a9657f2bc",
    "recipientAlias": "Alex",
    "recipientAddress": "GBBD4...",
    "amount": "10.0000000",
    "asset": "USDC",
    "estimatedFee": "100",
    "memo": "chatpay:Alex",
    "expiresAt": "2026-10-14T20:25:00.000Z",
    "unsignedXdr": "AAAAAgAAAAD...",
    "warnings": []
  }
}
```
*Frontend Action*: Render a **Transaction Preview Card** displaying recipient, amount, fee, and an **"Approve & Sign"** button.

#### Case B: `clarify` (Incomplete or ambiguous command)
```json
{
  "type": "clarify",
  "message": "Multiple recipients match 'Alex'. Did you mean Alex Smith or Alex Rivera?",
  "options": ["Alex Smith", "Alex Rivera"]
}
```
*Frontend Action*: Render clickable quick-reply buttons with the suggested options.

#### Case C: `needs_recipient` (Alias not in user's address book)
```json
{
  "type": "needs_recipient",
  "alias": "David",
  "message": "Recipient 'David' was not found in your address book. Please add them first before sending."
}
```
*Frontend Action*: Render an **"Add David to Address Book"** quick action modal.

#### Case D: `error`
```json
{
  "type": "error",
  "code": "INSUFFICIENT_FUNDS",
  "message": "Insufficient USDC balance (available: 5.0000000 USDC, required: 10.0000000 USDC)"
}
```
*Frontend Action*: Render bot message with error explanation.

---

## 8. Payment Signing & On-Chain Submission

Once the user reviews the preview card and clicks **"Approve & Sign"**:

```typescript
import { signTransaction } from "@stellar/freighter-api";

export async function approveAndSubmitPayment(preview: {
  paymentId: string;
  unsignedXdr: string;
}) {
  // 1. Hand unsigned XDR to Freighter for user confirmation
  const signedXdr = await signTransaction(preview.unsignedXdr, {
    networkPassphrase: STELLAR_TESTNET.networkPassphrase
  });

  // 2. Submit signed XDR to backend
  const res = await fetch(`${API_BASE_URL}/payments/${preview.paymentId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ signedXdr })
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || "Payment submission failed");
  }

  const result = await res.json();
  // Returns: { paymentId, status: "confirmed" | "submitted", txHash, explorerUrl }
  return result;
}
```

---

## 9. Real-Time WebSockets Integration (Socket.IO)

Using WebSockets provides real-time chat replies, streaming preview cards, and instant transaction confirmation updates without manual polling.

### Client Connection Setup:

```typescript
import { io, Socket } from "socket.io-client";

export function createChatSocket(token: string): Socket {
  const socket = io(API_BASE_URL, {
    auth: { token },
    timeout: 60000, // 60s timeout for cold start resiliency
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // Listen for incoming messages
  socket.on("message:new", (msg) => {
    // msg: { id, seq, role: "system"|"user", type, payload, createdAt }
    console.log("New chat message:", msg);
  });

  // Listen for preview card events
  socket.on("payment:preview", (preview) => {
    console.log("Payment preview ready for signing:", preview);
  });

  // Listen for status changes (submitted -> confirmed -> failed)
  socket.on("payment:status", (statusUpdate) => {
    // { paymentId, status: "confirmed", txHash, explorerUrl, amount, asset }
    console.log("Payment status updated:", statusUpdate);
  });

  return socket;
}
```

### Sending Messages via Socket:
```typescript
socket.emit("command:send", {
  text: "Send 10 USDC to Alex",
  clientMsgId: crypto.randomUUID()
});
```

### Reconnecting & Catching Up Missed Messages:
When recovering from a network drop, send the last received message sequence:
```typescript
socket.emit("sync:request", { lastSeq: lastSeenSeq }, (res) => {
  if (res.success) {
    // res.messages contains all missed messages in order
  }
});
```

---

## 10. Standard Error Codes Reference

All REST errors adhere to `{ code: string, message: string, details?: unknown }`:

| Code | Explanation | Suggested Frontend Action |
| :--- | :--- | :--- |
| `UNAUTHORIZED` | Token missing, invalid, or expired | Redirect to wallet login screen |
| `VALIDATION_FAILED` | Input payload validation error | Check field formats |
| `AMBIGUOUS_RECIPIENT` | Multiple aliases matched command | Show clarification picker |
| `UNKNOWN_RECIPIENT` | Alias not in address book | Prompt to add recipient |
| `UNSUPPORTED_ASSET` | Asset other than USDC/XLM | Notify user of supported tokens |
| `AMOUNT_OUT_OF_RANGE` | Zero, negative, >7 decimals, or >1,000 | Show validation hint |
| `SELF_TRANSFER_NOT_ALLOWED` | Sending to own address | Warn user cannot self-pay |
| `NO_TRUSTLINE` | Sender or recipient lacks USDC trustline | Show "Enable USDC Trustline" button |
| `DESTINATION_UNFUNDED` | Recipient account does not exist | Warn account needs funding |
| `INSUFFICIENT_FUNDS` | Not enough USDC or XLM for fees | Prompt user to request testnet funds |
| `PREVIEW_EXPIRED` | 300s signing window elapsed | Prompt user to re-generate preview |
| `XDR_MISMATCH` | Envelope tampered or altered | Security warning: reject transaction |
| `SUBMIT_FAILED` | Horizon ledger error | Display failure reason and retry button |
