# Cross-Chain Bridge / Swap

The Noblocks Bridge allows users to convert and bridge assets across different blockchain networks using a combination of NEAR Intents 1Click API and LI.FI aggregation.

## Overview

The bridge provides:
- **Cross-chain swaps**: Convert tokens on one chain to another (e.g., ETH on Ethereum → USDC on Polygon)
- **In-wallet conversion**: Seamless swap experience without leaving the wallet
- **Rate aggregation**: Best rates from multiple liquidity sources via LI.FI
- **Slippage control**: Configurable slippage tolerance to protect against price movements

## Architecture

```
User Action (Swap/Bridge)
        ↓
┌───────────────────────┐
│   LI.FI Aggregator    │ ← Liquidity sourcing & rate comparison
└───────────────────────┘
        ↓
┌───────────────────────┐
│   NEAR Intents API    │ ← Cross-chain messaging & execution
└───────────────────────┘
        ↓
Target Chain Execution (token transfer + optional swap)
```

## Configuration

Enable the bridge feature by setting these environment variables:

```bash
# Enable bridge UI and API routes
NEXT_PUBLIC_BRIDGE_ENABLED=true

# NEAR Intents 1Click JWT (server-side, required for cross-chain messages)
ONE_CLICK_JWT=your_jwt_token_here

# LI.FI API key (optional, improves rate quality)
LIFI_API_KEY=your_li-fi_key_here

# Default slippage tolerance in basis points (50 = 0.5%)
NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS=50
```

### Getting Credentials

**NEAR Intents 1Click API:**
1. Sign up at [NEAR Intents](https://near.org/intents/)
2. Generate a JWT token from your dashboard
3. Set as `ONE_CLICK_JWT` server-side

**LI.FI API:**
1. Register at [LI.FI Dashboard](https://li.fi/)
2. Create an API key
3. Optional but recommended for better rates

## Supported Chains & Tokens

The bridge supports chains and tokens configured in both:
- **LI.FI connector registry** (multi-chain DEX aggregations)
- **NEAR Intents supported networks** (cross-chain message passing)

Commonly supported assets include:
- **Ethereum**: ETH, USDC, USDT, DAI
- **Polygon**: MATIC, USDC, USDT
- **Arbitrum**: ETH, USDC, ARB
- **Base**: ETH, USDC
- **BSC**: BNB, BUSD, USDT

*Note: Token availability depends on current LI.FI integrations.*

## User Flow

1. **Select Source Chain & Token**: Choose origin network and asset to send
2. **Select Destination Chain**: Choose where funds should arrive
3. **Enter Amount**: Input how much to bridge/swap
4. **View Quote**: See destination amount, fees, and estimated time
5. **Configure Slippage**: Adjust tolerance if needed (default: 0.5%)
6. **Approve Token**: Grant contract allowance (first-time only)
7. **Execute Swap**: Sign transaction; LI.FI routes through optimal path
8. **Wait for Confirmation**: Cross-chain settlement (typically 1-5 minutes)
9. **Receive Funds**: Tokens arrive on destination chain

## API Routes

### GET `/api/v1/bridge/quote`

Get a bridge quote for specified parameters.

**Query Parameters:**
- `fromToken`: Source token address
- `toToken`: Destination token address
- `fromAmount`: Amount in source token decimals
- `fromChainId`: Source chain ID
- `toChainId`: Destination chain ID
- `slippageBps`: Optional slippage tolerance (default from env)

**Response:**
```json
{
  "quoteId": "string",
  "fromToken": { "address", "symbol", "decimals" },
  "toToken": { "address", "symbol", "decimals" },
  "fromAmount": "1000000000",
  "toAmount": "995000000",
  "route": [{ "exchange": "Uniswap", "portion": 0.6 }],
  "gasEstimate": "0.005",
  "estimatedTimeSeconds": 180,
  "slippageBps": 50
}
```

### POST `/api/v1/bridge/execute`

Execute a bridge transaction.

**Request Body:**
```json
{
  "quoteId": "string",
  "walletAddress": "0x...",
  "signature": "signed_quote_signature"
}
```

**Response:**
```json
{
  "transactionHash": "0x...",
  "status": "pending",
  "trackingUrl": "https://li.fi/tx/..."
}
```

## Client-Side Usage

```typescript
import { useBridge } from '@/hooks/useBridge';

function BridgeComponent() {
  const { quote, execute, isExecuting, error } = useBridge();

  const handleSwap = async () => {
    // Get quote first
    const quoteData = await quote({
      fromToken: '0x...',
      toToken: '0x...',
      fromAmount: '1000000000',
      fromChainId: 1,
      toChainId: 137,
      slippageBps: 50
    });

    // Execute swap
    const result = await execute(quoteData);
    console.log('Bridge executed:', result.transactionHash);
  };

  return (
    <div>
      <h2>Cross-Chain Bridge</h2>
      <BridgeForm onQuote={handleSwap} />
      {error && <ErrorMessage error={error} />}
    </div>
  );
}
```

## Error Handling

Common error scenarios:

| Error | Cause | Resolution |
|-------|-------|------------|
| Insufficient liquidity | No route found | Increase slippage or try different token pair |
| Price moved | Market volatility | Re-quote and confirm |
| Gas too high | Network congestion | Try off-peak hours or different destination |
| Invalid chain | Unsupported network | Check supported chains list |
| Rate limit exceeded | Too many requests | Wait before retrying |

## Security Considerations

1. **Slippage Protection**: Always set reasonable slippage tolerance (0.5-2% typical)
2. **Verify Recipient**: Double-check destination chain and address
3. **Gas Estimation**: Ensure sufficient gas on source chain for execution
4. **Contract Audit**: LI.FI contracts are audited; verify addresses before approving
5. **Network Fees**: Bridge costs include both source gas + any routing fees

## Troubleshooting

**Bridge appears slow?**
- Cross-chain transactions require confirmation on both chains
- Typical time: 1-5 minutes depending on target chain
- Check status via LI.FI tracking URL provided in response

**Wrong tokens received?**
- Verify recipient address supports the token standard on destination chain
- Some chains require wrapped versions (e.g., WETH vs ETH)

**Quoted amount differs from received?**
- Price movement between quote and execution
- MEV/bot activity can slip rates on popular pairs
- Use higher slippage tolerance or fixed-price quotes if available

## Related Documentation

- [Environment Variables](environment-variables.md) – Bridge configuration options
- [Wallet Integration](wallet-integration.md) – Multi-chain wallet support
- [Tron Support](tron-support.md) – Tron network integration details
