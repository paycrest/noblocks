# Prisma Database Setup and Usage

## Overview

This document describes the database setup for the Noblocks application using Prisma with PostgreSQL. The database is designed to store transaction history and user data in conjunction with Privy authentication.

## Schema Structure

The database schema consists of three main models:

1. **User**: Stores core user information linked to Privy authentication
2. **Wallet**: Stores wallet information for each user
3. **Transaction**: Stores detailed transaction history

## Setup Instructions

1. Install dependencies:

   ```bash
   pnpm add prisma @prisma/client
   ```

2. Set up your environment variables in `.env`:

   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/noblocks"
   ```

3. Initialize the database:

   ```bash
   npx prisma db push
   ```

4. Generate Prisma Client:

   ```bash
   npx prisma generate
   ```

## Database Management

### Local Development

- Use `npx prisma studio` to view and edit data
- Use `npx prisma db push` during development to update schema
- Use `npx prisma migrate dev` when ready to create migrations

### Production Deployment

1. Create migrations:

   ```bash
   npx prisma migrate dev --name init
   ```

2. Deploy migrations:

   ```bash
   npx prisma migrate deploy
   ```

## Integration with Privy

When a user authenticates with Privy, create or update the user record:

```typescript
async function handlePrivyAuth(privyUser: any) {
  const user = await prisma.user.upsert({
    where: { id: privyUser.id },
    update: { email: privyUser.email?.address },
    create: {
      id: privyUser.id,
      email: privyUser.email?.address,
      wallets: {
        create: privyUser.linkedAccounts
          .filter(account => account.type === "wallet")
          .map(wallet => ({
            address: wallet.address,
            chainType: wallet.chainType,
            walletType: wallet.walletClientType
          }))
      }
    }
  });
  return user;
}
```

## Transaction Recording

Example of recording a new transaction:

```typescript
async function createTransaction(data: CreateTransactionInput) {
  const transaction = await prisma.transaction.create({
    data: {
      orderId: data.orderId,
      userId: data.userId,
      walletId: data.walletId,
      amount: data.amount,
      token: data.token,
      recipientAccount: data.recipientAccount,
      recipientName: data.recipientName,
      institution: data.institution,
      currency: data.currency,
      status: "PENDING",
      provider: data.provider,
      memo: data.memo
    }
  });
  return transaction;
}
```

## Production Considerations

1. **Connection Management**:
   - Use connection pooling in production
   - Implement PrismaClient as a singleton

2. **Database Security**:
   - Ensure DATABASE_URL is properly secured
   - Use appropriate user permissions
   - Enable SSL for database connections

3. **Scaling**:
   - Set up read replicas if needed
   - Implement appropriate indexes (already set up for userId and orderId)
   - Consider implementing query caching

4. **Monitoring**:
   - Set up database monitoring
   - Monitor query performance
   - Set up alerts for database issues

## Backup Strategy

1. **Regular Backups**:
   - Set up automated daily backups
   - Store backups in a secure location
   - Test backup restoration regularly

2. **Point-in-Time Recovery**:
   - Enable WAL (Write-Ahead Logging)
   - Set up regular WAL archiving

## Migrations and Updates

When updating the schema:

1. Create a new migration:

   ```bash
   npx prisma migrate dev --name description_of_changes
   ```

2. Review the generated migration in `prisma/migrations`

3. Test the migration locally

4. Deploy to production:

   ```bash
   npx prisma migrate deploy
   ```

## Troubleshooting

Common issues and solutions:

1. **Connection Issues**:
   - Check DATABASE_URL format
   - Verify network connectivity
   - Check database server status

2. **Migration Issues**:
   - Use `prisma migrate reset` for local dev
   - Check migration history
   - Verify database permissions

3. **Performance Issues**:
   - Review query plans
   - Check indexes
   - Monitor connection pool

## Development Workflow

1. Make schema changes in `schema.prisma`
2. Run `npx prisma format` to format the schema
3. Run `npx prisma db push` for development
4. Create migrations before deployment
5. Test migrations locally
6. Deploy to production

## Using with Next.js

Create a database client utility at `lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

This ensures proper connection pooling in development and production.
