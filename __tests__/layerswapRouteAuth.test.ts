import { swapBelongsToUser } from "../app/lib/layerswapAddressMatch";

describe("swapBelongsToUser Starknet canonicalization", () => {
  const padded =
    "0x0000000000000000000000000000000000000000000000000000000000001234";
  const short = "0x1234";

  it("matches padded LayerSwap addresses to canonical user addresses", () => {
    expect(
      swapBelongsToUser({
        linkedEvmAddresses: [],
        starknetAddresses: [padded],
        sourceAddress: short,
      }),
    ).toBe(true);
  });

  it("matches canonical addresses in either direction", () => {
    expect(
      swapBelongsToUser({
        linkedEvmAddresses: [],
        starknetAddresses: [short],
        destinationAddress: padded,
      }),
    ).toBe(true);
  });
});
