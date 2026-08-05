import { base } from "viem/chains";
import { buildLayerswapDepositBatchCalls } from "../app/lib/layerswapExecute";

jest.mock("../app/lib/erc20Allowance", () => ({
  needsGatewayApproval: jest.fn().mockResolvedValue(false),
}));

describe("buildLayerswapDepositBatchCalls", () => {
  it("does not attach native value for ERC-20 deposit actions", async () => {
    const calls = await buildLayerswapDepositBatchCalls({
      chain: base,
      rpcUrl: "https://rpc.example",
      fromAddress: "0x2222222222222222222222222222222222222222",
      tokenAmountBaseUnits: BigInt(50_000),
      depositActions: [
        {
          type: "transfer",
          to_address: "0x3333333333333333333333333333333333333333",
          amount: 0.05,
          amount_in_base_units: "50000",
          order: 0,
          call_data: "0xdeadbeef",
          token: {
            contract: "0x1111111111111111111111111111111111111111",
            symbol: "USDC",
            decimals: 6,
          },
        },
      ],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.value).toBe(BigInt(0));
  });
});
