import type { Address, Chain, Hex } from "viem";
import type { ConnectedWallet } from "@privy-io/react-auth";

/**
 * Executes a supertransaction on Biconomy using quote → execute pattern.
 * This both deploys the Nexus smart account if needed, and executes instructions.
 */
export async function getBiconomyExecutor({
  smartWalletAddress,
  privyWallet,
  chain,
  authorization, // Already signed EIP‑7702
  instructions,
}: {
  smartWalletAddress: Address;
  privyWallet: ConnectedWallet;
  chain: Chain;
  authorization: any;
  instructions: { to: string; value: bigint; data: Hex }[];
}) {
  const apiKey = process.env.NEXT_PUBLIC_BICONOMY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing BICONOMY_API_KEY env");
  }

  // 1) Prepare quote request
  const quoteBody = {
    mode: "eoa-7702",
    ownerAddress: smartWalletAddress,
    authorization,
    instructions,
    feeToken: {
      address: "0x0000000000000000000000000000000000000000",
      chainId: chain.id,
    }
  };

  // 2) Fetch a quote from Biconomy
  const quoteRes = await fetch("https://network.biconomy.io/v1/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(quoteBody),
  });

  if (!quoteRes.ok) {
    const body = await quoteRes.text();
    throw new Error(`Quote failed: ${quoteRes.status} ${body}`);
  }

  const quoteData = await quoteRes.json();

  // 3) Sign each payload message from the quote
  const signedPayloads = await Promise.all(
    quoteData.payloadToSign.map(async (p: any) => {
      const sig = await privyWallet.getEthereumProvider().then((provider) =>
        provider.request({
          method: "personal_sign",
          params: [p.message, privyWallet.address],
        })
      );
      return { ...p, signature: sig };
    })
  );

  // 4) Execute the supertransaction
  const execBody = {
    ...quoteData,
    payloadToSign: signedPayloads,
  };

  const execRes = await fetch("https://network.biconomy.io/v1/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(execBody),
  });

  if (!execRes.ok) {
    const body = await execRes.text();
    throw new Error(`Execute failed: ${execRes.status} ${body}`);
  }

  const execData = await execRes.json();

  return {
    executeSuperTx: async () => {
      return { hash: execData.supertxHash as `0x${string}` };
    }
  };
}
