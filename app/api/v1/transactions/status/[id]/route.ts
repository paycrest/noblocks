import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { withRateLimit } from '@/app/lib/rate-limit';

export const PUT = withRateLimit(async (
    request: NextRequest,
    { params }: { params: { id: string } }
) => {
    try {

        const { id } = params;
        const body = await request.json();

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

        const { data, error } = await supabaseAdmin
            .from('transactions')
            .update({
                status: body.status,
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
