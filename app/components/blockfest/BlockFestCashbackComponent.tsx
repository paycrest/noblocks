import {
  XIconLightTheme,
  XIconDarkTheme,
  FarcasterIconLightTheme,
  FarcasterIconDarkTheme,
} from "../ImageAssets";
import { useTheme } from "next-themes";
import { secondaryBtnClasses } from "../Styles";
import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";

interface BlockFestCashbackComponentProps {
  cashbackAmount?: string; // e.g., "0.02"
  cashbackPercentage?: string;
  tokenType: "USDC" | "USDT";
  userWalletAddress: string;
}

type TransferStatus = "idle" | "loading" | "success" | "error";

export default function BlockFestCashbackComponent({
  cashbackAmount = "0.00",
  cashbackPercentage = "1%",
  tokenType,
  userWalletAddress,
}: BlockFestCashbackComponentProps) {
  const { theme } = useTheme();
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("idle");
  const [hasTransferred, setHasTransferred] = useState(false);

  // Execute cashback transfer on component mount
  useEffect(() => {
    const executeCashbackTransfer = async () => {
      // Prevent duplicate transfers
      if (hasTransferred || !userWalletAddress || !cashbackAmount) {
        return;
      }

      setTransferStatus("loading");

      try {
        const response = await axios.post("/api/blockfest/cashback", {
          walletAddress: userWalletAddress,
          amount: cashbackAmount,
          tokenType,
        });

        if (response.data.success) {
          setTransferStatus("success");
          setHasTransferred(true);
          toast.success("Cashback transferred successfully!", {
            description: `${cashbackPercentage} (${cashbackAmount} ${tokenType}) has been added to your wallet`,
          });
        } else {
          throw new Error(response.data.error || "Transfer failed");
        }
      } catch (error) {
        console.error("Cashback transfer error:", error);
        setTransferStatus("error");
        toast.error("Cashback transfer failed", {
          description:
            error instanceof Error
              ? error.message
              : "Please contact support for assistance",
        });
      }
    };

    executeCashbackTransfer();
  }, [
    userWalletAddress,
    cashbackAmount,
    tokenType,
    hasTransferred,
    cashbackPercentage,
  ]);

  // Get banner text based on transfer status
  const getBannerText = () => {
    switch (transferStatus) {
      case "loading":
        return "Processing your cashback, please wait...";
      case "success":
        return (
          <>
            <span className="text-sm font-semibold text-white">
              {cashbackPercentage} ({cashbackAmount} {tokenType})
            </span>
            <span className="text-sm text-white">
              {" "}
              cashback has been added to your wallet
            </span>
          </>
        );
      case "error":
        return "Cashback couldn't be completed. Please try again or contact support.";
      default:
        return (
          <>
            <span className="text-sm font-semibold text-white">
              {cashbackPercentage} ({cashbackAmount} {tokenType})
            </span>
            <span className="text-sm text-white">
              {" "}
              cashback has been added to your wallet
            </span>
          </>
        );
    }
  };

  return (
    <div className="inline-flex w-80 flex-col items-center justify-start gap-3 rounded-[20px] bg-gray-50 px-1 pb-3 pt-1 dark:bg-white/5">
      {/* Banner with cashback message */}
      <div className="relative rounded-2xl bg-[url('/images/blockfest/blockfest-banner-bg.svg')] bg-cover bg-left-top bg-no-repeat py-1 pl-12 pr-2.5">
        {getBannerText()}
      </div>

      {/* Description and social buttons */}
      <div className="flex flex-col gap-3 px-3 pb-1">
        <div className="text-sm font-light text-text-body dark:text-white">
          Post your swap on X or Farcaster, tag{" "}
          <a
            href="https://x.com/noblocks_xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-lavender-500 hover:underline"
          >
            @noblocks_xyz
          </a>
          ,{" "}
          <a
            href="https://x.com/basedwestafrica"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-lavender-500 hover:underline"
          >
            @basedwestafrica
          </a>{" "}
          and{" "}
          <a
            href="https://x.com/blockfestafrica"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-lavender-500 hover:underline"
          >
            @blockfestafrica
          </a>{" "}
          then show your post at the Noblocks booth to get your extra{" "}
          <span className="font-medium">1%</span> instantly added to your
          wallet.
        </div>

        <div className="flex gap-3">
          {/* X (Twitter) Button */}
          <a
            aria-label="Share on Twitter"
            rel="noopener noreferrer"
            target="_blank"
            href="https://x.com/intent/tweet?text=Just%20got%201%%20cashback%20on%20my%20swap%20at%20BlockFest!%20Thanks%20@noblocks_xyz%20@basedwestafrica%20@blockfestafrica%20for%20the%20amazing%20experience%20🎉%20#BlockFest%20#BaseNetwork"
            className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
          >
            {theme === "dark" ? (
              <XIconDarkTheme className="size-5 text-text-secondary dark:text-white/50" />
            ) : (
              <XIconLightTheme className="size-5 text-text-secondary dark:text-white/50" />
            )}
            X (Twitter)
          </a>

          {/* Farcaster Button */}
          <a
            aria-label="Share on Farcaster"
            rel="noopener noreferrer"
            target="_blank"
            href="https://warpcast.com/~/compose?text=Just%20got%201%%20cashback%20on%20my%20swap%20at%20BlockFest!%20Thanks%20@noblocks_xyz%20@basedwestafrica%20@blockfestafrica%20for%20the%20amazing%20experience%20🎉%20#BlockFest%20#BaseNetwork"
            className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
          >
            {theme === "dark" ? (
              <FarcasterIconDarkTheme className="size-5 text-text-secondary dark:text-white/50" />
            ) : (
              <FarcasterIconLightTheme className="size-5 text-text-secondary dark:text-white/50" />
            )}
            Farcaster
          </a>
        </div>
      </div>
    </div>
  );
}
