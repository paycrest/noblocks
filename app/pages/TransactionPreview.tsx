"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import {
  prepareContractCall,
  getContract,
  type PreparedTransaction,
  type PrepareTransactionOptions,
  Chain,
} from "thirdweb";
import { type AbiFunction } from "viem";
import { erc20Abi } from "viem";
import { THIRDWEB_CLIENT } from "../lib/thirdweb/client";

import {
  calculateDuration,
  classNames,
  fetchSupportedTokens,
  formatCurrency,
  formatNumberWithCommas,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  getNetworkImageUrl,
  getRpcUrl,
  publicKeyEncrypt,
} from "../utils";
import { useNetwork } from "../context/NetworksContext";
import type { Token, TransactionPreviewProps } from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import { gatewayAbi } from "../api/abi";
import {
  type BaseError,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  parseUnits,
  createPublicClient,
  http,
} from "viem";
import { useBalance, useInjectedWallet, useStep } from "../context";

import { fetchAggregatorPublicKey, saveTransaction } from "../api/aggregator";
import { trackEvent } from "../hooks/analytics";
import { ImSpinner } from "react-icons/im";
import { InformationSquareIcon } from "hugeicons-react";
import { PiCheckCircleFill } from "react-icons/pi";
import { TbCircleDashed } from "react-icons/tb";
import { useActualTheme } from "../hooks/useActualTheme";

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
  const isDark = useActualTheme();
  const { isInjectedWallet, injectedAddress, injectedProvider, injectedReady } =
    useInjectedWallet();

  const account = useActiveAccount();
  const isAuthenticated = !!account;

  const { selectedNetwork } = useNetwork();
  const { currentStep, setCurrentStep } = useStep();
  const { refreshBalance, smartWalletBalance, injectedWalletBalance } =
    useBalance();

  const {
    rate,
    formValues,
    institutions: supportedInstitutions,
    orderId,
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
  const [isGatewayApproved, setIsGatewayApproved] = useState<boolean>(false);
  const [isOrderCreated, setIsOrderCreated] = useState<boolean>(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

  const searchParams = useSearchParams();

  const { mutate: sendTransaction } = useSendTransaction();

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

  const smartWallet = isInjectedWallet ? null : { address: account?.address };

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
      if (!account?.address) {
        throw new Error("No wallet connected");
      }

      const params = await prepareCreateOrderParams();
      setCreatedAt(new Date().toISOString());

      // Get token contract
      const tokenContract = getContract({
        client: THIRDWEB_CLIENT,
        chain: selectedNetwork.chain as unknown as Chain,
        address: tokenAddress,
        abi: erc20Abi,
      });

      // Get gateway contract
      const gatewayContract = getContract({
        client: THIRDWEB_CLIENT,
        chain: selectedNetwork.chain as unknown as Chain,
        address: getGatewayContractAddress(
          selectedNetwork.chain.name,
        ) as `0x${string}`,
        abi: gatewayAbi,
      });

      // Prepare approval transaction
      const approvalTx = prepareContractCall({
        contract: tokenContract,
        method: "approve",
        params: [
          getGatewayContractAddress(
            selectedNetwork.chain.name,
          ) as `0x${string}`,
          parseUnits(amountSent.toString(), tokenDecimals ?? 18),
        ],
      }) as PreparedTransaction<[], AbiFunction, PrepareTransactionOptions>;

      // Send approval transaction
      await sendTransaction(approvalTx);
      toast.success("Token spending approved");
      setIsGatewayApproved(true);

      // Prepare create order transaction
      const createOrderTx = prepareContractCall({
        contract: gatewayContract,
        method: "createOrder",
        params: [
          params.token,
          params.amount,
          params.rate,
          params.senderFeeRecipient,
          params.senderFee,
          params.refundAddress,
          params.messageHash,
        ],
      }) as PreparedTransaction<[], AbiFunction, PrepareTransactionOptions>;

      // Send create order transaction
      await sendTransaction(createOrderTx);
      toast.success("Order created successfully");
      setIsOrderCreated(true);

      trackEvent("Swap started", {
        token,
        amount: amountSent,
        currency,
        fiatAmount: amountReceived,
        network: selectedNetwork.chain.name,
        walletType: isInjectedWallet ? "injected" : "smart",
      });

      // Get order ID from logs
      await getOrderId();
    } catch (error) {
      console.error("Error creating order:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create order",
      );
      setErrorCount((prev) => prev + 1);
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

  // const saveTransactionData = async ({
  //   orderId,
  //   txHash,
  // }: {
  //   orderId: string;
  //   txHash: `0x${string}`;
  // }) => {
  //   if (!activeWallet?.address || isSavingTransaction) return;
  //   setIsSavingTransaction(true);

  //   try {
  //   TODO: figure out how to get access token on thirdweb
  //     const accessToken = await getAccessToken();
  //     if (!accessToken) {
  //       throw new Error("No access token available");
  //     }

  //     const transaction: TransactionCreateInput = {
  //       walletAddress: activeWallet.address,
  //       transactionType: "transfer",
  //       fromCurrency: token,
  //       toCurrency: currency,
  //       amountSent: Number(amountSent),
  //       amountReceived: Number(amountReceived),
  //       fee: Number(rate),
  //       recipient: {
  //         account_name: recipientName,
  //         institution: getInstitutionNameByCode(
  //           institution,
  //           supportedInstitutions,
  //         ) as string,
  //         account_identifier: accountIdentifier,
  //         ...(memo && { memo }),
  //       },
  //       status: "pending",
  //       orderId: orderId,
  //       txHash: txHash,
  //     };

  //     const response = await saveTransaction(transaction, accessToken);
  //     if (!response.success) {
  //       throw new Error("Failed to save transaction");
  //     }

  //     // Store the transaction ID in localStorage
  //     localStorage.setItem("currentTransactionId", response.data.id);
  //   } catch (error) {
  //     console.error("Error saving transaction:", error);
  //     // Don't show error toast as this is a background operation
  //   } finally {
  //     setIsSavingTransaction(false);
  //   }
  // };

  const getOrderId = async () => {
    let intervalId: NodeJS.Timeout;

    const getOrderCreatedLogs = async () => {
      const publicClient = createPublicClient({
        chain: selectedNetwork.chain,
        transport: http(getRpcUrl(selectedNetwork.chain.name ?? "")),
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

          // await saveTransactionData({
          //   orderId: decodedLog.args.orderId,
          //   txHash: logs[0].transactionHash,
          // });

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
                  src={`/logos/${String(token)?.toLowerCase()}-logo.svg`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}

              {key === "network" && (
                <Image
                  src={getNetworkImageUrl(selectedNetwork, isDark)}
                  alt={selectedNetwork.chain.name ?? "Network"}
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

      {/* Transaction Steps Indicator - Only show for injected wallet */}
      {isInjectedWallet && (
        <>
          <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />

          <p className="text-gray-500 dark:text-white/50">
            To confirm order, you&apos;ll be required to approve these two
            permissions from your wallet
          </p>

          <div className="flex items-center justify-between pb-2 text-gray-500 dark:text-white/50">
            <p>
              <span>{isGatewayApproved ? 2 : 1}</span> of 2
            </p>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
                {isGatewayApproved ? (
                  <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
                ) : (
                  <TbCircleDashed
                    className={classNames(
                      isConfirming ? "animate-spin" : "",
                      "text-lg",
                    )}
                  />
                )}
                <p className="pr-1">Approve Gateway</p>
              </div>

              <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
                {isOrderCreated ? (
                  <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
                ) : (
                  <TbCircleDashed
                    className={`text-lg ${
                      isGatewayApproved ? "animate-spin" : ""
                    }`}
                  />
                )}
                <p className="pr-1">Create Order</p>
              </div>
            </div>
          </div>
        </>
      )}

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
              <ImSpinner className="animate-spin text-lg" />
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
