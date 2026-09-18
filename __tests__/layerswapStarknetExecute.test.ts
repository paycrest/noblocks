jest.mock("server-only", () => ({}));

import { layerswapDepositActionsToStarknetCalls } from "../app/lib/layerswap";

describe("layerswapDepositActionsToStarknetCalls", () => {
  it("parses LayerSwap Starknet JSON call_data", () => {
    const calls = layerswapDepositActionsToStarknetCalls([
      {
        type: "transfer",
        to_address: "0xdepository",
        amount: 0.05,
        amount_in_base_units: "50000",
        order: 0,
        call_data: JSON.stringify([
          {
            contractAddress:
              "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
            entrypoint: "transfer",
            calldata: ["0x1", "50000", "0"],
          },
        ]),
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.entrypoint).toBe("transfer");
    expect(calls[0]?.calldata).toEqual(["0x1", "50000", "0"]);
  });
});
