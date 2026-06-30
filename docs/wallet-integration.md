# Wallet Integration

This document explains how different wallet types are integrated into the Noblocks application, including EVM-compatible chains (Ethereum, Polygon, Arbitrum, Base), Tron, and multi-chain management patterns.

## Overview

Noblocks supports multiple wallet types across several blockchains:

| Chain | Smart Wallet | Injected | Gas Sponsorship |
|-------|--------------|----------|-----------------|
| Ethereum | Privy (default) | MetaMask, Coinbase, etc. | EIP-7702 + sponsor wallet |
| Polygon | Privy | All EVM wallets | EIP-7702 + sponsor wallet |
| Arbitrum | Privy | All EVM wallets | EIP-7702 + sponsor wallet |
| Base | Privy | All EVM wallets | EIP-7702 + sponsor wallet |
| Tron | Embedded/Native | TronLink | Built-in |

## Supported Wallets

### Smart Wallets (Privy)

Privy smart wallets are the default authentication method for new users:

- **Auto-created**: No setup required, generated on first login
- **Email/password + web3**: Dual authentication options
- **Social login**: Google, Apple, Discord, and 20+ providers
- **Account abstraction**: Gas sponsorship via EIP-7702 + Noblocks sponsor wallet
- **Recovery options**: Email backup, social recovery
- **Multi-chain**: Single address works across all supported EVM chains

**Setup Requirements:**

1. Configure Privy in dashboard:
   - Enable smart wallet mode
   - Select supported chains (ETH, MATIC, ARB, BASE)
   - Configure funding sources

2. Add environment variables:
   ```bash
   NEXT_PUBLIC_PRIVY_APP_ID=your_app_id
   PRIVY_APP_SECRET=your_secret
   PRIVY_ISSUER=privy.io
   ```

See [Privy Quickstart](https://docs.privy.io/guide/react/quickstart) for detailed setup.

### Injected EVM Wallets

For users preferring self-custody, Noblocks supports all common injected wallets:

- MetaMask
- Coinbase Wallet
- Trust Wallet
- Brave Wallet
- BitKeep
- TokenPocket
- 1inch Wallet
- MiniPay

Injected wallets require users to:
- Manage their own private keys
- Pay gas fees directly (unless using sponsored transactions)
- Handle network switching manually

### Tron Wallet Support

Tron integration uses either TronLink injection or embedded key management:

- **TronLink extension**: Most common user flow
- **Embedded provider**: For users without extensions
- **TRX native transfers**: Direct balance sending
- **TRC20 token support**: USDT, USDC, WBTC, WIN tokens

See [Tron Support](tron-support.md) for complete integration guide.

## Wallet Detection

### EVM Wallet Provider Detection

```typescript
import { useMemo } from 'react';

export function detectEVMProvider(): string | null {
  if (typeof window === 'undefined' || !window.ethereum) {
    return null;
  }

  const ethereum = window.ethereum;

  switch (true) {
    case ethereum.isMetaMask:
      return 'MetaMask';
    case ethereum.isCoinbaseWallet:
      return 'Coinbase Wallet';
    case ethereum.isTrust:
      return 'Trust Wallet';
    case ethereum.isBrave:
      return 'Brave Wallet';
    case ethereum.isBitKeep:
      return 'BitKeep';
    case ethereum.isTokenPocket:
      return 'TokenPocket';
    default:
      // Return provider name from connector info if available
      return ethereum.connectorName ?? 'Injected Wallet';
  }
}
```

### Tron Provider Detection

```typescript
export function detectTronProvider(): TronExt | null {
  if (typeof window === 'undefined') return null;
  return (window as any).tronWeb ?? (window as any).tronExtension;
}
```

### Multi-Wallet Context

The application uses React Context to manage wallet state across chains:

```typescript
interface MultiChainWalletContextType {
  // EVM wallets
  evmAddress: string | null;
  evmChainId: number | null;
  evmBalance: bigint | null;
  isPrivyConnected: boolean;
  isInjectedConnected: boolean;

  // Tron wallet
  tronAddress: string | null;
  tronBalance: bigint | null;

  // Actions
  connectPrivy: () => Promise<void>;
  disconnectEvm: () => Promise<void>;
  disconnectTron: () => void;
  switchChain: (chainId: number) => Promise<void>;
}
```

## Wallet Operations

### Connecting Privy Smart Wallet

```typescript
import { usePrivy } from '@privy-io/react-auth';

function PrivyWalletButton() {
  const { ready, login, logout, user, authenticated } = usePrivy();

  if (!ready) return <div>Loading...</div>;

  if (authenticated) {
    return (
      <div className="flex items-center gap-2">
        <span>{user?.wallet?.address ?? 'Connected'}</span>
        <button onClick={logout}>Disconnect</button>
      </div>
    );
  }

  return <button onClick={() => login({ chain: 'ethereum' })}>Connect Wallet</button>;
}
```

### Connecting Injected EVM Wallet

```typescript
import { createWalletClient, custom, http } from 'viem';
import { mainnet, polygon, arbitrum, base } from 'viem/chains';

const walletChains = [mainnet, polygon, arbitrum, base];

export async function connectInjectedWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No EVM provider found');
  }

  // Request account access
  await window.ethereum.request({ method: 'eth_requestAccounts' });

  // Get connected accounts
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  const address = accounts[0];

  // Create viem wallet client with custom transport
  const client = createWalletClient({
    chain: mainnet, // Default to mainnet
    transport: custom(window.ethereum)
  });

  return address;
}
```

### Disconnecting Wallet

```typescript
// Privy: logout handles cleanup
const handleDisconnect = async () => {
  await logout();

  // Additional cleanup for injected wallets
  if (window.ethereum) {
    try {
      await window.ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }]
      });
    } catch (error) {
      console.warn('Failed to revoke permissions:', error);
    }
  }
};
```

### Switching Networks

```typescript
async function switchToChain(chainId: number): Promise<void> {
  if (!window.ethereum) {
    throw new Error('No wallet provider available');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHex(chainId) }],
    });
  } catch (switchError: any) {
    // If chain doesn't exist, add it
    if (switchError.code === 4902) {
      try {
        const chain = CHAIN_CONFIGS.find(c => c.id === chainId);
        if (!chain) throw new Error('Unknown chain');

        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: toHex(chain.id),
              chainName: chain.name,
              nativeCurrency: {
                name: chain.nativeCurrency.symbol,
                decimals: chain.nativeCurrency.decimals,
                imageUrl: chain.iconUrls[0] ?? undefined
              },
              rpcUrls: chain.rpcUrls,
              blockExplorerUrls: [chain.explorers?.[0]?.url]
            }
          ]
        });
      } catch (addError) {
        throw new Error('Failed to add chain');
      }
    } else {
      throw new Error('Failed to switch chain');
    }
  }
}
```

### Signing Messages

```typescript
// EVM message signing
async function signMessage(message: string): Promise<string> {
  if (!window.ethereum) {
    throw new Error('No provider available');
  }

  const account = await getCurrentAccount();
  const hexMessage = `0x${Buffer.from(message).toString('hex')}`;

  return window.ethereum.request({
    method: 'personal_sign',
    params: [hexMessage, account]
  });
}

// Tron message signing
async function signTronMessage(message: string): Promise<string> {
  if (!window.tronWeb) {
    throw new Error('No Tron provider available');
  }

  const account = await getCurrentTronAccount();
  const hexMessage = `0x${Buffer.from(message).toString('hex')}`;

  return window.tronWeb.trx.sign(hexMessage, account);
}
```

## Multi-Chain Balance Checking

```typescript
async function getBalances(address: string): Promise<BalanceMap> {
  const balances: BalanceMap = {};

  // Check EVM balances
  for (const chain of EVMSupportedChains) {
    const provider = getProviderForChain(chain);
    const ethBalance = await provider.getBalance(address);
    const erc20Tokens = await getERC20Balances(address, chain);

    balances[chain] = {
      native: formatEther(ethBalance),
      tokens: erc20Tokens
    };
  }

  // Check Tron balance
  if (await hasTronConnection()) {
    const tronBalance = await window.tronWeb.trx.getBalance(address);
    balances['tron'] = {
      native: formatSun(tronBalance.toString()),
      trc20tokens: await getTRC20Balances(address)
    };
  }

  return balances;
}
```

## Security Considerations

### Key Management

1. **Privy smart wallets**: Keys managed by Privy infrastructure, encrypted at rest
2. **Injected wallets**: User-managed, never accessible by app
3. **Private key handling**: Never store private keys server-side unless absolutely necessary (encrypted with AES-256-GCM if required)

```typescript
// Encrypt sensitive key data
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

function encryptPrivateKey(privateKey: string, masterKey: Buffer): EncryptedData {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}
```

### Address Validation

```typescript
import { isAddress } from 'viem';
import { isValidAddress as isTronValid } from 'tronweb';

function validateAddress(address: string, chain: ChainId): boolean {
  switch (chain) {
    case 'ethereum':
    case 'polygon':
    case 'arbitrum':
    case 'base':
      return isAddress(address);

    case 'tron':
      return isTronValid(address);

    default:
      return false;
  }
}
```

### Permission Revocation

Always revoke wallet permissions on disconnect:

```typescript
async function revokeAllPermissions(): Promise<void> {
  if (!window.ethereum) return;

  const revocableMethods = [
    'eth_accounts',
    'eth_sendTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData_v4'
  ];

  for (const method of revocableMethods) {
    try {
      await window.ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ [method]: {} }]
      });
    } catch (error) {
      console.warn(`Failed to revoke ${method}:`, error);
    }
  }
}
```

## Features

### Balance Display

- Real-time balance updates via event listeners
- Multi-token support with cached price data
- Network-specific balancing (separate balances per chain)
- Tron SUN conversion (1 TRX = 1,000,000 SUN)

### Transaction Signing

- Message signing for KYC verification
- Transaction signing for deposits/withdrawals
- Typed data signing for permit approvals
- Gas estimation and display

### Network Management

- Chain switching within wallet UI
- Custom network addition prompts
- Network status indicators
- Automatic fallback RPC URLs

## Error Handling

Common wallet errors and resolutions:

| Error | Cause | Resolution |
|-------|-------|------------|
| "User rejected request" | User cancelled connection | Retry with clear explanation |
| "Chain not found" | Unsupported network | Prompt to add network manually |
| "Insufficient funds" | Not enough gas/token | Show balance and suggest adding funds |
| "Nonce too low" | Concurrent transactions | Wait and retry |
| "Gas limit exceeded" | Complex transaction | Simplify or increase gas limit |
| "Provider not found" | No wallet installed | Suggest installing relevant extension |

## Testing

When testing wallet integration:

1. **Test both flows**: Privy smart wallet and injected wallets
2. **Verify cross-chain**: Test switching between supported networks
3. **Check edge cases**: Disconnection during transaction, network changes mid-operation
4. **Validate signing**: Ensure correct signatures for KYC and transactions
5. **Test mobile**: Verify mobile wallet compatibility (Coinbase Mobile, Trust Mobile)

## Related Documentation

- [Environment Variables](environment-variables.md) – Privy and sponsor wallet configs
- [Tron Support](tron-support.md) – Tron network integration details
- [Authentication](authentication.md) – Auth flow with wallet contexts
