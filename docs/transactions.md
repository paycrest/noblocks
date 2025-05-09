# Transactions System

This document explains how transactions are handled in the application.

## Overview

The application uses Supabase to store and manage transactions with Row Level Security (RLS) to ensure users can only access their own transactions.

## Transaction Structure

```typescript
interface Transaction {
    id: UUID;
    wallet_address: string;
    transaction_type: string;
    from_currency: string;
    to_currency: string;
    amount_sent: decimal;
    amount_received: decimal;
    fee: decimal;
    recipient: JSONB;
    status: string;
    memo?: string;
    time_spent?: string;
    tx_hash?: string;
    created_at: timestamptz;
    updated_at: timestamptz;
}
```

## API Endpoints

### Get Transactions

```typescript
GET /api/v1/transactions
Query Parameters:
- page: number (default: 1)
- limit: number (default: 20)
```

### Get Transactions by Address

```typescript
GET /api/v1/transactions/address/:address
Query Parameters:
- page: number (default: 1)
- limit: number (default: 20)
```

### Create Transaction

```typescript
POST /api/v1/transactions
Body:
{
    walletAddress: string;
    transactionType: string;
    fromCurrency: string;
    toCurrency: string;
    amountSent: number;
    amountReceived: number;
    fee: number;
    recipient: object;
    status: string;
    time_spent?: string;
    txHash?: string;
}
```

### Update Transaction Status

```typescript
PUT /api/v1/transactions/status/:id
Body:
{
    status: string;
}
```

## Security

### Row Level Security

- Users can only view their own transactions
- Users can only insert transactions for their own wallet
- All transactions are validated against the current wallet address

### Rate Limiting

- API endpoints are rate limited
- Default limit: 20 requests per minute

## Transaction Flow

1. User initiates transaction
2. System validates wallet address
3. Transaction is created in database
4. Status is updated as transaction progresses
5. Final status and hash are recorded

## Error Handling

- 401: Unauthorized - Missing or invalid wallet address
- 403: Forbidden - Wallet address mismatch
- 404: Not Found - Transaction not found
- 500: Internal Server Error - Server-side error

## Best Practices

1. Always validate wallet addresses
2. Check transaction status before proceeding
3. Handle network errors gracefully
4. Implement proper error messages
5. Use appropriate rate limiting
6. Keep transaction history for auditing

## Monitoring

Transactions can be monitored through:

1. Supabase dashboard
2. Application logs
3. Transaction status updates
4. Error tracking

## Testing

When testing transactions:

1. Use test networks
2. Verify RLS policies
3. Check rate limiting
4. Validate error handling
5. Test with different wallet types
