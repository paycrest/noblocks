import { NextRequest, NextResponse } from 'next/server';
// import { authMiddleware } from '@/middleware/auth';
import { supabaseAdmin } from '@/app/lib/supabase';
import { withRateLimit } from '@/app/lib/rate-limit';

export const PUT = withRateLimit(async (
    request: NextRequest,
    { params }: { params: { id: string } }
) => {
    try {
        // const authResult = await authMiddleware(request);
        // if ('status' in authResult) {
        //   return authResult;
        // }

        // const { walletAddress } = authResult;
        const { id } = params;
        const body = await request.json();

        // Verify transaction belongs to wallet
        const { data: transaction, error: fetchError } = await supabaseAdmin
            .from('transactions')
            .select('wallet_address')
            .eq('id', id)
            .single();

        if (fetchError || !transaction) {
            return NextResponse.json(
                { success: false, error: 'Transaction not found' },
                { status: 404 }
            );
        }

        // if (transaction.wallet_address !== walletAddress) {
        //   return NextResponse.json(
        //     { success: false, error: 'Unauthorized' },
        //     { status: 403 }
        //   );
        // }

        // Update transaction
        const { data, error } = await supabaseAdmin
            .from('transactions')
            .update({
                status: body.status,
                time_spent: body.timeSpent,
                tx_hash: body.txHash,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error updating transaction:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
})
