import { normalizeStarknetAddress as canonicalizeStarknetAddress } from "../utils";

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

export function normalizeStarknetAddressForCompare(
  address: string,
): string | null {
  try {
    return canonicalizeStarknetAddress(address).toLowerCase();
  } catch {
    return null;
  }
}

export function starknetAddressMatches(
  candidate: string,
  canonical: string,
): boolean {
  const normalizedCandidate = normalizeStarknetAddressForCompare(candidate);
  const normalizedCanonical = normalizeStarknetAddressForCompare(canonical);
  return (
    normalizedCandidate !== null &&
    normalizedCanonical !== null &&
    normalizedCandidate === normalizedCanonical
  );
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
  const starkSet = new Set(
    starknetAddresses
      .map(normalizeStarknetAddressForCompare)
      .filter((a): a is string => a !== null),
  );

  const source = sourceAddress?.trim().toLowerCase();
  const destination = destinationAddress?.trim().toLowerCase();

  if (source && EVM_ADDRESS_LOWER.test(source) && evmSet.has(source)) {
    return true;
  }
  const normalizedSource = sourceAddress
    ? normalizeStarknetAddressForCompare(sourceAddress)
    : null;
  if (normalizedSource && starkSet.has(normalizedSource)) {
    return true;
  }
  if (destination && EVM_ADDRESS_LOWER.test(destination) && evmSet.has(destination)) {
    return true;
  }
  const normalizedDestination = destinationAddress
    ? normalizeStarknetAddressForCompare(destinationAddress)
    : null;
  if (normalizedDestination && starkSet.has(normalizedDestination)) {
    return true;
  }
  return false;
}
