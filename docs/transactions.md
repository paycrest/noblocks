# Transactions System

This document explains how transactions are handled in the Noblocks application, covering onramp orders, cross-chain bridges, refunds, and transaction history management.

## Overview

Noblocks uses Supabase to store and manage all transactions with Row Level Security (RLS) ensuring users can only access their own data. The system supports multiple transaction types:

| Type | Description | Status States |
|------|-------------|---------------|
| **Onramp** | Crypto deposit → fiat payout | pending_deposit → received → forwarding → fulfilled / refunded |
| **Bridge/Swap** | Cross-chain asset conversion | pending → bridging → completed / failed |
| **Withdrawal** | Fiat disbursement to recipient | processing → sent / failed |

## Transaction Structure

### Core Schema

```typescript
interface Transaction {
  id: UUID;
  user_wallet_address: string;            // User's Privy smart wallet address
  chain_id: number;                       // Source chain (1=ETH, 137=MATIC, etc.)
  chain_type: 'evm' | 'tron';             // Network family
  transaction_type: 'onramp' | 'bridge' | 'withdrawal';
  from_currency: string;                  // e.g., "USDC", "ETH", "TRX"
  to_currency: string;                    // e.g., "NGN", "USD", "USDT"
  amount_sent: decimal;                   // Input amount
  amount_received: decimal;               // Expected output amount
  fee: decimal;                           // Platform fee in USD
  status: TransactionStatus;              // Current state
  payment_order_id?: string;              // Gateway contract order ID
  tx_hash?: string;                       // On-chain transaction hash
  recipient: RecipientInfo;               // Bank/mobile money details
  refund_account?: RefundAccount;         // Optional refund destination
  metadata?: JSONB;                       // Provider-specific data
  created_at: timestamptz;
  updated_at: timestamptz;
}
```

### Refund Account (Required for New Orders)

As of recent updates, all onramp orders require a refund account matching the user's KYC profile:

```typescript
interface RefundAccount {
  account_name: string;                   // Must match KYC profile name exactly
  account_number: string;                 // Bank account or mobile money number
  bank_code?: string;                     // For bank transfers
  bank_name?: string;                     // Display name
  provider: 'bank' | 'mobile_money';      // Transfer type
  country: string;                        // ISO country code
}
```

### Bridge Transaction Extensions

Bridge-specific metadata:

```typescript
interface BridgeTransaction extends Transaction {
  transaction_type: 'bridge';
  from_chain: number;                     // Source chain ID
  to_chain: number;                       // Destination chain ID
  bridge_provider: 'li-fi' | 'near-intents';
  quote_id?: string;                      // LI.FI quote reference
  slippage_bps?: number;                  // User-configured tolerance
  estimated_time_seconds?: number;        // From LI.FI quote
  route_steps?: Array<{                    // Execution path
    exchange: string;
    portion: number;                      // 0-1, fraction of volume
    token_in: string;
    token_out: string;
  }>;
}
```

## API Endpoints

### GET /api/v1/transactions

Fetch paginated transaction history for authenticated user.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
```
?page=1          // Page number (default: 1)
&limit=20        // Items per page (default: 20, max: 100)
&type=onramp     // Filter by type (onramp, bridge, withdrawal)
&status=pending  // Filter by status
&chain=1         // Filter by chain ID
```

**Response:**
```json
{
  "data": [
    {
      "id": "abc123...",
      "transaction_type": "onramp",
      "from_currency": "USDC",
      "to_currency": "NGN",
      "amount_sent": 100,
      "amount_received": 85000,
      "fee": 0.5,
      "status": "fulfilled",
      "chain_id": 1,
      "chain_type": "evm",
      "recipient": {
        "account_name": "John Doe",
        "account_number": "1234567890",
        "provider": "bank"
      },
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

### POST /api/v1/transactions/onramp

Create a new onramp order.

**Request Body:**
```json
{
  "fromCurrency": "USDC",
  "toCurrency": "NGN",
  "amountSent": 100,
  "recipient": {
    "account_name": "John Doe",
    "account_number": "1234567890",
    "bank_code": "02345678",
    "bank_name": "Access Bank",
    "provider": "bank",
    "country": "NG"
  },
  "refundAccount": {
    "account_name": "John Doe",           // MUST match KYC profile name
    "account_number": "0xAbCd...ef12",
    "provider": "external_wallet",
    "country": "GLOBAL"
  },
  "enableChainedForwarding": true,        // Optional: auto-forward to external addr
  "network": "ethereum",
  "chainId": 1
}
```

**Validation Rules:**
- `refundAccount.account_name` must exactly match user's KYC profile name (case-sensitive comparison)
- If chained forwarding is enabled, destination address must be provided
- Amount must exceed minimum threshold for selected currency pair

**Response:**
```json
{
  "success": true,
  "orderId": "ord_xyz789",
  "depositAddress": "0xNoblocksGatewayContract123",
  "depositTokenAddress": "0xUSDCContract456",
  "expectedAmount": "100",
  "expiresAt": "2026-01-15T12:30:00Z",
  "minimumConfirmations": 12
}
```

### POST /api/v1/transactions/bridge

Initiate a cross-chain bridge.

**Request Body:**
```json
{
  "fromToken": "0x...",                   // Source token address
  "toToken": "0x...",                     // Destination token address
  "fromAmount": "1000000000",             // In token decimals
  "fromChainId": 1,                       // Source chain
  "toChainId": 137,                       // Destination chain
  "slippageBps": 50                       // Optional: default from env
}
```

**Response:**
```json
{
  "success": true,
  "quoteId": "lf_quote_abc123",
  "estimatedTimeSeconds": 180,
  "route": [{ "exchange": "Uniswap", "portion": 0.6 }]
}
```

### GET /api/v1/transactions/:id

Get detailed info for a specific transaction.

**Path Parameters:**
- `id`: Transaction UUID

**Response:**
```json
{
  "id": "abc123...",
  "transaction_type": "onramp",
  "payment_order_id": "ord_xyz789",
  "status": "forwarding",
  "timeline": [
    {
      "status": "created",
      "timestamp": "2026-01-15T10:30:00Z",
      "message": "Order created"
    },
    {
      "status": "received",
      "timestamp": "2026-01-15T10:45:00Z",
      "txHash": "0xtxHash123..."
    },
    {
      "status": "forwarding",
      "timestamp": "2026-01-15T10:50:00Z",
      "message": "Auto-forward transaction submitted"
    }
  ]
}
```

### PUT /api/v1/transactions/:id/status

Update transaction status (internal/admin use).

**Note:** Most status transitions are automatic via blockchain callbacks. This endpoint is primarily for manual intervention.

**Request Body:**
```json
{
  "status": "refunded",
  "notes": "Manual refund due to AML flag"
}
```

## Transaction Lifecycle

### Onramp Flow

```
┌─────────────┐
│ PENDING_DEPOSIT │ ← Order created, waiting for user to send crypto
└──────┬──────┘
       │ user sends funds to gateway contract
       ↓
┌─────────────┐
│  RECEIVED   │ ← Deposit confirmed, validation complete
└──────┬──────┘
       │ validation passes
       ↓
┌─────────────┐
│ FORWARDING  │ ← Auto-forward transaction submitting (if chained fwd enabled)
└──────┬──────┘
       │ tx confirmed
       ↓
┌─────────────┐
│  FORWARDED  │ ← Funds at destination address
└──────┬──────┘
       │ PSP disbursement
       ↓
┌─────────────┐
│  FULFILLED  │ ← Recipient received funds
└─────────────┘

Error paths:
FORWARDING ── timeout/fail ──→ REFUNDED
RECEIVED ── AML flag ──→ PENDING_REVIEW ── review ──→ FULFILLED / REFUNDED
```

### Bridge Flow

```
┌─────────────┐
│   PENDING   │ ← Quote obtained, user signed approval
└──────┬──────┘
       │ execute bridge
       ↓
┌─────────────┐
│   BRIDGING  │ ← Transaction executing across chains
└──────┬──────┘
       │ settlement complete
       ↓
┌─────────────┐
│ COMPLETED   │ ← Tokens received on destination chain
└─────────────┘

Error paths:
BRIDGING ── fail/slippage ──→ FAILED
```

## State Management

### Status Enum

```typescript
type TransactionStatus =
  | 'PENDING_DEPOSIT'      // Onramp: waiting for crypto deposit
  | 'RECEIVED'             // Onramp: deposit confirmed
  | 'FORWARDING'           // Onramp: auto-forward tx pending
  | 'FORWARDED'            // Onramp: forwarded to external addr
  | 'FULFILLED'            // All types: complete successfully
  | 'REFUNDED'             // Rejected/expired, funds returned
  | 'PENDING_REVIEW'       // AML/KYC flagged for manual review
  | 'PENDING'              // Bridge: awaiting execution
  | 'BRIDGING'             // Bridge: in-progress
  | 'FAILED';              // Error condition
```

### State Changes API

```typescript
// Client-side helper
async function updateTransactionStatus(
  orderId: string,
  newStatus: TransactionStatus,
  requestID: number
): Promise<void> {
  const response = await fetch(`/api/v1/transactions/${orderId}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`
    },
    body: JSON.stringify({
      status: newStatus,
      requestID,                            // Prevents race conditions
      timestamp: Date.now()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
}
```

### Race Condition Prevention

To handle concurrent status updates, the system uses request IDs:

```typescript
let currentRequestId = 0;

async function setStatusWithPrevention(orderId: string, status: TransactionStatus) {
  const requestId = ++currentRequestId;

  // Store the request ID before making the call
  localStorage.setItem(`lastRequestId_${orderId}`, requestId.toString());

  await updateTransactionStatus(orderId, status, requestId);

  // Check if this was the latest request
  const currentStoredId = localStorage.getItem(`lastRequestId_${orderId}`);
  if (requestId !== parseInt(currentStoredId || '0')) {
    console.warn('Stale status update ignored');
    return;
  }
}
```

## Webhooks & Callbacks

### Blockchain Deposit Listener

Server listens for deposits via polling or webhook:

```typescript
// Polling approach (simpler setup)
async function pollForDeposits(): Promise<void> {
  const pendingOrders = await db.transactions.findMany({
    where: { status: 'PENDING_DEPOSIT' }
  });

  for (const order of pendingOrders) {
    const depositTx = await checkDepositReceived(order.depositAddress);

    if (depositTx) {
      // Run fraud screening
      const fraudResult = await runFraudCheck(depositTx.sender);

      // Update status based on fraud check result
      const nextStatus = fraudResult.requiresReview ? 'PENDING_REVIEW' : 'RECEIVED';

      await db.transactions.update(order.id, {
        status: nextStatus,
        txHash: depositTx.hash,
        amountReceived: depositTx.amount,
        fraudCheckResult: fraudResult
      });
    }
  }
}

// Self-scheduling loop to prevent overlapping runs
async function startDepositPolling() {
  while (true) {
    try {
      await pollForDeposits();
    } catch (error) {
      console.error('Deposit polling error:', error);
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// Start the polling loop
startDepositPolling();
```

### Aggregator Callback Handler

Handle incoming order updates from Paycrest aggregator:

```typescript
// POST /api/v1/aggregator/callback
export async function aggregatorCallback(req: Request) {
  const { order_id, status, data } = await req.json();

  // Validate signature
  const isValid = await verifyAggregatorSignature(req);
  if (!isValid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Map aggregator status to internal status
  const statusMap: Record<string, TransactionStatus> = {
    'validated': 'FULFILLED',
    'settled': 'FULFILLED',
    'fulfilled': 'FULFILLED',
    'refunded': 'REFUNDED',
    'cancelled': 'REFUNDED'
  };

  const newStatus = statusMap[status];
  if (!newStatus) {
    throw new Error(`Unknown aggregator status: ${status}`);
  }

  await db.transactions.updateByOrderId(order_id, {
    status: newStatus,
    metadata: { aggregator_data: data }
  });

  // Notify user via WebSocket/email
  await notifyUser(order_id, { status: newStatus });

  return Response.json({ acknowledged: true });
}
```

## Security

### Row Level Security

Supabase RLS policies ensure isolation:

```sql
-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Users can view only their own transactions
CREATE POLICY "user_select_own_transactions"
  ON transactions FOR SELECT
  USING (
    auth.jwt()->>'sub' = user_wallet_address OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.wallet_address = transactions.user_wallet_address
    )
  );

-- Users can insert for their own wallet
CREATE POLICY "user_insert_own_transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    auth.jwt()->>'sub' = user_wallet_address OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.wallet_address = transactions.user_wallet_address
    )
  );

-- Only admins can update status manually
CREATE POLICY "admin_update_transactions"
  ON transactions FOR UPDATE
  TO service_role
  USING (true);  -- Service role bypasses RLS
```

### Rate Limiting

Protect against abuse:

```typescript
import rateLimit from 'express-rate-limit';

const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 requests per minute per IP/user
  message: { error: 'Too many transaction requests' },
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/api/v1/transactions', transactionLimiter, createTransactionHandler);
```

## Fraud Detection Integration

All transactions trigger automatic fraud checks:

```typescript
async function runFraudCheck(senderAddress: string): Promise<FraudResult> {
  const shieldResult = await shield3.screen({
    address: senderAddress,
    entityType: 'ADDRESS'
  });

  const velocityOk = await checkVelocityLimits(senderAddress);

  return {
    riskLevel: shieldResult.riskLevel,
    sanctionsMatched: shieldResult.isSanctioned,
    velocityExceeded: !velocityOk,
    requiresReview: shieldResult.riskLevel === 'HIGH' || !velocityOk
  };
}
```

If fraud flags detected, transaction moves to `PENDING_REVIEW` for manual analyst approval.

## Error Handling

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid amount, missing fields |
| 401 | Unauthorized | Missing/wrong JWT token |
| 403 | Forbidden | Wallet address mismatch |
| 404 | Not Found | Transaction/order doesn't exist |
| 409 | Conflict | Order already processed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected failure |

### Common Errors

```typescript
const ERROR_MESSAGES = {
  AMOUNT_TOO_LOW: 'Minimum deposit amount is $10 equivalent',
  INSUFFICIENT_FUNDS: 'Your wallet balance is insufficient',
  NETWORK_NOT_SUPPORTED: 'This network is not currently supported',
  KYC_REQUIRED: 'Please complete KYC verification first',
  REFUND_NAME_MISMATCH: 'Refund account name must match your KYC profile',
  ORDER_EXPIRED: 'This order has expired, please create a new one',
  DEPOSIT_ADDRESS_INVALID: 'Invalid deposit address provided',
  CHAIN_FORWARDING_DISABLED: 'Chained forwarding is not available for this order'
};
```

## Frontend Integration

### Transaction History Component

```tsx
import { useTransactions } from '@/hooks/useTransactions';

function TransactionHistory() {
  const { transactions, loading, error, page, setPage } = useTransactions();

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="transaction-list">
      <h2>Transaction History</h2>

      {transactions.map(tx => (
        <TransactionCard key={tx.id} transaction={tx} />
      ))}

      <Pagination
        currentPage={page}
        totalPages={Math.ceil((transactions as any).pagination?.total || 0)}
        onPageChange={setPage}
      />
    </div>
  );
}
```

### UseTransactions Hook

```typescript
export function useTransactions(filters?: TransactionFilters) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function fetchTransactions() {
      try {
        setLoading(true);
        const queryParams = new URLSearchParams({
          page: page.toString(),
          limit: '20',
          ...filters
        }).toString();

        const res = await fetch(`/api/v1/transactions?${queryParams}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` }
        });

        if (!res.ok) throw new Error('Failed to fetch transactions');

        const result = await res.json();
        if (!cancelled) {
          setData(result.data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTransactions();

    return () => { cancelled = true; };
  }, [page, filters]);

  return { transactions: data, loading, error, page, setPage };
}
```

## Related Documentation

- [Environment Variables](environment-variables.md) – Transaction configs
- [Wallet Integration](wallet-integration.md) – Wallet contexts
- [Chained Forwarding](chained-forwarding.md) – Auto-forward feature details
- [Fraud Protection](fraud-protection.md) – Compliance integration
