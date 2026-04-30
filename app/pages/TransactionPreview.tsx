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
  getCurrencySymbol,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  getNetworkImageUrl,
  getRpcUrl,
  normalizeNetworkName,
  publicKeyEncrypt,
  shortenAddress,
} from "../utils";
import { useNetwork, useTokens } from "../context";
import config, {
  getDelegationContractAddress,
  localTransferFeePercent,
  STARKNET_READY_ACCOUNT_CLASSHASH,
} from "../lib/config";
import { mapReportAndAct } from "../lib/toastMappedError";
import type {
  Token,
  TransactionPreviewProps,
  TransactionCreateInput,
  RefundAccountDetails,
  V2FiatProviderAccountDTO,
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
import {
  useBalance,
  useInjectedWallet,
  useStep,
  useTransactions,
} from "../context";
import { useStarknet } from "../context/StarknetContext";
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

import {
  fetchAggregatorPublicKey,
  fetchTokens,
  saveTransaction,
  createV2SenderPaymentOrder,
  fetchRefundAccount,
  saveRefundAccount,
} from "../api/aggregator";
import { trackEvent } from "../hooks/analytics/client";
import { ImSpinner } from "react-icons/im";
import { BiEdit } from "react-icons/bi";
import { IoAdd } from "react-icons/io5";
import { InformationSquareIcon } from "hugeicons-react";
import { AddRefundAccountModal } from "../components/AddRefundAccountModal";
import { RefundAccountSuccessModal } from "../components/RefundAccountSuccessModal";
import { PiCheckCircleFill } from "react-icons/pi";
import { TbCircleDashed } from "react-icons/tb";
import { useActualTheme } from "../hooks/useActualTheme";
import axios from "axios";

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

  const { walletId, address: starknetAddress, publicKey } = useStarknet();

  const { selectedNetwork } = useNetwork();
  const { allTokens } = useTokens();
  const { currentStep, setCurrentStep } = useStep();
  const { fetchTransactions } = useTransactions();
  const {
    refreshBalance,
    smartWalletBalance,
    externalWalletBalance,
    injectedWalletBalance,
    allBalances,
  } = useBalance();

  const {
    rate,
    formValues,
    institutions: supportedInstitutions,
    isFetchingInstitutions,
    orderId,
    setOrderId,
    setCreatedAt,
    setTransactionStatus,
    onrampPaymentAccount,
    setOnrampPaymentAccount,
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
    walletAddress,
  } = formValues;

  const isOnramp = !!walletAddress;
  const isCNGNOnramp = isOnramp && token?.toUpperCase() === "CNGN";
  const currencySymbol = currency ? getCurrencySymbol(currency) : "";

  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0); // Used to trigger toast
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isPollingOrderId, setIsPollingOrderId] = useState<boolean>(false);
  const [isOrderCreatedLogsFetched, setIsOrderCreatedLogsFetched] =
    useState<boolean>(false);
  const [isGatewayApproved, setIsGatewayApproved] = useState<boolean>(false);
  const [isOrderCreated, setIsOrderCreated] = useState<boolean>(false);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [refundAccountModalOpen, setRefundAccountModalOpen] = useState(false);
  const [refundAccountSuccessOpen, setRefundAccountSuccessOpen] =
    useState(false);
  const [refundAccountWasEdited, setRefundAccountWasEdited] = useState(false);
  const [refundAccount, setRefundAccount] = useState<RefundAccountDetails | null>(
    null,
  );
  const orderSubmissionBlock = useRef<bigint | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isOnramp) return;
    // Reset on every currency change so a cached NGN account isn't submitted for KES/TZS/UGX orders.
    setRefundAccount(null);
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        const saved = await fetchRefundAccount(token);
        if (!cancelled && saved) {
          setRefundAccount(saved);
        }
      } catch {
        // No saved row or fetch failed — user can add in modal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnramp, currency, getAccessToken]);

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

  const activeWallet =
    injectedWallet ||
    (selectedNetwork.chain.name === "Starknet"
      ? starknetAddress
        ? { address: starknetAddress, type: "starknet" as const }
        : undefined
      : shouldUseEOA
        ? embeddedWallet
          ? { address: embeddedWallet.address, type: "eoa" as const }
          : undefined
        : smartWallet);

  /**
   * Same identity as middleware `x-wallet-address`: Privy embedded EVM wallet only.
   * Never use `activeWallet` (Starknet / SCW / injected) here — POST /api/v1/transactions
   * compares body.walletAddress to that JWT-derived value.
   */
  const walletAddressForTransactionApi =
    typeof embeddedWallet?.address === "string" &&
    embeddedWallet.address.trim() !== ""
      ? embeddedWallet.address.trim()
      : undefined;

  const activeBalance = injectedWallet
    ? injectedWalletBalance
    : selectedNetwork.chain.name === "Starknet"
      ? allBalances.starknetWallet
      : !isMigrationLoading && shouldUseEOA
        ? externalWalletBalance
        : smartWalletBalance;

  const balance =
    token === "CNGN" || token === "cNGN"
      ? (activeBalance?.rawBalances?.[token] ??
          activeBalance?.balances[token] ??
          0)
      : (activeBalance?.balances[token] ?? 0);

  // Calculate sender fee for display and balance check
  const {
    feeAmount: senderFeeAmount,
    feeAmountInBaseUnits: senderFeeInTokenUnits,
    feeRecipient: senderFeeRecipientAddress,
  } = calculateSenderFee(amountSent, rate, tokenDecimals ?? 18);

  // Rendered tsx info
  const renderedInfo = isOnramp
    ? {
      amount: `${currencySymbol}${formatNumberWithCommas(amountSent ?? 0)}`,
      totalValue: `${formatNumberWithCommas(amountReceived ?? 0)} ${token}`,
      rate: `${currencySymbol}${formatNumberWithCommas(rate)} ~ 1 ${token}`,
      ...(isCNGNOnramp && localTransferFeePercent > 0
        ? {
          fee: `${localTransferFeePercent}%`,
        }
        : {}),
      recipient: walletAddress ? shortenAddress(walletAddress) : "",
      network: selectedNetwork.chain.name,
    }
    : {
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
    const senderApiKeyId = config.aggregatorSenderApiKey?.trim();
    if (!senderApiKeyId) {
      throw new Error(
        "Sender API key is not configured (set NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID)",
      );
    }
    const metadata = { apiKey: senderApiKeyId };

    const providerId =
      searchParams.get("provider") || searchParams.get("PROVIDER");

    // Prepare recipient data (metadata.apiKey matches aggregator OrderEVM.CreateOrder + indexer)
    const recipient = isOnramp
      ? {
        accountIdentifier: walletAddress || "",
        accountName: recipientName || walletAddress || "",
        institution: "Wallet",
        ...(providerId && { providerId }),
        nonce: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        metadata,
      }
      : {
        accountIdentifier: formValues.accountIdentifier,
        accountName: recipientName,
        institution: formValues.institution,
        memo: formValues.memo,
        ...(providerId && { providerId }),
        nonce: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        metadata,
      };

    // Fetch aggregator public key
    const publicKey = await fetchAggregatorPublicKey();
    const encryptedRecipient = publicKeyEncrypt(recipient, publicKey.data);

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

  const createOrder = async () => {
    try {
      // Check if on Starknet and not using injected wallet
      if (selectedNetwork.chain.name === "Starknet" && !isInjectedWallet) {
        if (!walletId || !publicKey || !starknetAddress) {
          toast.error(
            "Starknet wallet not found. Please create a wallet first.",
          );
          return;
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        const classHash = STARKNET_READY_ACCOUNT_CLASSHASH;

        const token = await getAccessToken();
        if (!token) {
          throw new Error("Failed to get access token");
        }

        toast.loading("Creating order...");

        // Execute the transaction using Starknet paymaster via API
        const response = await fetch("/api/starknet/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            walletId,
            publicKey,
            classHash,
            userId: user?.id,
            origin: window.location.origin,
            tokenAddress: tokenAddress,
            gatewayAddress: getGatewayContractAddress(
              selectedNetwork.chain.name,
            ) as string,
            amount: params.amount.toString(),
            rate: params.rate.toString(),
            senderFeeRecipient: params.senderFeeRecipient as string,
            senderFee: params.senderFee.toString(),
            refundAddress: params.refundAddress ?? "",
            messageHash: params.messageHash,
            address: starknetAddress,
          }),
        });

        toast.dismiss();

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create order");
        }

        const result = await response.json();
        const orderId = result.orderId;

        setOrderId(orderId);

        await saveTransactionData({
          orderId: orderId,
          txHash: result.transactionHash,
        });

        setCreatedAt(new Date().toISOString());
        setTransactionStatus("pending");
        setCurrentStep("status");

        toast.success("Order created successfully");

        refreshBalance();
        setIsOrderCreated(true);

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": "Starknet embedded wallet",
          "Transaction hash": result.transactionHash,
        });
        return;
      }

      if (isInjectedWallet && injectedProvider) {
        // Injected wallet
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
      } else if (shouldUseEOA && embeddedWallet) {
        // EIP-7702 + bundler (execute-sponsored): check delegationContractAddress, attach delegation with signature if needed
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

        await embeddedWallet.switchChain(chainId);
        const provider = await embeddedWallet.getEthereumProvider();

        const rpcUrl = getRpcUrl(selectedNetwork.chain.name);
        if (!rpcUrl) {
          throw new Error(`RPC URL not configured for network: ${selectedNetwork.chain.name}`);
        }

        const accountAddress = embeddedWallet.address as `0x${string}`;
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
          authorization = await signDelegationAuthorization(chainId);
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
          "Wallet type": "EIP-7702 (bundler)",
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

    if (isOnramp) {
      if (!refundAccount) {
        toast.error("Add a refund account to continue");
        return;
      }
      if (!walletAddress) {
        toast.error("Recipient wallet is required");
        return;
      }
      try {
        setIsConfirming(true);
        const accessToken = await getAccessToken();
        if (!accessToken) {
          toast.error("Please sign in to continue");
          return;
        }

        const apiTokens = await fetchTokens();
        const networkLabel = selectedNetwork.chain.name;
        const match = apiTokens.find(
          (t) =>
            t.symbol.toUpperCase() === token.toUpperCase() &&
            normalizeNetworkName(t.network) === networkLabel,
        );
        if (!match?.network) {
          throw new Error(
            "This token is not supported on the selected network for onramp.",
          );
        }
        const aggregatorNetwork = match.network;
        const providerId =
          searchParams.get("provider") || searchParams.get("PROVIDER") || undefined;

        const payload = {
          amount: String(amountSent),
          amountIn: "fiat" as const,
          ...(isCNGNOnramp && localTransferFeePercent > 0
            ? { senderFeePercent: String(localTransferFeePercent) }
            : {}),
          source: {
            type: "fiat" as const,
            currency,
            refundAccount: {
              institution: refundAccount.institutionCode,
              accountIdentifier: refundAccount.accountNumber,
              accountName: refundAccount.accountName,
            },
          },
          destination: {
            type: "crypto" as const,
            currency: token,
            network: aggregatorNetwork,
            ...(providerId ? { providerId } : {}),
            recipient: {
              address: walletAddress,
              network: aggregatorNetwork,
            },
          },
        };


        const res = await createV2SenderPaymentOrder(payload, accessToken);
        if (res.status !== "success" || !res.data) {
          const msg =
            typeof res.message === "string"
              ? res.message
              : "Failed to create payment order";
          throw new Error(msg);
        }

        const created = res.data;
        const orderIdStr =
          typeof created.id === "string" ? created.id : String(created.id);
        setOrderId(orderIdStr);
        setOnrampPaymentAccount(created.providerAccount);
        setCreatedAt(new Date().toISOString());
        setTransactionStatus("pending");

        await saveTransactionData({
          orderId: orderIdStr,
          txHash: undefined,
          providerAccount: created.providerAccount,
        });

        const refreshTok = await getAccessToken();
        if (refreshTok && walletAddressForTransactionApi) {
          void fetchTransactions(
            walletAddressForTransactionApi,
            refreshTok,
            1,
            30,
            true,
          );
        }

        toast.success("Payment instructions ready");
        setCurrentStep("make_payment");
      } catch (e) {
        let msg: string;
        if (axios.isAxiosError(e)) {
          const data = e.response?.data as { message?: string } | undefined;
          msg = data?.message || e.message;
        } else {
          const error = e as BaseError;
          msg = error.shortMessage || error.message;
        }
        setErrorMessage(msg);
        setErrorCount((prevCount: number) => prevCount + 1);
      } finally {
        setIsConfirming(false);
      }
      return;
    }

    // Offramp: require token balance for amount + sender fee
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
    providerAccount,
  }: {
    orderId: string;
    txHash?: `0x${string}`;
    /** Pass from create-order response so bank name is saved before React state updates. */
    providerAccount?: V2FiatProviderAccountDTO | null;
  }) => {
    if (isSavingTransaction) return;
    if (!walletAddressForTransactionApi) {
      const err = new Error(
        "Embedded Privy wallet address is required to persist transactions (must match API auth).",
      );
      console.error("[TransactionPreview]", err.message);
      throw err;
    }

    setIsSavingTransaction(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const transaction: TransactionCreateInput = {
        walletAddress: walletAddressForTransactionApi,
        transactionType: isOnramp ? "onramp" : "swap",
        fromCurrency: isOnramp ? currency : token,
        toCurrency: isOnramp ? token : currency,
        amountSent: Number(amountSent),
        amountReceived: Number(amountReceived),
        fee: Number(rate),
        recipient: isOnramp
          ? {
            account_name: recipientName || walletAddress || "",
            institution:
              providerAccount?.institution?.trim() ||
              onrampPaymentAccount?.institution?.trim() ||
              "Wallet",
            account_identifier: walletAddress || "",
          }
          : {
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
        ...(txHash ? { txHash } : {}),
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
        {Object.entries(renderedInfo).map(([key, value]) => {
          const showTokenLogo =
            (isOnramp && key === "totalValue") ||
            (!isOnramp && (key === "amount" || key === "fee"));

          return (
            <div key={key} className="flex items-start justify-between gap-2">
              <h3 className="w-full max-w-28 text-text-secondary dark:text-white/50 sm:max-w-40">
                {key === "totalValue"
                  ? isOnramp
                    ? "Receive amount"
                    : "Total value"
                  : key === "amount"
                    ? isOnramp
                      ? "You send"
                      : "Amount"
                    : key.charAt(0).toUpperCase() + key.slice(1)}
              </h3>

              <p className="flex flex-grow items-center gap-1 font-medium text-text-body dark:text-white/80">
                {showTokenLogo && (
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
          );
        })}
      </div>

      {/* Transaction detail disclaimer */}
      <div className="flex gap-2.5 rounded-xl border border-border-light bg-background-neutral p-3 text-text-secondary dark:border-white/5 dark:bg-white/5 dark:text-white/50">
        <InformationSquareIcon className="mt-1 size-4 flex-shrink-0" />
        <p>
          Ensure the details above are correct. Failed transaction due to wrong
          details may attract a refund fee
        </p>
      </div>

      {isOnramp && (
        <>
          <div className="space-y-2">
            <p className="text-sm text-neutral-500 dark:text-white/50">
              Refund account
            </p>
            <button
              type="button"
              onClick={() => setRefundAccountModalOpen(true)}
              aria-label={refundAccount ? "Edit refund account" : "Add refund account"}
              className="flex w-full items-center justify-between gap-3 rounded-xl border-[3.3px] border-lavender-500 bg-transparent px-3 py-3 text-left transition-colors hover:border-lavender-400 hover:bg-lavender-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500/35 dark:hover:border-lavender-400 dark:hover:bg-lavender-400/10 dark:focus-visible:ring-lavender-400/30"
            >
              <span className="text-sm text-text-body dark:text-white">
                {refundAccount ? (
                  <>
                    <span>{refundAccount.accountName} </span>
                    <span className="font-semibold">{refundAccount.accountNumber} | {refundAccount.institutionName}</span>
                  </>
                ) : (
                  "Add Refund Account"
                )}
              </span>
              <span
                className="shrink-0 text-text-body dark:text-white/90"
                aria-hidden
              >
                {refundAccount ? (
                  <BiEdit className="size-5" />
                ) : (
                  <IoAdd className="size-5" />
                )}
              </span>
            </button>
          </div>
          <AddRefundAccountModal
            isOpen={refundAccountModalOpen}
            onClose={() => setRefundAccountModalOpen(false)}
            institutions={supportedInstitutions}
            isFetchingInstitutions={isFetchingInstitutions}
            currency={currency}
            initial={refundAccount}
            onSave={async (data: RefundAccountDetails) => {
              const token = await getAccessToken();
              if (!token) {
                throw new Error("Please sign in to save your refund account.");
              }
              const isEdit = refundAccount !== null;
              const saved = await saveRefundAccount(data, token);
              setRefundAccount(saved);
              setRefundAccountWasEdited(isEdit);
            }}
            onSaved={() => setRefundAccountSuccessOpen(true)}
          />
          <RefundAccountSuccessModal
            isOpen={refundAccountSuccessOpen}
            onClose={() => setRefundAccountSuccessOpen(false)}
            isEditing={refundAccountWasEdited}
          />
        </>
      )}

      {/* Transaction Steps Indicator - Only for offramp + injected wallet */}
      {isInjectedWallet && !isOnramp && (
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
          disabled={
            isConfirming ||
            isPollingOrderId ||
            (isOnramp && !refundAccount)
          }
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
