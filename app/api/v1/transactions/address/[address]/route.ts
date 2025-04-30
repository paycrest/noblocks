import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/middleware/auth';
import { supabaseAdmin } from '@/app/lib/supabase';
import type { TransactionHistory, TransactionResponse } from '@/app/types';
import { withRateLimit } from '@/app/lib/rate-limit';

export const GET = withRateLimit(async (
    request: NextRequest,
    { params }: { params: { address: string } }
) => {
    try {

        const { address } = params;
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        // Query transactions for specific wallet
        const { data: transactions, error, count } = await supabaseAdmin
            .from('transactions')
            .select('*', { count: 'exact' })
            .eq('wallet_address', address)
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