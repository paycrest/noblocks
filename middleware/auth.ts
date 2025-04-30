import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { supabaseAdmin } from '@/app/lib/supabase';

export async function authMiddleware(req: NextRequest): Promise<{ walletAddress: string } | NextResponse> {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!process.env.NEXT_THIRDWEB_PUBLIC_KEY) {
        throw new Error('Missing env.NEXT_THIRDWEB_PUBLIC_KEY');
    }

    if (!token) {
        return NextResponse.json({ error: 'Missing JWT' }, { status: 401 });
    }

    try {
        // Verify Thirdweb JWT using the public key
        const thirdwebPublicKey = process.env.NEXT_THIRDWEB_PUBLIC_KEY!;
        const payload = verify(token, thirdwebPublicKey, {
            algorithms: ['RS256'],
            issuer: 'thirdweb.com',
        }) as { sub: string;[key: string]: any };

        const walletAddress = payload.sub;
        if (!walletAddress) {
            return NextResponse.json({ error: 'Invalid JWT: Missing wallet address' }, { status: 401 });
        }

        // Set the wallet address for Supabase RLS
        const { error } = await supabaseAdmin.rpc('set_current_wallet_address', {
            wallet_address: walletAddress,
        });

        if (error) {
            console.error('Supabase RLS error:', error);
            return NextResponse.json({ error: 'Failed to set wallet address for RLS' }, { status: 500 });
        }

        return { walletAddress };
    } catch (error) {
        console.error('JWT verification error:', error);
        return NextResponse.json({ error: 'Invalid JWT' }, { status: 401 });
    }
}
