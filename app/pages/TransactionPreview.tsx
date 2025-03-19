"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import {
  calculateDuration,
  classNames,
  fetchSupportedTokens,
  formatCurrency,
  formatNumberWithCommas,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  getRpcUrl,
  publicKeyEncrypt,
} from "../utils";
import { useNetwork } from "../context/NetworksContext";
import type { Token, TransactionPreviewProps } from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import { gatewayAbi } from "../api/abi";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
  type BaseError,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  parseUnits,
  erc20Abi,
  createPublicClient,
  http,
} from "viem";
import { useBalance, useInjectedWallet, useStep } from "../context";

import { fetchAggregatorPublicKey } from "../api/aggregator";
import { trackEvent } from "../hooks/analytics";
import { ImSpinner } from "react-icons/im";
import { InformationSquareIcon } from "hugeicons-react";
import { bsc } from "viem/chains";

/**
 * Renders a preview of a transaction with the provided details.
 *
 * @param handleBackButtonClick - Function to handle the back button click event.
 * @param stateProps - Object containing the form values, rate, institutions, and loading states.
 */
export const TransactionPreview = ({
  handleBackButtonClick,
  stateProps,
  createdAt,
}: TransactionPreviewProps) => {
  const { user } = usePrivy();
  const { client } = useSmartWallets();
  const { isInjectedWallet, injectedAddress, injectedProvider, injectedReady } =
    useInjectedWallet();

  const { selectedNetwork } = useNetwork();
  const { currentStep, setCurrentStep } = useStep();
  const { refreshBalance, smartWalletBalance, injectedWalletBalance } =
    useBalance();

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

  const searchParams = useSearchParams();

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
    ...(memo && { description: memo }),
    network: selectedNetwork.chain.name,
  };

  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];

  const tokenAddress = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.address as `0x${string}`;

  const tokenDecimals = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.decimals;

  const injectedWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" }
    : null;

  const smartWallet = isInjectedWallet
    ? null
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const activeWallet = injectedWallet || smartWallet;

  const balance = injectedWallet
    ? injectedWalletBalance?.balances[token] || 0
    : smartWalletBalance?.balances[token] || 0;

  const prepareCreateOrderParams = async () => {
    const providerId =
      searchParams.get("provider") || searchParams.get("PROVIDER");

    // Prepare recipient data
    const recipient = {
      accountIdentifier: formValues.accountIdentifier,
      accountName: recipientName,
      institution: formValues.institution,
      memo: formValues.memo,
      ...(providerId && { providerId }),
      nonce: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    };

    // Fetch aggregator public key
    const publicKey = await fetchAggregatorPublicKey();
    const encryptedRecipient = publicKeyEncrypt(recipient, publicKey.data);

    // Prepare transaction parameters
    const params = {
      token: tokenAddress,
      amount: parseUnits(amountSent.toString(), tokenDecimals ?? 18),
      rate: BigInt(Math.round(rate * 100)),
      senderFeeRecipient: getAddress(
        "0x0000000000000000000000000000000000000000",
      ),
      senderFee: BigInt(0),
      refundAddress: activeWallet?.address as `0x${string}`,
      messageHash: encryptedRecipient,
    };

    return params;
  };

  const createOrder = async () => {
    try {
      if (isInjectedWallet && injectedProvider) {
        // Injected wallet
        if (!injectedReady) {
          throw new Error("Injected wallet not ready");
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        // Send approval transaction
        const approvalTx = await injectedProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: injectedAddress,
              to: tokenAddress,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [
                  getGatewayContractAddress(
                    selectedNetwork.chain.name,
                  ) as `0x${string}`,
                  parseUnits(amountSent.toString(), tokenDecimals ?? 18),
                ],
              }),
            },
          ],
        });

        try {
          const publicClient = createPublicClient({
            chain: selectedNetwork.chain,
            transport: http(getRpcUrl(selectedNetwork.chain.name)),
          });

          await publicClient.waitForTransactionReceipt({
            hash: approvalTx as `0x${string}`,
          });
          toast.success("Token spending approved");
        } catch (error) {
          toast.error("Approval failed");
          throw new Error("Approval transaction failed");
        }

        // Create order transaction
        await injectedProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: injectedAddress,
              to: getGatewayContractAddress(
                selectedNetwork.chain.name,
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
                  params.refundAddress ?? "",
                  params.messageHash,
                ],
              }),
            },
          ],
        });
      } else {
        // Smart wallet
        if (!client) {
          throw new Error("Smart wallet not found");
        }

        await client.switchChain({
          id: selectedNetwork.chain.id,
        });

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        await client.sendTransaction({
          calls: [
            // Approve gateway contract to spend token
            {
              to: tokenAddress,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [
                  getGatewayContractAddress(
                    selectedNetwork.chain.name,
                  ) as `0x${string}`,
                  parseUnits(amountSent.toString(), tokenDecimals ?? 18),
                ],
              }),
            },
            // Create order
            {
              to: getGatewayContractAddress(
                selectedNetwork.chain.name,
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
                  params.refundAddress ?? "",
                  params.messageHash,
                ],
              }),
            },
          ],
        });
      }

      await getOrderId();
      refreshBalance(); // Refresh balance after order is created

      trackEvent("Swap started", {
        "Entry point": "Transaction preview",
      });
    } catch (e) {
      const error = e as BaseError;
      setErrorMessage(error.shortMessage || error.message);
      setIsConfirming(false);
      trackEvent("Swap Failed", {
        Amount: amountSent,
        "Send token": token,
        "Receive currency": currency,
        "Recipient bank": getInstitutionNameByCode(
          institution,
          supportedInstitutions,
        ),
        "Wallet balance": balance,
        "Swap date": createdAt,
        "Reason for failure": error.shortMessage || error.message,
        "Transaction duration": calculateDuration(
          createdAt,
          new Date().toISOString(),
        ),
      });
    }
  };

  const handlePaymentConfirmation = async () => {
    if (amountSent > balance) {
      toast.warning("Low balance. Fund your wallet.", {
        description: "Insufficient funds. Please add money to continue.",
      });
      return;
    }

    try {
      setIsConfirming(true);
      await createOrder();
    } catch (e) {
      const error = e as BaseError;
      setErrorMessage(error.shortMessage);
      setErrorCount((prevCount: number) => prevCount + 1);
      setIsConfirming(false);
    }
  };

  const getOrderId = async () => {
    let intervalId: NodeJS.Timeout;

    const getOrderCreatedLogs = async () => {
      const publicClient = createPublicClient({
        chain: selectedNetwork.chain,
        transport: http(getRpcUrl(selectedNetwork.chain.name)),
      });

      if (!publicClient || !activeWallet?.address || isOrderCreatedLogsFetched)
        return;

      try {
        if (currentStep !== "preview") {
          return () => {
            if (intervalId) clearInterval(intervalId);
          };
        }

        const toBlock = await publicClient.getBlockNumber();
        const logs = await publicClient.getContractEvents({
          address: getGatewayContractAddress(
            selectedNetwork.chain.name,
          ) as `0x${string}`,
          abi: gatewayAbi,
          eventName: "OrderCreated",
          args: {
            sender: activeWallet.address as `0x${string}`,
            token: tokenAddress,
            amount: parseUnits(amountSent.toString(), tokenDecimals ?? 18),
          },
          fromBlock: toBlock - BigInt(10),
          toBlock: toBlock,
        });

        if (logs.length > 0) {
          const decodedLog = decodeEventLog({
            abi: gatewayAbi,
            eventName: "OrderCreated",
            data: logs[0].data,
            topics: logs[0].topics,
          });

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

  useEffect(
    function displayErrorToast() {
      if (errorMessage) {
        toast.error(errorMessage);
      }
    },
    [errorCount, errorMessage],
  );

  return (
    <div className="mx-auto grid max-w-[27.3125rem] gap-6 py-10 text-sm">
      <div className="grid gap-4">
        <h2 className="text-xl font-medium text-text-body dark:text-white/80">
          Review transaction
        </h2>
        <p className="text-text-secondary dark:text-white/50">
          Verify transaction details before you send
        </p>
      </div>

      <div className="grid gap-4">
        {Object.entries(renderedInfo).map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-2">
            <h3 className="w-full max-w-28 text-text-secondary dark:text-white/50 sm:max-w-40">
              {key === "totalValue"
                ? "Total value"
                : key.charAt(0).toUpperCase() + key.slice(1)}
            </h3>

            <p className="flex flex-grow items-center gap-1 font-medium text-text-body dark:text-white/80">
              {(key === "amount" || key === "fee") && (
                <Image
                  src={`/logos/${String(token)?.toLowerCase()}-logo.${token === "cNGN" ? "png" : "svg"}`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}

              {key === "network" && (
                <Image
                  src={`/logos/${value.toLowerCase().replace(/ /g, "-")}-logo.svg`}
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
      <div className="flex gap-2.5 rounded-xl border border-border-light bg-background-neutral p-3 text-text-secondary dark:border-white/5 dark:bg-white/5 dark:text-white/50">
        <InformationSquareIcon className="mt-1 size-4 flex-shrink-0" />
        <p>
          Ensure the details above are correct. Failed transaction due to wrong
          details may attract a refund fee
        </p>
      </div>

      {/* CTAs */}
      <div className="flex gap-4 xsm:gap-6">
        <button
          type="button"
          onClick={handleBackButtonClick}
          className={classNames(secondaryBtnClasses)}
          disabled={isConfirming}
        >
          Back
        </button>
        <button
          type="submit"
          className={classNames(primaryBtnClasses, "w-full")}
          onClick={handlePaymentConfirmation}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <ImSpinner className="animate-spin" />
              Confirming...
            </span>
          ) : (
            "Confirm payment"
          )}
        </button>
      </div>
    </div>
  );
};
