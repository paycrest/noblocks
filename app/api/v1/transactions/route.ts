import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from "@/middleware/auth";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from '@/app/lib/rate-limit';
import type { Transaction, TransactionHistory, TransactionResponse } from '@/app/types';

export const GET = withRateLimit(async (request: NextRequest) => {
    try {
        // // Rate limiting
        // const limiter = await rateLimit(request);
        // if (!limiter.success) {
        //     return NextResponse.json(
        //         { success: false, error: 'Too many requests' },
        //         { status: 429 }
        //     );
        // }

        // Validate JWT
        // const authResult = await authMiddleware(request);
        // if (authResult instanceof NextResponse) {
        //     return authResult;
        // }

        // const walletAddress = authResult;
        // const walletAddress = " 0xb17cC6D4EfBB38167509A3c1d2741A55aC305cF6"
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        // Query transactions
        const { data: transactions, error, count } = await supabaseAdmin
            .from('transactions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw error;
        }

        const response: TransactionResponse = {
            success: true,
            data: {
                total: count || 0,
                page,
                limit,
                transactions: transactions as TransactionHistory[],
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
})

export const POST = withRateLimit(async (request: NextRequest) => {
    try {
        // Rate limiting
        // const limiter = await rateLimit(request);
        // if (!limiter.success) {
        //     return NextResponse.json(
        //         { success: false, error: 'Too many requests' },
        //         { status: 429 }
        //     );
        // }

        // Validate JWT
        // const authResult = await authMiddleware(request);
        // if (authResult instanceof NextResponse) {
        //     return authResult;
        // }

        // const walletAddress = authResult;
        const body = await request.json();

        // Validate wallet address matches JWT
        // if (body.walletAddress !== walletAddress) {
        //     return NextResponse.json(
        //         { success: false, error: 'Unauthorized' },
        //         { status: 403 }
        //     );
        // }

        // Insert transaction
        const { data, error } = await supabaseAdmin.from('transactions').insert({
            wallet_address: body.walletAddress,
            transaction_type: body.transactionType,
            from_currency: body.fromCurrency,
            to_currency: body.toCurrency,
            amount_sent: body.amountSent,
            amount_received: body.amountReceived,
            fee: body.fee,
            recipient: body.recipient,
            status: body.status,
            memo: body.memo,
            tx_hash: body.txHash,
        }).select().single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (error) {
        console.error('Error creating transaction:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
})