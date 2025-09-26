import { NextRequest, NextResponse } from 'next/server';
import { trackServerEvent } from '@/app/lib/server-analytics';

export async function GET(request: NextRequest) {
  try {
    // Track a test server-side event
    trackServerEvent('Test Server Event', {
      endpoint: '/api/test-mixpanel',
      method: 'GET',
      test: true,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Server-side event sent to Mixpanel!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to send event' 
    }, { status: 500 });
  }
}
