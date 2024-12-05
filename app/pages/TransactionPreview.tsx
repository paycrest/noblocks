"use client";
import Image from "next/image";
import { TbInfoSquareRounded } from "react-icons/tb";

import { usePublicClient } from "wagmi";

import {
  fetchSupportedTokens,
  formatCurrency,
  formatNumberWithCommas,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  publicKeyEncrypt,
} from "../utils";
import { useNetwork } from "../context/NetworksContext";
import type { Token, TransactionPreviewProps } from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import { gatewayAbi } from "../api/abi";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
  BaseError,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  parseUnits,
  erc20Abi,
} from "viem";
import { useEffect, useState } from "react";
import { fetchAggregatorPublicKey } from "../api/aggregator";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";

/**
 * Renders a preview of a transaction with the provided details.
 *
 * @param handleBackButtonClick - Function to handle the back button click event.
 * @param stateProps - Object containing the form values, rate, institutions, and loading states.
 */
export const TransactionPreview = ({
  handleBackButtonClick,
  stateProps,
}: TransactionPreviewProps) => {
  const { user } = usePrivy();
  const { client } = useSmartWallets();
  const { selectedNetwork } = useNetwork();
  const publicClient = usePublicClient();
  const { setCurrentStep } = useStep();

  const {
    rate,
    formValues,
    institutions: supportedInstitutions,
    setOrderId,
    setCreatedAt,
    setTransactionStatus,
  } = stateProps;

  const {
    amountSent,
    amountReceived,
    token,
    currency,
    institution,
    recipientName,
    accountIdentifier,
    memo,
  } = formValues;

  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0); // Used to trigger toast
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isOrderCreatedLogsFetched, setIsOrderCreatedLogsFetched] =
    useState<boolean>(false);

  // Rendered tsx info
  const renderedInfo = {
    amount: `${formatNumberWithCommas(amountSent ?? 0)} ${token}`,
    totalValue: `${formatCurrency(amountReceived ?? 0, currency, `en-${currency.slice(0, 2)}`)}`,
    recipient: recipientName
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    account: `${accountIdentifier} • ${getInstitutionNameByCode(institution, supportedInstitutions)}`,
    description: memo || "N/A",
    network: selectedNetwork.name,
  };

  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.name) || [];

  const tokenAddress = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token,
  )?.address as `0x${string}`;

  const tokenDecimals = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token,
  )?.decimals;

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const prepareCreateOrderParams = async () => {
    // Prepare recipient data
    const recipient = {
      accountIdentifier: formValues.accountIdentifier,
      accountName: recipientName,
      institution: formValues.institution,
      memo: formValues.memo,
    };

    // Fetch aggregator public key
    const publicKey = await fetchAggregatorPublicKey();
    const encryptedRecipient = publicKeyEncrypt(recipient, publicKey.data);

    // Prepare transaction parameters
    const params = {
      token: tokenAddress,
      amount: parseUnits(amountSent.toString(), tokenDecimals!),
      rate: parseUnits(rate.toString(), 0),
      senderFeeRecipient: getAddress(
        "0x0000000000000000000000000000000000000000",
      ),
      senderFee: BigInt(0),
      refundAddress: smartWallet?.address as `0x${string}`,
      messageHash: encryptedRecipient,
    };

    return params;
  };

  const createOrder = async () => {
    try {
      if (!client) {
        throw new Error("Smart wallet not found");
      }

      await client.switchChain({
        id: selectedNetwork.chainId,
      });

      const params = await prepareCreateOrderParams();
      setCreatedAt(new Date().toISOString());

      const hash = await client?.sendTransaction({
        calls: [
          // Approve gateway contract to spend token
          {
            to: tokenAddress,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [
                getAddress(
                  getGatewayContractAddress(selectedNetwork.name) || "",
                ),
                parseUnits(amountSent.toString(), tokenDecimals!),
              ],
            }),
          },
          // Create order
          {
            to: getGatewayContractAddress(
              selectedNetwork.name,
            ) as `0x${string}`,
            data: encodeFunctionData({
              abi: gatewayAbi,
              functionName: "createOrder",
              args: [
                params.token,
                params.amount,
                params.rate,
                params.senderFeeRecipient,
                params.senderFee,
                params.refundAddress!,
                params.messageHash,
              ],
            }),
          },
        ],
      });

      console.log("hash", hash);
      await getOrderId();
    } catch (e: any) {
      setErrorMessage((e as BaseError).shortMessage);
      setIsConfirming(false);
    }
  };

  const handlePaymentConfirmation = async () => {
    try {
      setIsConfirming(true);
      await createOrder();
    } catch (e: any) {
      setErrorMessage((e as BaseError).shortMessage);
      setErrorCount((prevCount) => prevCount + 1);
      setIsConfirming(false);
    }
  };

  const getOrderId = async () => {
    let intervalId: NodeJS.Timeout;

    console.log(
      publicClient,
      isConfirming,
      user,
      isOrderCreatedLogsFetched,
      selectedNetwork.name,
    );

    if (!publicClient || !user || isOrderCreatedLogsFetched) return;

    const getOrderCreatedLogs = async () => {
      try {
        const toBlock = await publicClient.getBlockNumber();
        const logs = await publicClient.getContractEvents({
          address: getGatewayContractAddress(
            selectedNetwork.name,
          ) as `0x${string}`,
          abi: gatewayAbi,
          eventName: "OrderCreated",
          args: {
            sender: smartWallet?.address as `0x${string}`,
            token: tokenAddress,
          },
          fromBlock: toBlock - BigInt(10),
          toBlock: toBlock,
        });

        console.log("logs", logs);

        if (logs.length > 0) {
          const decodedLog = decodeEventLog({
            abi: gatewayAbi,
            eventName: "OrderCreated",
            data: logs[0].data,
            topics: logs[0].topics,
          });

          console.log("decodedLog", decodedLog);

          setIsOrderCreatedLogsFetched(true);
          clearInterval(intervalId);
          setOrderId(decodedLog.args.orderId);
          setCreatedAt(new Date().toISOString());
          setTransactionStatus("pending");
          setCurrentStep("status");
        }
      } catch (error) {
        console.error("Error fetching OrderCreated logs:", error);
      }
    };

    // Initial call
    getOrderCreatedLogs();

    // Set up polling
    intervalId = setInterval(getOrderCreatedLogs, 2000);

    // Cleanup function
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  };

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorCount, errorMessage]);

  return (
    <div className="grid gap-6 py-10 text-sm">
      <div className="grid gap-4">
        <h2 className="text-xl font-medium text-neutral-900 dark:text-white/80">
          Review transaction
        </h2>
        <p className="text-gray-500 dark:text-white/50">
          Verify transaction details before you send
        </p>
      </div>

      <div className="grid gap-4">
        {/* Render transaction information */}
        {Object.entries(renderedInfo).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <h3 className="w-full max-w-28 capitalize text-gray-500 dark:text-white/50 sm:max-w-40">
              {/* Capitalize the first letter of the key */}
              {key === "totalValue" ? "Total value" : key}
            </h3>
            <p className="flex flex-grow items-center gap-1 text-neutral-900 dark:text-white/80">
              {/* Render token logo for amount and fee */}
              {(key === "amount" || key === "fee") && (
                <Image
                  src={`/logos/${token.toLowerCase()}-logo.svg`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}

              {/* Render network logo for network */}
              {key === "network" && (
                <Image
                  src={`/logos/${value.toLowerCase()}-logo.svg`}
                  alt={`${value} logo`}
                  width={14}
                  height={14}
                />
              )}
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Transaction detail disclaimer */}
      <div className="flex gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
        <TbInfoSquareRounded className="w-8 text-xl" />
        <p>
          Ensure the details above are correct. Failed transaction due to wrong
          details may attract a refund fee
        </p>
      </div>

      <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />

      {/* CTAs */}
      <div className="flex gap-6">
        <button
          type="button"
          onClick={handleBackButtonClick}
          className={`w-fit ${secondaryBtnClasses}`}
        >
          Back
        </button>
        <button
          type="submit"
          className={`w-full ${primaryBtnClasses}`}
          onClick={handlePaymentConfirmation}
          disabled={isConfirming}
        >
          {isConfirming ? "Confirming..." : "Confirm payment"}
        </button>
      </div>
    </div>
  );
};
