import { RpcProvider } from "starknet";

export function createStarknetRpcProvider(
  nodeUrl: string | undefined,
): RpcProvider {
  return new RpcProvider({ nodeUrl });
}
