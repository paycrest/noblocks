# Authentication System

This document explains the authentication system used in the Noblocks application, covering Privy smart wallet authentication, injected wallet support, Supabase integration, and JWT-based API security.

## Overview

Noblocks uses a hybrid authentication approach:

- **Privy**: Primary authentication provider for smart wallet creation and user management
- **Supabase**: Secondary auth layer for database access with Row Level Security (RLS)
- **Wallet signatures**: Cryptographic proof of ownership for on-chain operations
- **JWT tokens**: Stateless API authentication with short expiration

```
┌─────────────┐     ┌──────────┐     ┌────────────┐     ┌────────────┐
│  User       │────→│  Privy   │────→│   Supabase │────→│  API       │
│  Browser    │     │  Auth    │     │   Session  │     │  Endpoints │
└─────────────┘     └──────────┘     └────────────┘     └────────────┘
      ↓                   ↓                  ↓                  ↓
  Wallet UI        Create user record   RLS enforcement   Protected data
  Sign messages    Issue JWT            Apply policies    Transaction logs
```

## Supported Auth Methods

### Privy Smart Wallets (Default)

Privy provides the primary auth experience for most users:

- **Auto-provisioned wallets**: Created on first login, no setup required
- **Email/password + Web3**: Traditional credentials combined with cryptographic keys
- **Social login**: Google, Apple, Discord, Twitter, Facebook, and 20+ providers
- **Magic links**: Passwordless email-based authentication
- **Biometric auth**: FaceID/TouchID on mobile devices
- **Multi-chain support**: Single wallet works across ETH, Polygon, Arbitrum, Base

**Setup:**

1. Configure Privy app in dashboard at [console.privy.io](https://console.privy.io/)
2. Enable smart wallet module
3. Select supported chains
4. Add environment variables

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_app_id
PRIVY_APP_SECRET=your_secret
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<app-id>/jwks.json
PRIVY_ISSUER=privy.io
```

See [Privy Quickstart](https://docs.privy.io/guide/react/quickstart) for full setup guide.

### Injected EVM Wallets

For self-custody users preferring MetaMask or other browser extensions:

- Access via `?injected=true` URL parameter or "Connect External Wallet" button
- Supports MetaMask, Coinbase Wallet, Trust Wallet, Brave Wallet, etc.
- Requires manual network switching between chains
- Gas fees paid directly by user

### Tron Integration

Tron authentication uses embedded key management or TronLink extension:

- Generate addresses server-side with encrypted private key storage
- Or use TronLink injection for pure self-custody flow
- Message signing for KYC verification

See [Tron Support](tron-support.md) for details.

## Authentication Flow

### Flow 1: New User with Privy Smart Wallet

```
1. User visits noblocks.xyz
          ↓
2. Clicks "Connect Wallet"
          ↓
3. Chooses email/social provider OR "Create Smart Wallet"
          ↓
4. Privy creates account + generates wallet address
          ↓
5. Returns JWT token + user object
          ↓
6. App calls POST /api/v1/auth/sync-wallet
          ↓
7. Server creates user record in Supabase
          ↓
8. App stores user state in React Context
```

### Flow 2: Existing User Logging In

```
1. User clicks "Log In"
          ↓
2. Authenticates via Privy (email password / social / magic link)
          ↓
3. Privy validates credentials, issues JWT
          ↓
4. Client receives JWT + user.wallet.address
          ↓
5. App checks if user exists in Supabase
          ↓
6. If not: auto-create user record on first sync
          ↓
7. If yes: load existing profile
```

### Flow 3: Injected Wallet Connection

```
1. User adds ?injected=true to URL
          ↓
2. App detects window.ethereum
          ↓
3. Displays "Connect MetaMask" (or detected wallet name)
          ↓
4. Requests account access via eth_requestAccounts
          ↓
5. User approves connection in popup
          ↓
6. App retrieves connected address via eth_accounts
          ↓
7. Signs challenge message for ownership proof:
   - Server issues nonce: { "nonce": "random_string", "expiresAt": "..." }
   - Client signs: signature = personal_sign(nonce, address)
          ↓
8. Sends { address, signature, nonce } to /api/v1/auth/login-with-injected
          ↓
9. Server verifies signature matches expected value for address
          ↓
10. Returns session JWT tied to that wallet address
```

## API Authentication

### Endpoint Protection Pattern

All protected API routes follow this pattern:

```typescript
// pages/api/v1/wallet/balance.ts
import { NextApiRequest } from 'next';
import { verifyAuth } from '@/lib/auth';
import { getBalance } from '@/services/blockchain';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify JWT and extract wallet address
  const authResult = await verifyAuth(req);
  if (!authResult.success) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { walletAddress } = authResult;

  // Business logic using authenticated address
  const balance = await getBalance(walletAddress);

  return res.status(200).json({ balance });
}
```

### verifyAuth Utility

```typescript
import { jwtVerify } from 'jose';
import { NextApiRequest } from 'next';

interface AuthResult {
  success: boolean;
  walletAddress?: string;
  error?: string;
}

export async function verifyAuth(req: NextApiRequest): Promise<AuthResult> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { success: false, error: 'Missing authorization header' };
    }

    const token = authHeader.slice(7);

    // Verify Privy JWT signature
    const secret = new TextEncoder().encode(process.env.PRIVY_APP_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Extract wallet address from token claims
    const walletAddress = payload.sub; // Privy uses sub as wallet address
    if (!walletAddress || !isValidEthAddress(walletAddress)) {
      return { success: false, error: 'Invalid token subject' };
    }

    // Optional: Verify token hasn't expired beyond grace period
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp + 60 * 60) {
      // Token valid but very old, consider refreshing
      console.warn('Stale auth token:', payload.sub);
    }

    return { success: true, walletAddress };
  } catch (error) {
    if (error instanceof Error && 'message' in error) {
      if (error.message.includes('token expired')) {
        return { success: false, error: 'Token expired' };
      }
      return { success: false, error: 'Invalid token' };
    }
    return { success: false, error: 'Authentication failed' };
  }
}
```

### JWT Claims Structure

Privy issues tokens containing these claims:

```json
{
  "sub": "0x1234567890abcdef...",     // Wallet address (used as user identifier)
  "iss": "https://id.privy.io",      // Issuer
  "aud": "your_app_id",              // Audience (your Privy app ID)
  "iat": 1704067200,                 // Issued at timestamp
  "exp": 1704070800,                 // Expiration (1 hour default)
  "picture": "https://...",          // Profile image URL (optional)
  "name": "John Doe",                // Display name (if provided)
  "email": "john@example.com",       // Email (if email login)
  "raw_access_token": "eyJhbGciOiJIUz...", // OAuth token from provider (if social login)
}
```

## Supabase Integration

### RLS Configuration

Row Level Security ensures users can only access their own data:

```sql
-- Enable RLS on users table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read only their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update only their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Insert allowed during registration
CREATE POLICY "Allow user registration"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### Client-Side Auth Setup

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Usage in components
async function fetchUserData() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_wallet_address', currentUserAddress);

  if (error) throw error;
  return data;
}
```

### Server-Side Admin Access

Server-side API routes use the service role key to bypass RLS when needed:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!, // Service role key - NEVER expose client-side
  {
    global: {
      headers: {
        apiKey: process.env.SUPABASE_SECRET_KEY!
      }
    }
  }
);

// Use admin client for internal operations
const { data: allUsers } = await supabaseAdmin
  .from('profiles')
  .select('*'); // Bypasses RLS
```

## Middleware

### Next.js Middleware for Auth

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Tokens that don't require auth
const publicPaths = ['/api/public/*', '/_next/static', '/favicon.ico'];
const authPaths = ['/api/v1/auth/*'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Get JWT from cookie or header
  const token = request.cookies.get('auth_token')?.value ||
                request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token && !authPaths.some(p => pathname.startsWith(p))) {
    // Redirect unauthenticated users to login page if available
    if (!request.nextUrl.pathname.startsWith('/login')) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // For API routes, continue processing - controller handles validation
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
```

### Wallet Context Sync

The `ENABLE_WALLET_CONTEXT_SYNC` feature flag controls automatic wallet synchronization:

```typescript
// When enabled, middleware syncs wallet context to database
if (process.env.ENABLE_WALLET_CONTEXT_SYNC === 'true') {
  await syncWalletContextToDatabase({
    walletAddress,
    chainId,
    lastActiveAt: new Date()
  });
}
```

## Client-Side Auth Hooks

### usePrivy Hook

```typescript
import { usePrivy, useAccountBalance } from '@privy-io/react-auth';

function BalanceDisplay() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { balances } = useAccountBalance();

  if (!ready) return <div>Loading...</div>;

  if (!authenticated) {
    return (
      <button onClick={() => login()} className="btn-primary">
        Connect Wallet
      </button>
    );
  }

  const ethBalance = balances?.['ethereum']?.native ?? '0';

  return (
    <div className="flex items-center gap-4">
      <span>{ethBalance} ETH</span>
      <button onClick={logout}>Disconnect</button>
    </div>
  );
}
```

### useWalletState Hook

Application-specific wallet state management:

```typescript
import { createContext, useContext, useState, useEffect } from 'react';

interface WalletState {
  isPrivyConnected: boolean;
  isInjectedConnected: boolean;
  evmAddress: string | null;
  tronAddress: string | null;
  chainId: number | null;
}

const WalletContext = createContext<{
  state: WalletState;
  setEvmAddress: (addr: string | null) => void;
  setTronAddress: (addr: string | null) => void;
  setChainId: (id: number | null) => void;
}>(null as any);

export function WalletProvider({ children }) {
  const [state, setState] = useState<WalletState>({
    isPrivyConnected: false,
    isInjectedConnected: false,
    evmAddress: null,
    tronAddress: null,
    chainId: null
  });

  return (
    <WalletContext.Provider value={{ state, setEvmAddress: () => {}, ... }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletState() {
  return useContext(WalletContext);
}
```

## Error Handling

### Auth Error Messages

Map technical errors to user-friendly messages:

```typescript
const AUTH_ERRORS: Record<string, string> = {
  'User does not exist': 'No account found with this email. Please sign up.',
  'User already exists': 'An account with this email already exists. Please log in.',
  'Invalid credentials': 'Incorrect email or password. Please try again.',
  'Email not verified': 'Please verify your email address before logging in.',
  'Account locked': 'Your account has been temporarily locked. Please contact support.',
  'Insufficient permissions': 'You do not have permission to perform this action.',
  'Rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'Token expired': 'Your session has expired. Please log in again.',
  'Invalid token': 'Invalid authentication token. Please log in again.'
};

export function getAuthErrorMessage(code: string): string {
  return AUTH_ERRORS[code] || 'Authentication failed. Please try again.';
}
```

### Network-Level Errors

Handle blockchain-specific failures:

```typescript
const BLOCKCHAIN_ERRORS: Record<string, string> = {
  'insufficient funds': 'You do not have sufficient funds for this transaction.',
  'gas limit exceeded': 'Transaction requires too much gas. Please reduce the amount.',
  'nonce too low': 'Please wait and try again. Your pending transactions may be processing.',
  'transaction rejected': 'Transaction was rejected by your wallet.',
  'network timeout': 'Network is slow. Please check your connection and try again.',
  'chain not found': 'This network is not supported. Please switch to Ethereum.',
  'contract interaction failed': 'Smart contract call failed. Check token validity.'
};
```

## Security Best Practices

### Token Storage

- **HttpOnly cookies**: Preferred for storing JWTs to prevent XSS theft
- **Short expiration**: 1 hour max, refresh via secure endpoint
- **Never localStorage**: Avoid client-side storage for auth tokens

```typescript
// Set secure httpOnly cookie
res.cookie('auth_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 1000 // 1 hour
});
```

### Rate Limiting

Prevent brute force attacks:

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many authentication attempts' },
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/api/v1/auth/login', authLimiter, loginHandler);
```

### Internal API Key Protection

Protect internal-only endpoints:

```typescript
// POST /api/v1/internal/user/export-all
export async function handleInternalExport(req: NextApiRequest, res: NextApiResponse) {
  const incomingApiKey = req.headers['x-api-key'];

  if (incomingApiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Internal access denied' });
  }

  // Sensitive operation requiring API key
  const allUsers = await getAllUsers();
  return res.json({ users: allUsers });
}
```

## Related Documentation

- [Wallet Integration](wallet-integration.md) – Multi-chain wallet patterns
- [Environment Variables](environment-variables.md) – Privy and Supabase configs
- [Transaction History Setup](transaction-history-setup.md) – Auth-dependent features
