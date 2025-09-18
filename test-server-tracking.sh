#!/bin/bash

echo "🧪 Testing Server-Side Analytics Tracking"
echo "========================================"
echo ""

# Check if server is running
echo "📡 Checking if server is running..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Server is running on http://localhost:3000"
else
    echo "❌ Server is not running. Please start with: npm run dev"
    exit 1
fi

echo ""
echo "🔍 Making API calls to trigger server-side tracking..."
echo ""

# Test 1: API endpoint without JWT (will show middleware analytics)
echo "Test 1: API call without JWT (should show middleware analytics)"
echo "------------------------------------------------------------"
curl -X GET http://localhost:3000/api/v1/transactions \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  2>/dev/null

echo ""
echo "✅ Check your terminal logs for:"
echo "   [Middleware Analytics] API Request: GET /api/v1/transactions"
echo "   [Middleware Analytics] API Error: Missing JWT"
echo ""

# Test 2: API endpoint with invalid JWT (will show middleware analytics)
echo "Test 2: API call with invalid JWT (should show middleware analytics)"
echo "----------------------------------------------------------------"
curl -X GET http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  2>/dev/null

echo ""
echo "✅ Check your terminal logs for:"
echo "   [Middleware Analytics] API Request: GET /api/v1/transactions"
echo "   [Middleware Analytics] API Error: JWT Verification Failed"
echo ""

# Test 3: Check if any other API endpoints exist
echo "Test 3: Checking for other API endpoints"
echo "---------------------------------------"
if [ -d "app/api" ]; then
    echo "Available API endpoints:"
    find app/api -name "route.ts" | sed 's|app/api/|/api/|' | sed 's|/route.ts||' | sort
else
    echo "No API directory found"
fi

echo ""
echo "🎯 What to Look For in Your Terminal:"
echo "====================================="
echo "1. [Middleware Analytics] - Shows all API requests"
echo "2. [Server Analytics] - Shows server-side Mixpanel events"
echo "3. Check your Mixpanel dashboard for events with 'server_side: true'"
echo ""
echo "💡 Tip: Keep your terminal open where you're running 'npm run dev'"
echo "   to see the analytics logs in real-time!"
