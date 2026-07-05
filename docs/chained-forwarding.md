# Chained Forwarding (Onramp)

Chained forwarding enables crypto onramps to settle to the user's Noblocks wallet first, then automatically forward funds to a custom destination address. This feature provides flexibility for users who want custody of incoming funds before final disposition.

## Overview

When chained forwarding is enabled:

1. User deposits crypto to their **Noblocks-managed smart wallet**
2. System validates deposit and marks order as received
3. Client-signed transaction **auto-forwards** the crypto to user's chosen destination
4. Forwarding is **gas-sponsored** by Noblocks (user pays no gas)

This approach contrasts with direct-onramp settlement where crypto would go straight to an external address (no Noblocks custody).

## Use Cases

- **Tax planning**: Users want crypto in their wallet before deciding where to send
- **Multi-sig workflows**: Intermediate custody for approval processes
- **Portfolio management**: Consolidate multiple onramp deposits before rebalancing
- **Compliance workflows**: Hold period requirements before disbursement

## Architecture

```
┌─────────────────┐     Deposit      ┌──────────────────────┐
│   User Wallet   │ ───────────────→ │  Noblocks Smart      │
│                 │                  │  Contract Address    │
└─────────────────┘                  └──────────────────────┘
                                               │
                                              (hold)
                                               │
                                    ┌──────────┴──────────┐
                                    │ Auto-forward trigger│
                                    │ (client-signed tx)  │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ↓                          ↓                          ↓
         ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
         │ Bank Transfer    │       │ Mobile Money     │       │ External Wallet  │
         │ (via Paycrest)   │       │ (via PSPs)       │       │ (user's choice)  │
         └──────────────────┘       └──────────────────┘       └──────────────────┘
```

## Configuration

Enable chained forwarding in your environment:

```bash
# Enable chained forwarding UI and API routes
NEXT_PUBLIC_ONRAMP_CHAINED_FORWARDING_ENABLED=true
```

## User Flow

### Step 1: Initiate Onramp Order

User selects "Chained Forwarding" option during order creation and provides:
- **Destination Address**: Where final funds should go (may differ from deposit address)
- **Asset Type**: Which token/currency to forward (USDC, ETH, etc.)

### Step 2: Deposit Crypto

User sends cryptocurrency to their generated Noblocks smart wallet address. The contract receives:
- Original amount
- Sender information (for KYC linkage)
- Order ID metadata

### Step 3: Validation & Confirmation

System validates:
- Deposit amount matches order
- Token is whitelisted
- Sender passes AML screening
- No fraud flags raised

Once validated, order status updates to `RECEIVED` and forwarding queue triggers.

### Step 4: Auto-Forward Transaction

Client generates a signed forwarding transaction:
- From: User's Noblocks wallet
- To: User's configured destination
- Amount: Full received balance (minus network fees)

Gas sponsorship:
- Sponsored transaction via Noblocks wallet
- User doesn't pay any ether/token for forwarding

Transaction is submitted immediately after validation.

### Step 5: Destination Receipt

Funds arrive at destination address:
- Same chain (instant or near-instant)
- Wrapped if needed (e.g., WETH on L2)
- Status update triggers webhook/callback

## API Reference

### GET `/api/v1/onramp/forwarding-config`

Get user's current forwarding configuration.

**Response:**
```json
{
  "enabled": true,
  "destinationAddress": "0x...",
  "chainId": 1,
  "createdAt": "2026-01-15T10:30:00Z",
  "lastUsedAt": "2026-01-20T14:22:00Z"
}
```

### POST `/api/v1/onramp/configure-forwarding`

Set or update forwarding destination.

**Request Body:**
```json
{
  "destinationAddress": "0x123...",
  "chainId": 1,
  "asset": "USDC"
}
```

**Validation:**
- Address must be valid for specified chain
- Chain must be supported
- Asset must be accepted by aggregator

**Response:**
```json
{
  "success": true,
  "configId": "cfg_abc123",
  "message": "Forwarding destination updated"
}
```

### POST `/api/v1/onramp/initiate-forwarding`

Manually trigger forwarding (for retry scenarios).

**Request Body:**
```json
{
  "orderId": "ord_xyz789",
  "destinationAddress": "0x..."
}
```

**Response:**
```json
{
  "txHash": "0x...",
  "status": "pending",
  "estimatedCompletionSeconds": 30
}
```

## Smart Contract Integration

The Noblocks Gateway Contract (Paycrest repository) handles:
- Receiving deposits with order metadata
- Holding funds until forwarding triggered
- Emitting events for validation callbacks

Key contract events:
```solidity
event DepositReceived(
    address indexed sender,
    address indexed orderCreator,
    bytes32 orderId,
    uint256 amount,
    uint8 tokenId,
    uint256 timestamp
);

event ForwardingInitiated(
    bytes32 indexed orderId,
    address indexed fromWallet,
    address destination,
    uint256 amount
);
```

## State Management

Order states relevant to chaining:

| State | Meaning | Forwarding Status |
|-------|---------|-------------------|
| `PENDING_DEPOSIT` | User hasn't sent yet | Not applicable |
| `RECEIVED` | Deposit confirmed | Forwarding queued |
| `FORWARDING` | Tx pending/submitted | In progress |
| `FORWARDED` | Funds at destination | Complete |
| `REFUNDED` | Failed → returned to sender | N/A |

Error recovery flows:
- **Forwarding fails**: Refund to original sender after timeout
- **Invalid destination**: Lock in compliance review state
- **Amount mismatch**: Partial refund + manual review

## Security Features

### Name Matching Requirement

As of recent updates, refund account names must match the user's verified KYC profile name:

```typescript
// Server-side validation
const kycProfile = await getKYCProfile(userId);
if (refundAccountName !== kycProfile.fullName) {
  throw new Error('Refund account name must match KYC profile');
}
```

### Gas Sponsorship Limits

Gas sponsorship for auto-forward transactions uses EIP-7702 via the Noblocks sponsor wallet.

Configuration:
```bash
# Sponsor wallet private key (server-side, keep secure)
SPONSOR_EVM_WALLET_PRIVATE_KEY=0x...
PRIVATE_KEY=0x...  # Alternative environment variable name
```

The sponsored execution enforces:
- Max gas per forwarding transaction
- Daily spend limits per wallet
- Allowlisted spender addresses

## Troubleshooting

### Forwarding Stuck in "FORWARDING" State

**Check:**
1. Network congestion on source chain
2. Gas sponsorship allowance remaining
3. Destination address validity

**Resolution:**
- Wait 5-10 minutes for confirmations
- Check transaction status via block explorer
- Retry via API if stuck > 30 minutes

### Invalid Destination Error

**Causes:**
- Address checksum error
- Wrong chain selection
- Unsupported token standard

**Fix:**
1. Verify address format for target chain
2. Confirm chain compatibility
3. Ensure destination wallet supports receiving tokens

### Gas Sponsorship Failed

**Symptoms:** User sees gas prompt instead of free forwarding

**Diagnosis:**
- Check sponsor wallet balance
- Verify SPONSOR_EVM_WALLET_PRIVATE_KEY is configured
- Review error message from bundled transaction

**Fix:**
- Ensure sponsor wallet has sufficient funds
- Contact admin if issue persists
- Temporary manual forwarding may be required

## Related Documentation

- [Environment Variables](environment-variables.md) – Feature flags and configs
- [Fraud Protection](fraud-protection.md) – AML screening integration
- [Transactions](transactions.md) – Order lifecycle overview
