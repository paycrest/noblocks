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
import { usePrivy } from "@privy-io/react-auth";
import { classNames } from "@/app/utils";

interface BlockFestCashbackComponentProps {
  transactionId: string;
  cashbackPercentage?: string;
}

type TransferStatus = "idle" | "loading" | "success" | "error";

export default function BlockFestCashbackComponent({
  transactionId,
  cashbackPercentage = "1%",
}: BlockFestCashbackComponentProps) {
  const { theme } = useTheme();
  const { getAccessToken } = usePrivy();
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("idle");
  const [hasTransferred, setHasTransferred] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState<string>("0.00");
  const [tokenType, setTokenType] = useState<string>("");

  // Execute cashback transfer on component mount
  useEffect(() => {
    const executeCashbackTransfer = async () => {
      // Prevent duplicate transfers
      if (hasTransferred || !transactionId) {
        return;
      }

      setTransferStatus("loading");

      try {
        // Get Privy access token for authentication
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Authentication required. Please sign in.");
        }

        const response = await axios.post(
          "/api/blockfest/cashback",
          {
            transactionId,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (response.data.success) {
          const claim = response.data.claim;
          setCashbackAmount(claim.amount);
          setTokenType(claim.tokenType);
          setTransferStatus("success");
          setHasTransferred(true);
          toast.success("Cashback transferred successfully!", {
            description: `${cashbackPercentage} (${claim.amount} ${claim.tokenType}) has been added to your wallet`,
          });
        } else {
          throw new Error(response.data.error || "Transfer failed");
        }
      } catch (error) {
        console.error("Cashback transfer error:", error);
        setTransferStatus("error");

        // Extract error details from API response
        let errorTitle = "Cashback transfer failed";
        let errorMessage = "Please contact support for assistance";

        if (axios.isAxiosError(error) && error.response?.data) {
          const errorData = error.response.data;
          // Use the detailed message from API response
          errorMessage = errorData.message || errorData.error || errorMessage;

          // Log error code for debugging
          if (errorData.code) {
            console.error(
              "Cashback error code:",
              errorData.code,
              errorData.details,
            );
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        toast.error(errorTitle, {
          description: errorMessage,
          duration: 6000, // Show error longer for user to read
        });
      }
    };

    executeCashbackTransfer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, hasTransferred]);

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
      case "idle":
      default:
        return "Verifying your cashback eligibility...";
    }
  };

  return (
    <div
      className={classNames(
        "inline-flex w-80 flex-col items-center justify-start gap-3 rounded-[20px]",
        transferStatus === "success"
          ? "bg-gray-50 px-1 pb-3 pt-1 dark:bg-white/5"
          : "",
      )}
    >
      {/* Banner with cashback message */}
      <div className="relative rounded-2xl bg-[url('/images/blockfest/blockfest-banner-bg.svg')] bg-cover bg-left-top bg-no-repeat py-1 pl-12 pr-2.5 text-sm">
        {getBannerText()}
      </div>

      {/* Description and social buttons - only show on success */}
      {transferStatus === "success" && (
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
              href="https://x.com/intent/tweet?text=I%20just%20swapped%20live%20at%20%40blockfestafrica%20using%20%40noblocks_xyz%20on%20%40Base%20with%20%40BasedWestAfrica%20in%20seconds%20for%202%25%20cashback%20⚡️%0A%0APull%20up%20if%20you're%20around%20and%20use%20the%20link%20below%20to%20claim%20yours%20💰%0A%0A%23BlockfestAfrica2025%20%23UseNoblocks%0A%0Ahttps%3A%2F%2Fnoblocks.xyz%3Fref%3Dblockfest"
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
              href="https://warpcast.com/~/compose?text=I%20just%20swapped%20live%20at%20%40blockfestafrica%20using%20%40noblocks_xyz%20on%20%40Base%20with%20%40BasedWestAfrica%20in%20seconds%20for%202%25%20cashback%20⚡️%0A%0APull%20up%20if%20you're%20around%20and%20use%20the%20link%20below%20to%20claim%20yours%20💰%0A%0A%23BlockfestAfrica2025%20%23UseNoblocks%0A%0Ahttps%3A%2F%2Fnoblocks.xyz%3Fref%3Dblockfest"
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
      )}
    </div>
  );
}
