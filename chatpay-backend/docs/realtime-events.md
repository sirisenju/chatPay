# ChatPay Socket.IO Real-Time Event Contract

This document specifies the WebSockets real-time protocol between the ChatPay frontend and the ChatPay backend gateway.

## 1. Connection & Handshake Authentication

The Socket.IO connection must supply the JWT session token acquired from `POST /auth/verify`.

```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: {
    token: sessionJwtToken // Bearer token string
  }
});
```

- If valid: Server assigns socket to isolated room `user:<userId>`.
- If invalid or expired: Server rejects connection with error `"Invalid or expired authentication token"`.

---

## 2. Client-to-Server Events

### A. `command:send`
Dispatches a natural-language payment command.

**Payload:**
```typescript
{
  text: string;          // e.g. "Send 10 USDC to Alex"
  clientMsgId?: string;  // Unique client-generated ID for idempotency (UUID)
}
```

**Server Actions:**
1. Emits `payment:preview` if command is successfully validated and preview is built.
2. Emits `message:new` with the response card or clarification.
3. Invokes optional acknowledgement callback `{ success: boolean, result?: CommandResponse, error?: string }`.

---

### B. `payment:submit`
Submits a wallet-signed transaction envelope XDR for execution on the Stellar Testnet.

**Payload:**
```typescript
{
  paymentId: string;     // UUID of the previewed payment
  signedXdr: string;     // Base64-encoded signed Stellar envelope XDR
}
```

**Server Actions:**
1. Cryptographically and structurally verifies signed XDR against stored preview.
2. Submits to Stellar Horizon Testnet.
3. Emits `payment:status` to room.
4. Invokes acknowledgement callback `{ success: boolean, result?: PaymentSubmissionResult, error?: string }`.

---

### C. `sync:request`
Requests synchronization/replay of chat messages after a connection drop.

**Payload:**
```typescript
{
  lastSeq?: number;      // Last seen integer message sequence number (default 0)
}
```

**Server Response:**
Emits `sync:response` with `{ messages: ChatMessage[] }` or executes ack callback.

---

## 3. Server-to-Client Events

### A. `message:new`
Emitted whenever a new chat message or bot response is added to the conversation.

**Payload:**
```typescript
{
  id: string;
  seq: number;
  role: "user" | "system";
  type: "text" | "preview" | "clarify" | "needs_recipient" | "status" | "error";
  payload: Record<string, unknown>;
  createdAt: string;
}
```

---

### B. `payment:preview`
Emitted immediately when a valid payment command is converted into an unsigned Stellar transaction preview.

**Payload:**
```typescript
{
  paymentId: string;
  recipientAlias: string;
  recipientAddress: string;
  amount: string;
  asset: string;
  estimatedFee: string;
  memo?: string;
  expiresAt: string;       // ISO 8601 string (300s window)
  unsignedXdr: string;     // Transaction XDR for Freighter/Wallets Kit to sign
  warnings: string[];
}
```

---

### C. `payment:status`
Emitted when a transaction's status transitions (`submitted`, `confirmed`, `failed`, `expired`).

**Payload:**
```typescript
{
  paymentId: string;
  status: "submitted" | "confirmed" | "failed" | "expired";
  txHash?: string;
  explorerUrl?: string;    // Stellar Expert URL
  amount?: string;
  asset?: string;
  recipientAlias?: string;
  code?: string;           // Present on failure
  message?: string;
}
```
