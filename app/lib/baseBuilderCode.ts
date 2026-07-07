import { concatHex, type Hex } from "viem";

export const BASE_MAINNET_CHAIN_ID = 8453;

/** bc_julg9gbq — must match aggregator/services/builder_code.go */
export const BASE_BUILDER_CODE_SUFFIX =
  "0x62635f6a756c67396762710b0080218021802180218021802180218021" as const;

export function appendBaseBuilderCode(chainId: number, data: Hex): Hex {
  if (chainId !== BASE_MAINNET_CHAIN_ID) return data;
  return concatHex([data, BASE_BUILDER_CODE_SUFFIX]);
}
