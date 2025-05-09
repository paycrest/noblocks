# Authentication System

This document explains the authentication system used in the application.

## Overview

The application uses a combination of Privy for authentication and supports both smart wallets and injected wallets (like MetaMask).

## Wallet Types

### Smart Wallets

- Created and managed through Privy
- Automatically created for new users
- Used as the default wallet type

### Injected Wallets

- External wallets like MetaMask, Coinbase Wallet, etc.
- Can be used by adding `?injected=true` to the URL

## Authentication Flow

1. User signs in through Privy
2. System creates or retrieves user's smart wallet
3. For injected wallets:
   - User connects their external wallet
   - System validates the connection
   - Wallet address is stored and used for transactions

## Security Features

- Row Level Security (RLS) in Supabase
- Wallet address validation
- Transaction signing requirements
- Rate limiting on API endpoints

## API Authentication

All API requests require:

1. Valid JWT token
2. Wallet address in headers
3. Rate limiting compliance

## Middleware

The application uses middleware to:

1. Verify JWT tokens
2. Set current wallet address for RLS
3. Add wallet address to response headers
4. Handle authentication errors

## Usage

### Smart Wallet

```typescript
const { user } = usePrivy();
const smartWallet = user?.linkedAccounts.find(
  (account) => account.type === "smart_wallet"
);
```

### Injected Wallet

```typescript
const { isInjectedWallet, injectedAddress } = useInjectedWallet();
```

## Error Handling

Common authentication errors:

- Missing JWT
- Invalid wallet address
- Connection rejection
- Rate limit exceeded

## Best Practices

1. Always check wallet connection status
2. Handle wallet disconnection gracefully
3. Validate wallet addresses before transactions
4. Use appropriate error messages for users
5. Implement proper rate limiting
