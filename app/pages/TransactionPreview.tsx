"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import {
  calculateDuration,
  packRate,
  classNames,
  formatCurrency,
  formatNumberWithCommas,
  getCurrencySymbol,
  getGatewayContractAddress,
  getInstitutionNameByCode,
  getNetworkImageUrl,
  getRpcUrl,
  normalizeNetworkName,
  normalizeNetworkForRateFetch,
  publicKeyEncrypt,
  shortenAddress,
  isSolanaChain,
  isEvmChain,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from "../utils";
import { isValidSolanaAddress } from "../lib/validation";
import { tokensEqual, toAggregatorToken } from "../lib/token-symbol";
import { useNetwork, useTokens, useStarknet, useSolana } from "../context";
import config, { getDelegationContractAddress } from "../lib/config";
import { appendBaseBuilderCode } from "../lib/baseBuilderCode";
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
import {
  useSignTransaction as useSolanaSignTransaction,
  useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import {
  type BaseError,
  decodeEventLog,
  encodeFunctionData,
  zeroAddress,
  parseUnits,
  erc20Abi,
  createPublicClient,
  http,
} from "viem";
import { useBalance, useInjectedWallet, useStep, useTransactions } from "../context";
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
  gatewayApprovalAmount,
  needsGatewayApproval,
} from "../lib/erc20Allowance";
import { useApiAuth } from "../hooks/useApiAuth";

import {
  fetchAggregatorPublicKey,
  fetchTokens,
  saveTransaction,
  precheckSwapTransaction,
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
import { DEFAULT_SOLANA_USDC_MINT } from "../lib/solanaAta";
import axios from "axios";

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.trimStart().startsWith("<!")
        ? `Server returned HTML instead of JSON (HTTP ${response.status}). Restart the dev server after config changes.`
        : `Invalid server response (HTTP ${response.status})`,
    );
  }
}

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
  const {
    isInjectedWallet,
    injectedAddress,
    injectedProvider,
    injectedReady,
    getInjectedToken,
  } = useInjectedWallet();
  const { resolveAuth } = useApiAuth();
  const { walletId: starknetWalletId, address: starknetWalletAddress, publicKey: starknetPublicKey } = useStarknet();
  const { address: solanaWalletAddress } = useSolana();
  const { wallets: solanaWallets, ready: solanaWalletsReady } = useSolanaWallets();
  const { signTransaction: signSolanaTransaction } = useSolanaSignTransaction();
  const shouldUseEOA = useShouldUseEOA();
  const { isLoading: isMigrationLoading } = useMigrationStatus();
  const { signDelegationAuthorization } = useDelegationContractAuth();


  const { selectedNetwork } = useNetwork();
  const { allTokens } = useTokens();
  const { setCurrentStep } = useStep();
  const { fetchTransactions } = useTransactions();
  const { refreshBalance, smartWalletBalance, externalWalletBalance, injectedWalletBalance, starknetWalletBalance, tronWalletBalance, solanaWalletBalance } =
    useBalance();

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
    setActiveOrderIsOnramp,
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

  // Derive the flow from the form's own mode, never from `!!walletAddress` — a Buy that somehow
  // reaches the preview with an empty wallet address must still render (and order) as an onramp,
  // not silently fall into the offramp layout with blank recipient fields.
  const isOnramp =
    formValues.swapMode === "onramp" || formValues.isSwapped === true;
  const currencySymbol = currency ? getCurrencySymbol(currency) : "";

  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0); // Used to trigger toast
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isPollingOrderId, setIsPollingOrderId] = useState<boolean>(false);
  const [isOrderCreatedLogsFetched, setIsOrderCreatedLogsFetched] =
    useState<boolean>(false);
  const [isGatewayApproved, setIsGatewayApproved] = useState<boolean>(false);
  // Whether the injected flow will need a gateway approval prompt, read once on mount so the step
  // copy below promises the number of wallet prompts the user will actually see. Confirm time
  // re-reads authoritatively — this value never decides whether an approve is sent. Starts true so
  // we over-promise rather than under-promise while the read is in flight.
  const [willNeedApproval, setWillNeedApproval] = useState<boolean>(true);
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

  // Ref to prevent duplicate transaction saves
  const isSavingTransactionRef = useRef(false);

  const searchParams = useSearchParams();

  // Injected wallets authenticate API calls via a SIWE session (not Privy).
  // Establish it when the preview mounts so confirm/precheck/save don't fail
  // with "Please sign in" while the wallet pill already shows connected.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true });
    }
  }, [isInjectedWallet, injectedReady, getInjectedToken]);

  useEffect(() => {
    setRefundAccount(null);
    setRefundAccountModalOpen(false);
    if (!isOnramp || !currency?.trim()) return;
    const orderCurrency = currency.trim().toUpperCase();
    let cancelled = false;
    void (async () => {
      try {
        // Passive: SIWE is established by the mount effect; don't re-prompt here.
        const { accessToken, injectedToken } = await resolveAuth({
          interactive: false,
        });
        if ((!accessToken && !injectedToken) || cancelled) return;
        const saved = await fetchRefundAccount(
          orderCurrency,
          accessToken,
          injectedToken,
        );
        if (cancelled) return;
        if (saved) {
          setRefundAccount(saved);
        }
      } catch {
        // No saved row or fetch failed — user can add in modal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnramp, currency, resolveAuth]);

  const fetchedTokens: Token[] = allTokens[selectedNetwork.chain.name] || [];

  const tokenAddress = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.address as `0x${string}`;

  const tokenDecimals = fetchedTokens.find(
    (t) => t.symbol.toUpperCase() === token.toUpperCase(),
  )?.decimals;

  // What the gateway will actually pull (senderFee is 0 today, see prepareCreateOrderParams).
  // Lifted out of prepareCreateOrderParams so the allowance read can reuse it without that
  // function's network round-trip for the aggregator public key.
  const requiredSpendWei = parseUnits(
    (amountSent ?? 0).toString(),
    tokenDecimals ?? 18,
  );

  const gatewayAddress = getGatewayContractAddress(
    selectedNetwork.chain.name,
  ) as `0x${string}`;

  const injectedWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" }
    : null;

  // Determine active wallet based on migration status
  // After migration: use EOA (new wallet with funds)
  // Before migration: use SCW (old wallet)
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const smartWallet = isInjectedWallet
    ? null
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const isStarknetSelected = selectedNetwork.chain.name === "Starknet";
  const isTronSelected = selectedNetwork.chain.name === "Tron";
  const isSolanaSelected = isSolanaChain(selectedNetwork.chain);

  // Drives the approval-step copy for injected off-ramp only — that's the one flow that tells the
  // user up front how many wallet prompts to expect. Skipped for Starknet/Tron, whose chain objects
  // are not viem chains (see app/mocks.ts).
  useEffect(() => {
    if (
      !isInjectedWallet ||
      isOnramp ||
      isStarknetSelected ||
      isTronSelected ||
      isSolanaSelected ||
      !injectedReady
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const mustApprove = await needsGatewayApproval({
        chain: selectedNetwork.chain,
        rpcUrl: getRpcUrl(selectedNetwork.chain.name),
        token: tokenAddress,
        owner: injectedAddress ?? undefined,
        spender: gatewayAddress,
        required: requiredSpendWei,
      });
      if (!cancelled) setWillNeedApproval(mustApprove);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isInjectedWallet,
    isOnramp,
    isStarknetSelected,
    isTronSelected,
    injectedReady,
    injectedAddress,
    selectedNetwork.chain,
    tokenAddress,
    gatewayAddress,
    requiredSpendWei,
  ]);

  const activeWallet = injectedWallet ||
    (isStarknetSelected
      ? (starknetWalletAddress ? { address: starknetWalletAddress, type: "starknet" } : undefined)
      : shouldUseEOA
        ? (embeddedWallet ? { address: embeddedWallet.address, type: "eoa" } : undefined)
        : smartWallet);

  // For Starknet, the middleware resolves x-wallet-address from the EVM embedded wallet.
  // Use the EVM address for backend API calls (precheck, save, fetchTransactions)
  // so auth passes, while activeWallet still holds the Starknet address for order creation.
  // Middleware pins x-wallet-address to the Privy EVM embedded wallet (plan G9).
  // Use that for backend API calls on non-EVM chains; activeWallet holds the chain signer.
  const apiWalletAddress =
    (isStarknetSelected || isSolanaSelected) && embeddedWallet
      ? embeddedWallet.address
      : activeWallet?.address;

  const precheckNetworkSlug =
    selectedNetwork.chain.network ||
    normalizeNetworkForRateFetch(selectedNetwork.chain.name);

  // Get appropriate balance based on migration status
  // After migration: use externalWalletBalance (EOA balance)
  // Before migration: use smartWalletBalance (SCW balance)
  // Wait for migration status to load before making decision
  const activeBalance = injectedWallet
    ? injectedWalletBalance
    : isStarknetSelected
      ? starknetWalletBalance
      : isTronSelected
        ? tronWalletBalance
        : isSolanaSelected
          ? solanaWalletBalance
        : !isMigrationLoading && shouldUseEOA
          ? externalWalletBalance
          : smartWalletBalance;

  // For CNGN, use raw balance (token units) instead of USD equivalent
  const balance = tokensEqual(token, "cNGN")
    ? (activeBalance?.rawBalances?.[token] ??
      activeBalance?.rawBalances?.cNGN ??
      activeBalance?.rawBalances?.CNGN ??
      activeBalance?.balances[token] ??
      0)
    : (activeBalance?.balances[token] ?? 0);

  // Rendered tsx info
  const renderedInfo = isOnramp
    ? {
      amount: `${currencySymbol}${formatNumberWithCommas(amountSent ?? 0)}`,
      totalValue: `${formatNumberWithCommas(amountReceived ?? 0)} ${token}`,
      rate: `${currencySymbol}${formatNumberWithCommas(rate)}`,
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
      account: `${accountIdentifier} • ${getInstitutionNameByCode(institution, supportedInstitutions) ?? institution ?? ""}`,
      ...(memo && { description: memo }),
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
      rate: packRate(rate),
      senderFeeRecipient: zeroAddress,
      senderFee: BigInt(0),
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
      if (isStarknetSelected) {
        if (!starknetWalletId || !starknetPublicKey || !starknetWalletAddress) {
          throw new Error("Starknet wallet not ready");
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Not authenticated");

        const response = await fetch("/api/starknet/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            walletId: starknetWalletId,
            publicKey: starknetPublicKey,
            tokenAddress,
            gatewayAddress: getGatewayContractAddress("Starknet"),
            amount: params.amount.toString(),
            rate: params.rate.toString(),
            senderFeeRecipient: params.senderFeeRecipient,
            senderFee: params.senderFee.toString(),
            refundAddress: starknetWalletAddress,
            messageHash: params.messageHash,
            address: starknetWalletAddress,
          }),
        });

        if (!response.ok) {
          const err = (await response.json()) as { error?: string };
          throw new Error(err.error ?? "Failed to create Starknet order");
        }

        const data = (await response.json()) as {
          transactionHash?: string;
          orderId?: string;
        };

        setIsGatewayApproved(true);
        setIsOrderCreated(true);

        const txOrderId = data.orderId ?? "";
        const txHash = data.transactionHash as `0x${string}` | undefined;

        if (txOrderId) {
          setOrderId(txOrderId);
          setActiveOrderIsOnramp(false);
          await saveTransactionData({ orderId: txOrderId, txHash });
          setCreatedAt(new Date().toISOString());
          setTransactionStatus("pending");
          setCurrentStep("status");
        }

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": "Starknet",
        });
        refreshBalance();
        return;
      }

      if (isSolanaSelected) {
        if (!solanaWalletAddress) {
          throw new Error("Solana wallet not ready");
        }
        if (!solanaWalletsReady) {
          throw new Error("Solana wallet not ready");
        }

        const solanaWallet = solanaWallets.find(
          (wallet) => wallet.address === solanaWalletAddress,
        );
        if (!solanaWallet) {
          throw new Error("Solana wallet not connected in Privy");
        }

        const senderApiKeyId = config.aggregatorSenderApiKey?.trim();
        if (!senderApiKeyId) {
          throw new Error(
            "Sender API key is not configured (set NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID)",
          );
        }

        const providerId =
          searchParams.get("provider") || searchParams.get("PROVIDER") || undefined;

        const mintAddress =
          [tokenAddress, fetchedTokens.find((t) => t.symbol.toUpperCase() === token.toUpperCase())?.address]
            .find((addr) => addr && isValidSolanaAddress(addr)) ??
          DEFAULT_SOLANA_USDC_MINT;

        const decimals = tokenDecimals ?? 6;
        const amountBaseUnits = parseUnits(
          amountSent.toString(),
          decimals,
        ).toString();

        setCreatedAt(new Date().toISOString());

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Not authenticated");

        const buildResponse = await fetch("/api/solana/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phase: "build",
            depositor: solanaWalletAddress,
            mint: mintAddress,
            amount: amountBaseUnits,
            rate: packRate(rate).toString(),
            senderFee: "0",
            refundAddress: solanaWalletAddress,
            recipient: {
              accountIdentifier: formValues.accountIdentifier,
              accountName: recipientName,
              institution: formValues.institution,
              ...(formValues.memo ? { memo: formValues.memo } : {}),
              ...(providerId ? { providerId } : {}),
              metadata: { apiKey: senderApiKeyId },
            },
          }),
        });

        if (!buildResponse.ok) {
          const err = await readApiJson<{ error?: string }>(buildResponse);
          throw new Error(err.error ?? "Failed to build Solana create_order");
        }

        const buildData = await readApiJson<{
          transaction?: string;
          orderId?: string;
        }>(buildResponse);

        if (!buildData.transaction) {
          throw new Error("Server did not return a Solana transaction");
        }

        const { signedTransaction } = await signSolanaTransaction({
          transaction: base64ToUint8Array(buildData.transaction),
          wallet: solanaWallet,
          chain: "solana:mainnet-beta",
        });

        const submitResponse = await fetch("/api/solana/create-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phase: "submit",
            signedTransaction: uint8ArrayToBase64(signedTransaction),
            orderIdHex: buildData.orderId,
          }),
        });

        if (!submitResponse.ok) {
          const err = await readApiJson<{ error?: string }>(submitResponse);
          throw new Error(err.error ?? "Failed to submit Solana create_order");
        }

        const submitData = await readApiJson<{
          transactionHash?: string;
          orderId?: string;
          confirmed?: boolean;
        }>(submitResponse);

        setIsGatewayApproved(true);
        setIsOrderCreated(true);

        const txOrderId = submitData.orderId ?? buildData.orderId ?? "";
        const txHash = submitData.transactionHash;

        if (txOrderId) {
          setOrderId(txOrderId);
          setActiveOrderIsOnramp(false);
          await saveTransactionData({
            orderId: txOrderId,
            txHash,
          });
          setCreatedAt(new Date().toISOString());
          setTransactionStatus("pending");
          setCurrentStep("status");
        }

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": "Solana",
        });
        refreshBalance();
        return;
      }

      if (isTronSelected) {
        throw new Error("Tron off-ramp is not wired in this flow yet.");
      }

      if (isInjectedWallet && injectedProvider) {
        // Injected wallet
        if (!injectedReady) {
          throw new Error("Injected wallet not ready");
        }

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        const requiredSpend = params.amount + params.senderFee;

        // Authoritative read at confirm time — the mount-time value only drives the step copy.
        // A standing allowance from an earlier swap saves the user a whole wallet prompt here.
        const mustApprove = await needsGatewayApproval({
          chain: selectedNetwork.chain,
          rpcUrl: getRpcUrl(selectedNetwork.chain.name),
          token: tokenAddress,
          owner: injectedAddress ?? undefined,
          spender: gatewayAddress,
          required: requiredSpend,
        });

        if (mustApprove) {
          const approvalData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [gatewayAddress, gatewayApprovalAmount(requiredSpend)],
          });

          // Send approval transaction
          const approvalTx = await injectedProvider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: injectedAddress,
                to: tokenAddress,
                data: appendBaseBuilderCode(
                  selectedNetwork.chain.id,
                  approvalData,
                ),
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
        }

        setIsGatewayApproved(true);

        const createOrderData = encodeFunctionData({
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
        });

        // Create order transaction
        await captureSubmissionBlock();
        await injectedProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: injectedAddress,
              to: gatewayAddress,
              data: appendBaseBuilderCode(
                selectedNetwork.chain.id,
                createOrderData,
              ),
            },
          ],
        });
        toast.success("Order created successfully");
        setIsOrderCreated(true);

        trackEvent("Swap started", {
          "Entry point": "Transaction preview",
          "Wallet type": "Injected wallet",
        });
      } else if (shouldUseEOA && embeddedWallet && isEvmChain(selectedNetwork.chain)) {
        // EIP-7702 + bundler (execute-sponsored): check delegationContractAddress, attach delegation with signature if needed
        const chain = selectedNetwork?.chain;
        if (!chain) throw new Error("Network not ready");
        const chainId = chain.id;
        if (typeof chainId !== "number") {
          throw new Error(`Unsupported network for EVM delegation: ${chain.name}`);
        }

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
        const requiredSpend = params.amount + params.senderFee;

        const mustApprove = await needsGatewayApproval({
          chain,
          rpcUrl,
          token: tokenAddress,
          owner: accountAddress,
          spender: gatewayAddress,
          required: requiredSpend,
        });

        const approveCall: BatchCall = {
          to: tokenAddress as `0x${string}`,
          value: BigInt(0),
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [gatewayAddress, gatewayApprovalAmount(requiredSpend)],
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

        // One array for both the digest and the encoded batch — the signature covers these exact
        // calls, so dropping the approve from one and not the other would fail at the bundler.
        const batchCalls: BatchCall[] = mustApprove
          ? [approveCall, createOrderCall]
          : [createOrderCall];

        const nonce = await readBatchNonce(publicClient, accountAddress).catch(() => BigInt(0));
        const digest = buildBatchDigest(nonce, batchCalls);
        const rawSignature = (await provider.request({
          method: "personal_sign",
          params: [digest, accountAddress],
        })) as string;
        const signature = (rawSignature.startsWith("0x") ? rawSignature : `0x${rawSignature}`) as `0x${string}`;

        const callData = encodeExecuteBatch(batchCalls, signature);
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
        try {
          await getOrderId();
        } finally {
          setIsPollingOrderId(false);
        }
        return;
      } else if (isEvmChain(selectedNetwork.chain)) {
        // Smart wallet (pre-migration)
        if (!client) {
          throw new Error("Smart wallet not found");
        }

        await client.switchChain({
          id: selectedNetwork.chain.id,
        });

        const params = await prepareCreateOrderParams();
        setCreatedAt(new Date().toISOString());

        const requiredSpend = params.amount + params.senderFee;

        const mustApprove = await needsGatewayApproval({
          chain: selectedNetwork.chain,
          rpcUrl: getRpcUrl(selectedNetwork.chain.name),
          token: tokenAddress,
          owner: client.account?.address ?? activeWallet?.address,
          spender: gatewayAddress,
          required: requiredSpend,
        });

        await captureSubmissionBlock();
        await client.sendTransaction({
          calls: [
            // Approve gateway contract to spend token, unless allowance already covers it
            ...(mustApprove
              ? [
                  {
                    to: tokenAddress,
                    data: encodeFunctionData({
                      abi: erc20Abi,
                      functionName: "approve",
                      args: [
                        gatewayAddress,
                        gatewayApprovalAmount(requiredSpend),
                      ],
                    }),
                  },
                ]
              : []),
            // Create order
            {
              to: gatewayAddress,
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
        throw new Error(
          `Off-ramp is not supported for ${selectedNetwork.chain.name} in this wallet mode.`,
        );
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
      const orderCurrency = currency?.trim().toUpperCase() ?? "";
      if (
        !orderCurrency ||
        refundAccount.currency.trim().toUpperCase() !== orderCurrency
      ) {
        toast.error("Add a refund account for this currency to continue");
        setRefundAccount(null);
        return;
      }
      if (!walletAddress) {
        toast.error("Recipient wallet is required");
        return;
      }
      try {
        setIsConfirming(true);
        const { accessToken, injectedToken } = await resolveAuth({
          interactive: true,
        });
        if (!accessToken && !injectedToken) {
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

        await precheckSwapTransaction(
          {
            walletAddress: apiWalletAddress ?? activeWallet.address,
            transactionType: "onramp",
            fromCurrency: currency,
            toCurrency: toAggregatorToken(token),
            amountSent: Number(amountSent),
            amountReceived: Number(amountReceived),
            fee: Number(rate),
            network: precheckNetworkSlug,
            recipient: {
              account_name: recipientName || walletAddress || "",
              institution: "Wallet",
              account_identifier: walletAddress || "",
            },
          },
          accessToken,
          injectedToken,
        );

        const payload = {
          amount: String(amountSent),
          amountIn: "fiat" as const,
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
            currency: toAggregatorToken(token),
            network: aggregatorNetwork,
            ...(providerId ? { providerId } : {}),
            recipient: {
              // When chained forwarding is enabled, the aggregator settles to the user's
              // Noblocks wallet first. The user's chosen destination (`walletAddress`) is
              // forwarded to in leg 2, server-side.
              address: config.onrampChainedForwardingEnabled
                ? activeWallet.address
                : walletAddress,
              network: aggregatorNetwork,
            },
          },
        };


        const res = await createV2SenderPaymentOrder(
          payload,
          accessToken,
          injectedToken,
        );
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
        setActiveOrderIsOnramp(true);
        setCreatedAt(new Date().toISOString());
        setTransactionStatus("pending");

        await saveTransactionData({
          orderId: orderIdStr,
          txHash: undefined,
          providerAccount: created.providerAccount,
        });

        if ((accessToken || injectedToken) && apiWalletAddress) {
          void fetchTransactions(
            apiWalletAddress,
            accessToken,
            1,
            30,
            true,
            injectedToken,
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

    // Offramp: require token balance for the amount
    if (amountSent > balance) {
      toast.warning("Low balance. Fund your wallet.", {
        description: `Insufficient funds. You need ${formatNumberWithCommas(amountSent)} ${token}.`,
      });
      return;
    }

    try {
      setIsConfirming(true);
      const { accessToken, injectedToken } = await resolveAuth({
        interactive: true,
      });
      if (!accessToken && !injectedToken) {
        toast.error("Please sign in to continue");
        return;
      }

      await precheckSwapTransaction(
        {
          walletAddress: apiWalletAddress ?? activeWallet.address,
          fromCurrency: toAggregatorToken(token),
          toCurrency: currency,
          amountSent: Number(amountSent),
          amountReceived: Number(amountReceived),
          fee: Number(rate),
          network: precheckNetworkSlug,
          recipient: {
            account_name: recipientName,
            institution: getInstitutionNameByCode(
              institution,
              supportedInstitutions,
            ) as string,
            account_identifier: accountIdentifier,
            ...(memo && { memo }),
          },
        },
        accessToken,
        injectedToken,
      );

      await createOrder();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unable to start this transaction.";
      setErrorMessage(msg);
      setErrorCount((prevCount: number) => prevCount + 1);
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
    txHash?: string;
    /** Pass from create-order response so bank name is saved before React state updates. */
    providerAccount?: V2FiatProviderAccountDTO | null;
  }) => {
    if (!activeWallet?.address) return;
    if (isSavingTransactionRef.current) return;
    isSavingTransactionRef.current = true;
    setIsSavingTransaction(true);

    try {
      const { accessToken, injectedToken } = await resolveAuth({
        interactive: true,
      });
      if (!accessToken && !injectedToken) {
        throw new Error("No access token available");
      }

      const transaction: TransactionCreateInput = {
        walletAddress: apiWalletAddress ?? activeWallet.address,
        transactionType: isOnramp ? "onramp" : "offramp",
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

      const response = await saveTransaction(
        transaction,
        accessToken,
        injectedToken,
      );
      if (!response.success) {
        throw new Error("Failed to save transaction");
      }

      const rawId = (response.data as { id?: unknown } | undefined)?.id;
      const idStr =
        typeof rawId === "string"
          ? rawId
          : rawId != null && String(rawId) !== "undefined"
            ? String(rawId)
            : "";
      if (!idStr) {
        throw new Error("Failed to save transaction: missing transaction id");
      }

      localStorage.setItem("currentTransactionId", idStr);
    } catch (error) {
      console.error("Error saving transaction:", error);
      throw error;
    } finally {
      isSavingTransactionRef.current = false;
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
              setActiveOrderIsOnramp(false);

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
              const { accessToken, injectedToken } = await resolveAuth({
                interactive: true,
              });
              if (!accessToken && !injectedToken) {
                throw new Error("Please sign in to save your refund account.");
              }
              const isEdit = refundAccount !== null;
              const saved = await saveRefundAccount(
                data,
                accessToken,
                injectedToken,
              );
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
            {willNeedApproval
              ? "To confirm order, you'll be required to approve these two permissions from your wallet"
              : "To confirm order, you'll be required to approve this permission from your wallet"}
          </p>

          <div className="flex items-center justify-between pb-2 text-gray-500 dark:text-white/50">
            <p>
              <span>
                {willNeedApproval ? (isGatewayApproved ? 2 : 1) : 1}
              </span>{" "}
              of {willNeedApproval ? 2 : 1}
            </p>
            <div className="flex gap-4">
              {willNeedApproval && (
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
              )}

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

      {isOnramp &&
        config.onrampChainedForwardingEnabled &&
        walletAddress &&
        activeWallet?.address &&
        walletAddress.toLowerCase() !== activeWallet.address.toLowerCase() && (
          <p className="text-center text-xs font-normal text-text-secondary dark:text-white/50">
            Funds settle to your Noblocks wallet, then we forward them to the
            recipient address.
          </p>
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
