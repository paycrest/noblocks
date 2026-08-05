import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "./jwt";
import { DEFAULT_PRIVY_CONFIG, STARKNET_READY_ACCOUNT_CLASSHASH } from "./config";
import { collectLinkedEvmAddressesForPrivyUserId } from "./privy";
import { computeReadyAddress, getStarknetWallet } from "./starknet";

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

export type LayerswapAuthContext = {
  userId: string;
  token: string;
};

export async function requireLayerswapAuth(
  request: NextRequest,
): Promise<
  { ok: true; auth: LayerswapAuthContext } | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.substring(7);
  try {
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const userId = payload.sub || payload.userId;
    if (!userId || typeof userId !== "string") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid token: missing user ID" },
          { status: 401 },
        ),
      };
    }
    return { ok: true, auth: { userId, token } };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}

export async function assertEvmAddressOwnedByUser(
  userId: string,
  address: string,
): Promise<boolean> {
  const normalized = address.toLowerCase();
  if (!EVM_ADDRESS_LOWER.test(normalized)) return false;
  const linked = await collectLinkedEvmAddressesForPrivyUserId(userId);
  return linked.includes(normalized);
}

function normalizeStarknetAddress(address: string): string {
  return address.trim().toLowerCase();
}

export async function assertStarknetAddressOwnedByUser(
  _userId: string,
  walletId: string,
  starknetAddress: string,
): Promise<boolean> {
  if (!walletId || !starknetAddress) return false;
  try {
    const { publicKey } = await getStarknetWallet(walletId);
    const computed = computeReadyAddress(publicKey, STARKNET_READY_ACCOUNT_CLASSHASH);
    return (
      normalizeStarknetAddress(computed) ===
      normalizeStarknetAddress(starknetAddress)
    );
  } catch {
    return false;
  }
}

export function swapBelongsToUser(params: {
  linkedEvmAddresses: string[];
  starknetAddresses: string[];
  sourceAddress?: string | null;
  destinationAddress?: string | null;
}): boolean {
  const { linkedEvmAddresses, starknetAddresses, sourceAddress, destinationAddress } =
    params;

  const evmSet = new Set(linkedEvmAddresses.map((a) => a.toLowerCase()));
  const starkSet = new Set(starknetAddresses.map(normalizeStarknetAddress));

  const source = sourceAddress?.trim().toLowerCase();
  const destination = destinationAddress?.trim().toLowerCase();

  if (source && EVM_ADDRESS_LOWER.test(source) && evmSet.has(source)) {
    return true;
  }
  if (source && starkSet.has(normalizeStarknetAddress(source))) {
    return true;
  }
  if (destination && EVM_ADDRESS_LOWER.test(destination) && evmSet.has(destination)) {
    return true;
  }
  if (destination && starkSet.has(normalizeStarknetAddress(destination))) {
    return true;
  }
  return false;
}
