import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/app/lib/jwt';
import { supabaseAdmin } from '@/app/lib/supabase';
import { getWalletAddressFromPrivyUserId } from '@/app/lib/privy';
import { DEFAULT_PRIVY_CONFIG } from '@/app/lib/config';

async function authorizationMiddleware(req: NextRequest) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return NextResponse.json({ error: 'Missing JWT' }, { status: 401 });
    }

    try {
        const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
        const privyUserId = payload.sub;

        if (!privyUserId) {
            return NextResponse.json({ error: 'Invalid JWT: Missing subject' }, { status: 401 });
        }
        const walletAddress = await getWalletAddressFromPrivyUserId(privyUserId);

        try {
            const { error } = await supabaseAdmin.rpc('set_current_wallet_address', {
                wallet_address: walletAddress,
            });

            if (error) {
                console.error('Failed to set wallet address for RLS:', error);
            }
        } catch (rpcError) {
            console.error('RPC error when setting wallet address:', rpcError);
        }

        const response = NextResponse.next();
        response.headers.set('x-wallet-address', walletAddress);
        
        return response;
    } catch (error) {
        console.error('JWT verification error in middleware:', error);
        return NextResponse.json({ error: 'Invalid JWT' }, { status: 401 });
    }
}

export default authorizationMiddleware;

export const config = {
    matcher: [
        '/api/v1/transactions',
        '/api/v1/transactions/:path*'
    ],
};