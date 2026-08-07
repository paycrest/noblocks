import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getLayerswapApiKey, layerswapGetSwap } from "@/app/lib/layerswap";
import { STARKNET_READY_ACCOUNT_CLASSHASH } from "@/app/lib/config";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";
import {
  requireLayerswapAuth,
  swapBelongsToUser,
} from "@/app/lib/layerswapRouteAuth";
import { computeReadyAddress, getStarknetWallet } from "@/app/lib/starknet";

export const GET = withRateLimit(async (request: NextRequest) => {
  const apiKey = getLayerswapApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LayerSwap is not configured" },
      { status: 503 },
    );
  }

  const authResult = await requireLayerswapAuth(request);
  if (!authResult.ok) return authResult.response;
  const { auth } = authResult;

  const swapId = request.nextUrl.searchParams.get("id") || "";
  const walletId = request.nextUrl.searchParams.get("walletId") || "";
  if (!swapId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  try {
    const data = await layerswapGetSwap({ apiKey, swapId });
    const linkedEvm = await collectLinkedEvmAddressesForPrivyUserId(auth.userId);

    const { publicKey } = await getStarknetWallet(walletId);
    const starknetAddress = computeReadyAddress(
      publicKey,
      STARKNET_READY_ACCOUNT_CLASSHASH,
    );

    const allowed = swapBelongsToUser({
      linkedEvmAddresses: linkedEvm,
      starknetAddresses: [starknetAddress],
      sourceAddress: data.swap?.source_address,
      destinationAddress: data.swap?.destination_address,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Swap not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      swap: {
        id: data.swap.id,
        status: data.swap.status,
        fail_reason: data.swap.fail_reason ?? null,
      },
      quote: data.quote
        ? {
            receive_amount: data.quote.receive_amount,
          }
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Swap lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
