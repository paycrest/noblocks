import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { trackApiRequest, trackApiResponse, trackApiError } from '@/app/lib/server-analytics';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    trackApiRequest(request, '/api/kyc/transaction-summary', 'GET');

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      trackApiError(request, '/api/kyc/transaction-summary', 'GET', new Error('Missing wallet address'), 400);
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch transactions from the last 30 days
    const { data: transactions, error } = await supabaseAdmin
      .from('transactions')
      .select('amount_sent, created_at')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('status', 'completed')
      .gte('created_at', monthStart.toISOString());

    if (error) {
      console.error('Error fetching transaction summary:', error);
      trackApiError(request, '/api/kyc/transaction-summary', 'GET', error, 500);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch transaction summary' },
        { status: 500 }
      );
    }

    let dailySpent = 0;
    let monthlySpent = 0;
    let lastTransactionDate: string | null = null;

    transactions?.forEach(tx => {
      const txDate = new Date(tx.created_at);
      const amount = parseFloat(tx.amount_sent) || 0;
      
      monthlySpent += amount;
      
      if (txDate >= today) {
        dailySpent += amount;
      }

      if (!lastTransactionDate || txDate > new Date(lastTransactionDate)) {
        lastTransactionDate = tx.created_at;
      }
    });

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/kyc/transaction-summary', 'GET', 200, responseTime);

    return NextResponse.json({
      success: true,
      dailySpent,
      monthlySpent,
      lastTransactionDate,
    });

  } catch (error) {
    console.error('Transaction summary error:', error);
    trackApiError(request, '/api/kyc/transaction-summary', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}