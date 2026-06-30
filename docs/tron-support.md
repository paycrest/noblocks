# Tron Network Support

Noblocks now supports deposits and withdrawals on the Tron blockchain, including TRX native tokens and TRC20 tokens (USDT, USDC, etc.). This integration enables users to leverage Tron's low fees and fast transaction speeds for onramp operations.

## Overview

Tron support includes:
- **Native TRX deposits**: Send TRX directly to your Noblocks address
- **TRC20 token deposits**: USDT(TRC20), USDC(TRC20), and other compatible tokens
- **Gas sponsorship**: Built-in handling via sponsor wallet for certain operations
- **Full wallet integration**: View balance, send transactions, manage keys

## Architecture

```
┌─────────────────────────┐
│   Noblocks Wallet UI    │ ← User interacts with TronWeb provider
└─────────────────────────┘
           ↓
┌─────────────────────────┐
│   TronWeb Provider      │ ← Browser TronLink or embedded wallet
└─────────────────────────┘
           ↓
┌─────────────────────────┐
│   Tron Blockchain       │ ← Mainnet endpoint (full node)
└─────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Tron network RPC endpoints
NEXT_PUBLIC_RPC_URL_TRON=https://api.trongrid.io
NEXT_PUBLIC_RPC_URL_TRON_SHARD0=https://tron-rpc.com

# Private key for deposit processing (server-side, keep secure)
TRON_DEPOSIT_PRIVATE_KEY=0x...

# Tron network configuration
TRON_NETWORK_ID=0 (#41 = mainnet, #2 = testnet)
TRON_CONTRACT_ADDRESS=0x...  # Gateway contract for Tron
```

### Prerequisites

To run Tron locally:
1. Install `tronweb` package: `pnpm add tronweb`
2. Set up TronLink browser extension (optional, for injected provider)
3. Configure Tron full node access via API provider (e.g., TronGrid)

## Supported Tokens

| Token | Type | Contract Address | Decimals | Notes |
|-------|------|------------------|----------|-------|
| TRX | Native | - | 6 | Base currency, required for bandwidth |
| USDT | TRC20 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 | Most common stablecoin |
| USDC | TRC20 | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 | Circle-backed stablecoin |
| WBTC | TRC20 | `TKzxdSv2FZKQrEqkQPgzUUCERExsFsTsDe` | 8 | Wrapped Bitcoin |
| WIN | TRC20 | `TWzh9MNsMsDgXkLiWANFKhZx9RxxEMyCqx` | 6 | TronPower token |

*Note: Additional tokens can be added by registering their TRC20 contracts.*

## Wallet Integration

### Client-Side Setup

```typescript
import { useState, useEffect } from 'react';
import { useTronWallet } from '@/hooks/useTronWallet';

function TronWalletButton() {
  const { isConnected, account, connect, disconnect } = useTronWallet();

  return (
    <div>
      {isConnected ? (
        <div className="flex items-center gap-2">
          <span>{truncateAddress(account)}</span>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      ) : (
        <button onClick={connect}>Connect Tron Wallet</button>
      )}
    </div>
  );
}
```

### useTronWallet Hook

Key functionality provided by the Tron wallet hook:

```typescript
interface TronWalletContextType {
  isConnected: boolean;
  account: string | null;
  balance: bigint;                    // In SUN (1 TRX = 1,000,000 SUN)
  connect: () => Promise<void>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (transaction: TRXTransfer) => Promise<string>;
}
```

Implementation highlights:

```typescript
// Detect TronLink injection
const detectTronProvider = (): TronExt | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).tronWeb;
};

// Connect to wallet
const connect = async (): Promise<void> => {
  if (!window.tronWeb) {
    throw new Error('TronLink not installed');
  }

  const accounts = await window.tronWeb.request({ method: 'tron_requestAccounts' });
  setAccount(accounts[0]);

  // Check balance
  const balance = await window.tronWeb.trx.getBalance(accounts[0]);
  setBalance(BigInt(balance.toString()));
  setIsConnected(true);
};

// Sign message for KYC
const signMessage = async (message: string): Promise<string> => {
  if (!account || !window.tronWeb) {
    throw new Error('Not connected');
  }

  const hexMessage = `0x${Buffer.from(message).toString('hex')}`;
  return window.tronWeb.trx.sign(hexMessage, account);
};
```

### Server-Side Integration

Server handles deposit validation and balance tracking:

```typescript
// GET /api/v1/wallet/tron/address
export async function GET(request: Request) {
  const userId = getAuthUserId();
  if (!userId) throw new UnauthorizedError();

  const userWallet = await getUserWallet(userId, CHAIN_TRON);
  return Response.json({ address: userWallet?.address });
}

// POST /api/v1/wallet/tron/deposit/callback
export async function POST(request: Request) {
  const { txHash, address, amount, token } = await request.json();

  // Verify transaction on-chain
  const tx = await tronWeb.trx.getTransaction(txHash);
  if (!tx) throw new NotFoundError('Transaction not found');

  // Validate sender matches user wallet
  if (tx.raw_data.contract[0].parameter.value.to_address !== address) {
    throw new ValidationError('Sender mismatch');
  }

  // Record deposit event
  await recordDeposit({
    chain: CHAIN_TRON,
    txHash,
    amount,
    token,
    status: 'CONFIRMED'
  });

  return Response.json({ success: true });
}
```

## Deposit Flow

### Step 1: Generate Address

User clicks "Deposit" → System generates or retrieves Tron address:

```typescript
async function getOrGenerateDepositAddress(
  userId: string,
  chain: ChainId
): Promise<string> {
  let wallet = await getUserWallet(userId, chain);

  if (!wallet) {
    // Generate new address using TronWeb
    const keyPair = tronWeb.q.crypto.generateKeyPair();
    const address = tronWeb.address.fromPrivateKey(keyPair.privateKey);

    wallet = await createUserWallet(userId, chain, {
      address,
      privateKeyEncrypted: encrypt(keyPair.privateKey)
    });
  }

  return wallet.address;
}
```

### Step 2: User Sends Funds

User initiates transfer via TronLink:
1. Selects amount and recipient (Noblocks address)
2. Signs transaction in TronLink popup
3. Transaction broadcast to Tron network

Energy/Bandwidth consideration:
- Native TRX transfers cost ~0.5 bandwidth + energy
- TRC20 transfers require additional energy (~15,000-40,000)
- Users need some TRX in wallet for initial transaction fees

### Step 3: Confirmation

System listens for incoming deposits:
1. Poll TronGrid API or use webhook listener
2. Confirm transaction has sufficient block confirmations (typically 19 blocks)
3. Update order status to RECEIVED

Example confirmation check:

```typescript
async function waitForConfirmation(txHash: string, minBlocks: number = 19) {
  const startTime = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < timeout) {
    const tx = await tronWeb.trx.getTransactionInfo(txHash);

    if (!tx || tx.confirmed) {
      const blockNum = tx.blockNumber;
      const latest = await tronWeb.trx.getBlockLatestConfirmed();

      if (latest.block_header.raw_data.number - blockNum >= minBlocks) {
        return tx;
      }
    }

    await sleep(3000); // Wait 3 seconds between checks
  }

  throw new TimeoutError('Transaction confirmation timeout');
}
```

## Withdrawal Flow

Tron withdrawals work through the same fulfillment pipeline as other chains:

```typescript
// Server processes withdrawal request
async function processTronWithdrawal(order: Order): Promise<void> {
  const destinationAddress = order.recipientAddress;
  const amount = order.amount;

  // Use treasury wallet to send funds
  const treasuryPrivKey = getTreasuryPrivateKey(CHAIN_TRON);
  const result = await tronWeb.sendToken(
    treasuryAddress,
    treasuryPrivKey,
    destinationAddress,
    amount,
    tokenContractAddress
  );

  // Update order status
  await updateOrderStatus(order.id, 'FULFILLED', { txHash: result.txid });
}
```

## Testing with Testnet

Test Tron integration before mainnet deployment:

```bash
# Use Shasta testnet
NEXT_PUBLIC_RPC_URL_TRON=https://shasta.trongrid.io

# Get test TRX from faucet
# Visit: https://shasta.tron.network/faucet
```

Testing checklist:
- [ ] Connect to TronLink testnet
- [ ] Receive test TRX deposits
- [ ] Trigger refund flow
- [ ] Validate error handling for invalid addresses
- [ ] Monitor gas sponsorship limits

## Security Considerations

### Key Management

- **Deposit private keys**: Encrypted at rest using AES-256-GCM
- **Treasury keys**: Hardware security module (HSM) or vault service
- **Never commit** private keys to version control

```typescript
// Encryption helper
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string, key: Buffer): { cipher: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    cipher: encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
}
```

### Address Validation

Validate all addresses before processing:

```typescript
function isValidTronAddress(address: string): boolean {
  try {
    return tronWeb.address.isBase58CheckAddress(address);
  } catch {
    return false;
  }
}

function validateTRC20Transfer(params: {
  from: string;
  to: string;
  amount: string;
  contract: string;
}): boolean {
  return (
    isValidTronAddress(params.from) &&
    isValidTronAddress(params.to) &&
    isPositiveInteger(params.amount) &&
    isValidTRC20Contract(params.contract)
  );
}
```

### Rate Limiting

Prevent abuse with per-address rate limits:

```typescript
const TRON_DEPOSIT_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 50            // Max 50 deposits per hour per address
};
```

## Troubleshooting

### "Transaction pending but not confirmed"

**Causes:**
- Network congestion on Tron
- Insufficient energy/bandwidth
- Double-spend attempt detection

**Solutions:**
1. Wait for block confirmations (typically 3-5 blocks = 15-25 seconds)
2. Check TronScan for transaction details
3. Verify sender had sufficient resources

### "Invalid TRC20 token"

**Causes:**
- Wrong contract address used
- Token not registered in system
- Decimals mismatch

**Fix:**
```typescript
// Verify token registration
const tokenConfig = TOKEN_CONFIGS.find(t => t.symbol.toUpperCase() === symbol);
if (!tokenConfig) {
  throw new Error(`Token ${symbol} not supported`);
}
```

### "Insufficient bandwidth/energy"

**Solutions:**
- Users can stake TRX for bandwidth delegation
- Ensure wallet has sufficient TRX for energy/bandwidth costs

## Related Documentation

- [Environment Variables](environment-variables.md) – Tron configuration options
- [Wallet Integration](wallet-integration.md) – Multi-chain wallet patterns
