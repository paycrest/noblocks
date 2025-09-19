import { NextRequest, NextResponse } from 'next/server';
import { trackServerEvent } from '@/app/lib/server-analytics';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, privyUserId, logoutMethod } = body;

    if (!walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }

    // Track server-side logout event
    trackServerEvent('Server Logout Detected', {
      wallet_address: walletAddress,
      privy_user_id: privyUserId || 'unknown',
      logout_method: logoutMethod || 'unknown',
      logout_source: 'client_request',
      timestamp: new Date().toISOString()
    }, walletAddress);

    return NextResponse.json({ 
      success: true, 
      message: 'Logout event tracked successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Logout tracking error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to track logout event' 
    }, { status: 500 });
  }
}
