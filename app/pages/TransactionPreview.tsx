"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import {
  calculateDuration,
  calculateSenderFee,
  classNames,
  formatCurrency,
  formatNumberWithCommas,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  getNetworkImageUrl,
  getRpcUrl,
  publicKeyEncrypt,
} from "../utils";
import { useNetwork, useTokens } from "../context";
import { getDelegationContractAddress } from "../lib/config";
import { mapReportAndAct } from "../lib/toastMappedError";
import type {
  Token,
  TransactionPreviewProps,
  TransactionCreateInput,
} from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components/Styles";
import { gatewayAbi } from "../api/abi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
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
import {
  useShouldUseEOA,
  useDelegationContractAuth,
  useMigrationStatus,
  get7702AuthorizedImplementationForAddress,
} from "../hooks/useEIP7702Account";
import {
  buildBatchDigest,
  encodeExecuteBatch,
  readBatchNonce,
  type BatchCall,
} from "../lib/providerBatch";

import { fetchAggregatorPublicKey, saveTransaction } from "../api/aggregator";
import { trackEvent } from "../hooks/analytics/client";
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
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const { isInjectedWallet, injectedAddress, injectedProvider, injectedReady } =
    useInjectedWallet();
  const shouldUseEOA = useShouldUseEOA();
  const { isLoading: isMigrationLoading } = useMigrationStatus();
  const { signDelegationAuthorization } = useDelegationContractAuth();


  const { selectedNetwork } = useNetwork();
  const { allTokens } = useTokens();
  const { currentStep, setCurrentStep } = useStep();
  const { refreshBalance, smartWalletBalance, externalWalletBalance, injectedWalletBalance } =
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
  const [isPollingOrderId, setIsPollingOrderId] = useState<boolean>(false);
  const [isOrderCreatedLogsFetched, setIsOrderCreatedLogsFetched] =
    useState<boolean>(false);
  const [isGatewayApproved, setIsGatewayApproved] = useState<boolean>(false);
  const [isOrderCreated, setIsOrderCreated] = useState<boolean>(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const orderSubmissionBlock = useRef<bigint | null>(null);

  const searchParams = useSearchParams();

  const fetchedTokens: Token[] = allTokens[selectedNetwork.chain.name] || [];

  const tokenAddress = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.address as `0x${string}`;

  const tokenDecimals = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.decimals;

  const injectedWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" }
    : null;

  // Determine active wallet based on migration status
  // After migration: use EOA (new wallet with funds)
  // Before migration: use SCW (old wallet)
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy"
  );
  const smartWallet = isInjectedWallet
    ? null
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const activeWallet = injectedWallet ||
    (shouldUseEOA
      ? (embeddedWallet ? { address: embeddedWallet.address, type: "eoa" } : undefined)
      : smartWallet);

  // Get appropriate balance based on migration status
  // After migration: use externalWalletBalance (EOA balance)
  // Before migration: use smartWalletBalance (SCW balance)
  // Wait for migration status to load before making decision
  const activeBalance = injectedWallet
    ? injectedWalletBalance
    : !isMigrationLoading && shouldUseEOA
      ? externalWalletBalance
      : smartWalletBalance;

  // For CNGN, use raw balance (token units) instead of USD equivalent
  const balance =
    token === "CNGN" || token === "cNGN"
      ? (activeBalance?.rawBalances?.[token] ?? activeBalance?.balances[token] ?? 0)
      : (activeBalance?.balances[token] ?? 0);

  // Calculate sender fee for display and balance check
  const {
    feeAmount: senderFeeAmount,
    feeAmountInBaseUnits: senderFeeInTokenUnits,
    feeRecipient: senderFeeRecipientAddress,
  } = calculateSenderFee(amountSent, rate, tokenDecimals ?? 18);

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
    ...(senderFeeAmount > 0 && {
      fee: `${formatNumberWithCommas(senderFeeAmount)} ${token}`,
    }),
    network: selectedNetwork.chain.name,
  };

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

    // Use the fee values calculated earlier (already in base units and capped)

    // Prepare transaction parameters
    const params = {
      token: tokenAddress,
      amount: parseUnits(amountSent.toString(), tokenDecimals ?? 18),
      rate: BigInt(Math.round(rate * 100)),
      senderFeeRecipient: getAddress(senderFeeRecipientAddress),
      senderFee: senderFeeInTokenUnits,
      refundAddress: activeWallet?.address as `0x${string}`,
      messageHash: encryptedRecipient,
    };

    return params;
  };

  const captureSubmissionBlock = async () => {
    try {
      const publicClient = createPublicClient({
        chain: selectedNetwork.chain,
        transport: http(getRpcUrl(selectedNetwork.chain.name)),
      });
      orderSubmissionBlock.current = await publicClient.getBlockNumber();
    } catch {
      orderSubmissionBlock.current = null;
    }
  };

  // Privy external wallet (Flow 2 in InjectedWalletContext) vs raw ?injected=true URL param.
  // External Privy wallets are authenticated and can use the EIP-7702 bundler flow.
  // URL param injected wallets use raw eth_sendTransaction (unauthenticated / no bundler).
  const isUrlParamInjected = searchParams.get("injected") === "true";
  const isPrivyExternalWallet =
    isInjectedWallet && !isUrlParamInjected && !!injectedProvider && !!injectedAddress;

  const createOrder = async () => {
    try {
      if (isInjectedWallet && isUrlParamInjected && injectedProvider) {
        // URL param ?injected=true — raw eth_sendTransaction (user pays gas)
        if (!injectedReady) {
          throw new Error("Injected wallet not ready");
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        // Calculate total amount to approve (amount + senderFee)
        // The contract transfers amount + senderFee from the user
        const totalAmountToApprove = params.amount + params.senderFee;

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
                  totalAmountToApprove,
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
          setIsGatewayApproved(true);
        } catch (error) {
          toast.error("Approval failed");
          throw new Error("Approval transaction failed");
        }

        // Create order transaction
        await captureSubmissionBlock();
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
        toast.success("Order created successfully");
        setIsOrderCreated(true);

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": "Injected wallet",
        });
      } else if (shouldUseEOA && (embeddedWallet || isPrivyExternalWallet)) {
        // EIP-7702 + bundler (execute-sponsored).
        // Works for both embedded wallets (Privy manages key) and Privy external wallets
        // (MetaMask etc.) — the only difference is how we get the provider and address.
        const chain = selectedNetwork?.chain;
        if (!chain) throw new Error("Network not ready");
        const chainId = chain.id;
        const gatewayAddress = getGatewayContractAddress(
          selectedNetwork.chain.name,
        ) as `0x${string}`;

        const delegationContractAddress = getDelegationContractAddress(chainId);
        if (!delegationContractAddress || delegationContractAddress === "") {
          throw new Error(
            `Delegation contract not configured for ${selectedNetwork.chain.name}. Set the contract for chain ${chainId}.`
          );
        }

        const bundlerUrl = "/api/bundler";

        // Normalize provider and address across embedded vs external wallet
        let provider: any;
        let accountAddress: `0x${string}`;
        if (embeddedWallet) {
          await embeddedWallet.switchChain(chainId);
          provider = await embeddedWallet.getEthereumProvider();
          accountAddress = embeddedWallet.address as `0x${string}`;
        } else {
          // Privy external wallet — injectedProvider is already the wallet's provider
          await (injectedProvider as any).request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
          provider = injectedProvider;
          accountAddress = injectedAddress as `0x${string}`;
        }

        const rpcUrl = getRpcUrl(selectedNetwork.chain.name);
        if (!rpcUrl) {
          throw new Error(`RPC URL not configured for network: ${selectedNetwork.chain.name}`);
        }

        const publicClient = createPublicClient({
          chain,
          transport: http(rpcUrl),
        });

        const expectedDelegation = delegationContractAddress.toLowerCase();
        const currentImplementation = await get7702AuthorizedImplementationForAddress(
          chain,
          rpcUrl,
          accountAddress,
        );
        // Only send authorization when EOA is not delegated, or delegated to a different contract.
        const needsDelegation =
          !currentImplementation ||
          currentImplementation.toLowerCase() !== expectedDelegation;

        let authorization: Awaited<ReturnType<typeof signDelegationAuthorization>> | undefined;
        if (needsDelegation) {
          authorization = await signDelegationAuthorization(chainId, chain);
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());
        const totalAmountToApprove = params.amount + params.senderFee;

        const approveCall: BatchCall = {
          to: tokenAddress as `0x${string}`,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [gatewayAddress, totalAmountToApprove],
          }),
        };
        const createOrderCall: BatchCall = {
          to: gatewayAddress,
          value: BigInt(0),
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
        };

        const nonce = await readBatchNonce(publicClient, accountAddress).catch(() => BigInt(0));
        const digest = buildBatchDigest(nonce, [approveCall, createOrderCall]);
        const rawSignature = (await provider.request({
          method: "personal_sign",
          params: [digest, accountAddress],
        })) as string;
        const signature = (rawSignature.startsWith("0x") ? rawSignature : `0x${rawSignature}`) as `0x${string}`;

        const callData = encodeExecuteBatch([approveCall, createOrderCall], signature);
        const payload = {
          chainId,
          rpcUrl,
          accountAddress,
          callData,
          delegationContractAddress,
          ...(authorization != null && { eip7702Authorization: authorization }),
        };

        await captureSubmissionBlock();

        const accessToken = await getAccessToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

        const res = await fetch(`${bundlerUrl}/execute-sponsored`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        });
        if (!res.ok) {
          const errBody = await res.text();
          let errMsg: string;
          try {
            const j = JSON.parse(errBody) as { error?: string };
            errMsg = (j?.error ?? errBody) || res.statusText;
          } catch {
            errMsg = errBody || res.statusText;
          }
          throw new Error(errMsg);
        }
        const data = (await res.json()) as { transactionHash?: string };
        const hash = data.transactionHash;
        if (!hash) throw new Error("No transaction hash returned");

        setIsGatewayApproved(true);
        setIsOrderCreated(true);

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": embeddedWallet ? "EIP-7702 (bundler)" : "EIP-7702 (external wallet)",
        });

        toast.success("Order created successfully");
        refreshBalance();
        setIsPollingOrderId(true);
        void getOrderId().finally(() => setIsPollingOrderId(false));
        return;
      } else {
        // Smart wallet (pre-migration)
        if (!client) {
          throw new Error("Smart wallet not found");
        }

        await client.switchChain({
          id: selectedNetwork.chain.id,
        });

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        // Calculate total amount to approve (amount + senderFee)
        const totalAmountToApprove = params.amount + params.senderFee;

        await captureSubmissionBlock();
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
                  totalAmountToApprove,
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

      toast.success("Order created successfully");

      refreshBalance();

      trackEvent("Swap started", {
        "Entry point": "Transaction preview",
        "Wallet type": "Smart wallet",
      });
    } catch (e) {
      const error = e as BaseError;
      const rawReason = error.shortMessage || error.message || "Unknown error";
      mapReportAndAct(e, {
        feature: "transaction-preview",
        onUserMessage: (userMsg) => {
          setErrorMessage(userMsg);
          setErrorCount((prevCount: number) => prevCount + 1);
        },
      });
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
        "Reason for failure": rawReason,
        "Transaction duration": calculateDuration(
          createdAt,
          new Date().toISOString(),
        ),
      });
    }
  };

  const handlePaymentConfirmation = async () => {
    if (!activeWallet?.address) {
      toast.error("Wallet not ready", {
        description: "Please wait for your wallet to load before confirming.",
      });
      return;
    }

    // Check balance including sender fee
    const totalRequired = amountSent + senderFeeAmount;

    if (totalRequired > balance) {
      toast.warning("Low balance. Fund your wallet.", {
        description: `Insufficient funds. You need ${formatNumberWithCommas(totalRequired)} ${token} (${formatNumberWithCommas(amountSent)} ${token} + ${formatNumberWithCommas(senderFeeAmount)} ${token} fee).`,
      });
      return;
    }

    try {
      setIsConfirming(true);
      await createOrder();
    } finally {
      setIsConfirming(false);
    }
  };

  const saveTransactionData = async ({
    orderId,
    txHash,
  }: {
    orderId: string;
    txHash: `0x${string}`;
  }) => {
    if (!activeWallet?.address || isSavingTransaction) return;
    setIsSavingTransaction(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const transaction: TransactionCreateInput = {
        walletAddress: activeWallet.address,
        transactionType: "swap",
        fromCurrency: token,
        toCurrency: currency,
        amountSent: Number(amountSent),
        amountReceived: Number(amountReceived),
        fee: Number(rate),
        recipient: {
          account_name: recipientName,
          institution: getInstitutionNameByCode(
            institution,
            supportedInstitutions,
          ) as string,
          account_identifier: accountIdentifier,
          ...(memo && { memo }),
        },
        status: "pending",
        network: selectedNetwork.chain.name,
        orderId: orderId,
        txHash: txHash,
        email: user?.email?.address ?? undefined,
      };

      const response = await saveTransaction(transaction, accessToken);
      if (!response.success) {
        throw new Error("Failed to save transaction");
      }

      // Store the transaction ID in localStorage
      localStorage.setItem("currentTransactionId", response.data.id);
    } catch (error) {
      console.error("Error saving transaction:", error);
      // Don't show error toast as this is a background operation
    } finally {
      setIsSavingTransaction(false);
    }
  };

  const getOrderId = () => {
    const MAX_POLL_DURATION_MS = 120_000;

    return new Promise<void>((resolve, reject) => {
      let intervalId: NodeJS.Timeout;
      let timeoutId: NodeJS.Timeout;
      let settled = false;

      const cleanup = () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      };

      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new Error(
            "Unable to confirm order onchain, but your transaction may still be processing. Please check your transaction history before retrying.",
          ),
        );
      }, MAX_POLL_DURATION_MS);

      const poll = async () => {
        if (settled || !activeWallet?.address) return;

        try {
          const publicClient = createPublicClient({
            chain: selectedNetwork.chain,
            transport: http(getRpcUrl(selectedNetwork.chain.name)),
          });

          const toBlock = await publicClient.getBlockNumber();
          const fromBlock =
            orderSubmissionBlock.current ?? toBlock - BigInt(10);

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
            fromBlock,
            toBlock,
          });

          if (logs.length > 0 && !settled) {
            settled = true;
            cleanup();

            try {
              const decodedLog = decodeEventLog({
                abi: gatewayAbi,
                eventName: "OrderCreated",
                data: logs[0].data,
                topics: logs[0].topics,
              });

              setIsOrderCreatedLogsFetched(true);
              setOrderId(decodedLog.args.orderId);

              await saveTransactionData({
                orderId: decodedLog.args.orderId,
                txHash: logs[0].transactionHash,
              });

              setCreatedAt(new Date().toISOString());
              setTransactionStatus("pending");
              setCurrentStep("status");
              resolve();
            } catch (err) {
              reject(err);
            }
          }
        } catch (error) {
          console.error("Error fetching OrderCreated logs:", error);
        }
      };

      poll();
      intervalId = setInterval(poll, 2_000);
    });
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
                  alt={selectedNetwork.chain.name}
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
                      isConfirming || isPollingOrderId ? "animate-spin" : "",
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
                    className={`text-lg ${isGatewayApproved ? "animate-spin" : ""
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
          disabled={isConfirming || isPollingOrderId}
        >
          Back
        </button>
        <button
          type="submit"
          className={classNames(primaryBtnClasses, "w-full")}
          onClick={handlePaymentConfirmation}
          disabled={isConfirming || isPollingOrderId}
        >
          {isConfirming || isPollingOrderId ? (
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
