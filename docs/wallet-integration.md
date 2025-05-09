# Wallet Integration

This document explains how different wallet types are integrated into the application.

## Overview

The application supports multiple wallet types and provides a unified interface for wallet operations.

## Supported Wallets

### Smart Wallets (Privy)

- Automatically created for new users
- Managed through Privy
- Default wallet type

### Injected Wallets

- MetaMask
- Coinbase Wallet
- Trust Wallet
- Brave Wallet
- BitKeep
- TokenPocket
- 1inch Wallet
- MiniPay

## Wallet Detection

```typescript
function detectWalletProvider(): string {
  if (typeof window === "undefined" || !window.ethereum) {
    return "Injected Wallet";
  }

  const ethereum = window.ethereum;

  switch (true) {
    case ethereum.isMetaMask:
      return "MetaMask";
    case ethereum.isCoinbaseWallet:
      return "Coinbase Wallet";
    // ... other wallet checks
  }
}
```

## Wallet Context

The application uses React Context to manage wallet state:

```typescript
interface InjectedWalletContextType {
  isInjectedWallet: boolean;
  injectedAddress: string | null;
  injectedProvider: any | null;
  injectedReady: boolean;
}
```

## Wallet Operations

### Connection

```typescript
const initInjectedWallet = async () => {
  if (window.ethereum) {
    const client = createWalletClient({
      transport: custom(window.ethereum),
    });
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const [address] = await client.getAddresses();
  }
};
```

### Disconnection

```typescript
const disconnectWallet = async () => {
  if (window.ethereum) {
    const walletClient = createWalletClient({
      transport: custom(window.ethereum)
    });
    await walletClient.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  }
};
```

## Wallet Features

### Balance Checking

- Real-time balance updates
- Support for multiple tokens
- Network-specific balances

### Transaction Signing

- Message signing
- Transaction signing
- KYC verification signing

### Address Management

- Address validation
- Address formatting
- Address copying

## Security Considerations

1. Always validate wallet addresses
2. Check wallet connection status
3. Handle disconnection gracefully
4. Implement proper error handling
5. Use secure communication channels

## Best Practices

1. Check wallet availability before operations
2. Handle wallet connection errors
3. Provide clear user feedback
4. Implement proper error messages
5. Support multiple wallet types
6. Handle network changes

## Error Handling

Common wallet errors:

- Connection rejection
- Network mismatch
- Invalid address
- Transaction rejection
- Insufficient funds

## Testing

When testing wallet integration:

1. Test with different wallet types
2. Verify connection flow
3. Check error handling
4. Test network switching
5. Validate transaction signing
