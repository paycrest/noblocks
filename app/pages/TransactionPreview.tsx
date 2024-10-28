"use client";
import Image from "next/image";
import { TbCircleDashed, TbInfoSquareRounded } from "react-icons/tb";

import { useWriteContract, useReadContract, usePublicClient } from "wagmi";
import { useSendSponsoredTransaction, useUserOpWait } from "@biconomy/use-aa";

import {
  formatCurrency,
  formatNumberWithCommas,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  publicKeyEncrypt,
} from "../utils";
import { useNetwork } from "../context/NetworksContext";
import type { TransactionPreviewProps } from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import { tokens } from "../mocks";
import { erc20Abi, gatewayAbi } from "../api/abi";
import { usePrivy } from "@privy-io/react-auth";
import {
  BaseError,
  decodeEventLog,
  formatUnits,
  getAddress,
  parseUnits,
} from "viem";
import { useEffect, useState } from "react";
import { fetchAggregatorPublicKey } from "../api/aggregator";
import { toast } from "sonner";

/**
 * Renders a preview of a transaction with the provided details.
 *
 * @param handleBackButtonClick - Function to handle the back button click event.
 * @param handlePaymentConfirmation - Function to handle the payment confirmation button click event.
 * @param stateProps - Object containing the form values, rate, institutions, and loading states.
 */
export const TransactionPreview = ({
  handleBackButtonClick,
  stateProps,
}: TransactionPreviewProps) => {
  const { user } = usePrivy();
  const client = usePublicClient();
  const { selectedNetwork } = useNetwork();

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
  const [gatewayAllowance, setGatewayAllowance] = useState<number>(0);
  const [smartGatewayAllowance, setSmartGatewayAllowance] = useState<number>(0);
  const [paymasterAllowance, setPaymasterAllowance] = useState<number>(0);

  const [isGatewayApproved, setIsGatewayApproved] = useState<boolean>(false);
  const [isOrderCreated, setIsOrderCreated] = useState<boolean>(false);
  const [isApprovalLogsFetched, setIsApprovalLogsFetched] =
    useState<boolean>(false);
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
    description: memo,
    network: selectedNetwork.name,
  };

  // User operation hooks
  const {
    mutate,
    data: userOpResponse,
    error: userOpError,
    isPending: useropIsPending,
  } = useSendSponsoredTransaction();

  const { isLoading: waitIsLoading, error: waitError } =
    useUserOpWait(userOpResponse);

  const tokenAddress = tokens.find((t) => t.name.toUpperCase() === token)
    ?.address as `0x${string}`;

  const tokenDecimals = tokens.find(
    (t) => t.name.toUpperCase() === token,
  )?.decimals;

  // Get allowance given to gateway contract
  const { data: gatewayAllowanceInWei } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "allowance",
    args: [
      user?.wallet?.address as `0x${string}`,
      getGatewayContractAddress(selectedNetwork.name) as `0x${string}`,
    ],
  });

  const { data: smartGatewayAllowanceInWei } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "allowance",
    args: [
      user?.wallet?.address as `0x${string}`,
      getGatewayContractAddress(selectedNetwork.name) as `0x${string}`,
    ],
  });

  // Get allowance given to paymaster contract
  const { data: paymasterAllowanceInWei } = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "allowance",
    args: [
      getAddress("0x00000f79b7faf42eebadba19acc07cd08af44789"),
      getGatewayContractAddress(selectedNetwork.name) as `0x${string}`,
    ],
  });

  const {
    data: hash,
    error,
    isPending,
    writeContractAsync,
  } = useWriteContract();

  // Update token balance when token balance is available
  useEffect(() => {
    if (gatewayAllowanceInWei && tokenDecimals) {
      setGatewayAllowance(
        Number(formatUnits(gatewayAllowanceInWei, tokenDecimals)),
      );
    }

    if (smartGatewayAllowanceInWei && tokenDecimals) {
      setSmartGatewayAllowance(
        Number(formatUnits(smartGatewayAllowanceInWei, tokenDecimals)),
      );
    }

    if (paymasterAllowanceInWei && tokenDecimals) {
      setPaymasterAllowance(
        Number(formatUnits(paymasterAllowanceInWei, tokenDecimals)),
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gatewayAllowanceInWei,
    smartGatewayAllowanceInWei,
    paymasterAllowanceInWei,
    tokenDecimals,
  ]);

  // Update confirmation state and hash based on transaction status
  useEffect(() => {
    if (isPending || useropIsPending || waitIsLoading) {
      setIsConfirming(true);
    }

    if (errorMessage || userOpError || waitError) {
      setIsConfirming(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isPending,
    errorMessage,
    useropIsPending,
    userOpError,
    waitIsLoading,
    waitError,
    hash,
  ]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (!client || isApprovalLogsFetched || !isConfirming) return;

    const getApprovalLogs = async () => {
      try {
        const toBlock = await client.getBlockNumber();
        const logs = await client.getContractEvents({
          address: tokenAddress,
          abi: erc20Abi,
          eventName: "Approval",
          args: {
            owner: user?.wallet?.address as `0x${string}`,
            spender: getGatewayContractAddress(
              selectedNetwork.name,
            ) as `0x${string}`,
          },
          fromBlock: toBlock - BigInt(10),
          toBlock: toBlock,
        });

        if (logs.length > 0) {
          const decodedLog = decodeEventLog({
            abi: erc20Abi,
            eventName: "Approval",
            data: logs[0].data,
            topics: logs[0].topics,
          });

          if (
            decodedLog.args.value ===
            parseUnits(amountSent.toString(), tokenDecimals!)
          ) {
            clearInterval(intervalId);
            setIsApprovalLogsFetched(true);
            await createOrder();
          }
        }
      } catch (error) {
        console.error("Error fetching Approval logs:", error);
      }
    };

    // Initial call
    getApprovalLogs();

    // Set up polling
    intervalId = setInterval(getApprovalLogs, 2000);

    // Cleanup function
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isApprovalLogsFetched, isConfirming]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (!client || isOrderCreatedLogsFetched || !isConfirming) return;

    const getOrderCreatedLogs = async () => {
      try {
        const toBlock = await client.getBlockNumber();
        const logs = await client.getContractEvents({
          address: getGatewayContractAddress(
            selectedNetwork.name,
          ) as `0x${string}`,
          abi: gatewayAbi,
          eventName: "OrderCreated",
          args: {
            sender: user?.wallet?.address as `0x${string}`,
            token: tokenAddress,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isOrderCreatedLogsFetched, isConfirming]);

  const prepareCreateOrderParams = async () => {
    // Prepare recipient data
    const recipient = {
      accountIdentifier: formValues.accountIdentifier,
      accountName: recipientName,
      institution: formValues.institution,
      // providerId: currency === "NGN" ? NGN_PROVIDER_ID : KES_PROVIDER_ID,
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
      refundAddress: user?.wallet?.address as `0x${string}`,
      messageHash: encryptedRecipient,
    };

    return params;
  };

  const createOrder = async () => {
    try {
      const params = await prepareCreateOrderParams();
      setCreatedAt(new Date().toISOString());
      // Create order
      await writeContractAsync({
        abi: gatewayAbi,
        address: getGatewayContractAddress(
          selectedNetwork.name,
        ) as `0x${string}`,
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
      });

      setIsOrderCreated(true);
    } catch (e: any) {
      if (error) {
        setErrorMessage((error as BaseError).shortMessage || error!.message);
      } else {
        setErrorMessage((e as BaseError).shortMessage);
      }
      setIsConfirming(false);
    }
  };

  const handlePaymentConfirmation = async () => {
    try {
      setIsConfirming(true);

      // Approve gateway contract to spend token
      if (gatewayAllowance < amountSent) {
        await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [
            getAddress(getGatewayContractAddress(selectedNetwork.name) || ""),
            parseUnits(amountSent.toString(), tokenDecimals!),
          ],
        });

        setIsGatewayApproved(true);
      } else {
        await createOrder();
      }
    } catch (e: any) {
      if (error) {
        setErrorMessage((error as BaseError).shortMessage || error!.message);
      } else {
        setErrorMessage((e as BaseError).shortMessage);
      }
      setErrorCount((prevCount) => prevCount + 1);
      setIsConfirming(false);
    }
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

      {/* Confirm and Approve */}

      <p className="text-gray-500 dark:text-white/50">
        To confirm order, you&apos;ll be required to approve these two
        permissions from your wallet
      </p>

      <div className="flex flex-wrap items-center justify-between gap-y-4 text-gray-500 dark:text-white/50">
        <p>
          {/* replace 1 with 2 when the approve state is set to complete */}
          <span>{/* {isGatewayApproved ? 2 : 1} */} 1</span> of 2
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
            {/* {isGatewayApproved ? (
                <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
              ) : ( */}
            <TbCircleDashed className="text-lg" />
            {/* )} */}
            <p className="pr-1">Approve Gateway</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
            {/* {isOrderCreated ? (
                <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
              ) : ( */}
            <TbCircleDashed
              className="text-lg"
              // className={`text-lg ${
              // isGatewayApproved ? "animate-spin" : ""
              // }`}
            />
            {/* )} */}
            <p className="pr-1">Create Order</p>
          </div>
        </div>
      </div>

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
          // disabled={isConfirming}
        >
          {/* {isConfirming ? "Confirming..." : "Confirm payment"} */}
          Confirm payment
        </button>
      </div>
    </div>
  );
};
