"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { AnimatePresence } from "framer-motion";
import Image from "next/image";
import { AnimatedModal } from "../AnimatedComponents";
import { classNames } from "../../utils";
import { InputError } from "../InputError";
import { toast } from "sonner";
import { ImSpinner } from "react-icons/im";
import confetti from "canvas-confetti";
import { useBlockFestClaim } from "@/app/context/BlockFestClaimContext";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";
import { useInjectedWallet } from "../../context";

interface BlockFestCashbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  email: string;
}

// BlockFest end date from environment variable (ISO 8601 format with timezone)
// Example: 2025-10-11T23:59:00+01:00 (October 11th, 2025 at 11:59 PM UTC+1)
const BLOCKFEST_END_DATE = new Date(
  process.env.NEXT_PUBLIC_BLOCKFEST_END_DATE || "2025-10-11T23:59:00+01:00",
);

export default function BlockFestCashbackModal({
  isOpen,
  onClose,
}: BlockFestCashbackModalProps) {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, BLOCKFEST_END_DATE.getTime() - Date.now()),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { markClaimed } = useBlockFestClaim();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { user } = usePrivy();

  const {
    register,
    handleSubmit,
    formState: { errors, isValid, isDirty },
    reset,
  } = useForm<FormData>({
    mode: "onChange",
    defaultValues: {
      email: "",
    },
  });

  // Countdown timer effect
  useEffect(() => {
    const calculateTimeLeft = () => {
      const remaining = Math.max(0, BLOCKFEST_END_DATE.getTime() - Date.now());
      setTimeLeft(remaining);
      return remaining;
    };

    // Initial calculation
    calculateTimeLeft();

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time remaining
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const walletAddress = isInjectedWallet
        ? injectedAddress
        : user?.linkedAccounts.find(
            (account) => account.type === "smart_wallet",
          )?.address;

      // Validate wallet address
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress ?? "")) {
        toast.error("Invalid wallet address", {
          description: "Please ensure you're properly connected",
        });
        setIsSubmitting(false);
        return;
      }

      // Execute both API calls in parallel
      const [supabaseResult, brevoResult] = await Promise.allSettled([
        // Supabase: Save participant
        axios
          .post("/api/blockfest/participants", {
            walletAddress,
            email: data.email,
            source: "modal",
          })
          .then((res) => {
            if (!res.data.success) {
              throw new Error(res.data.error || "Failed to save participant");
            }
            return res.data;
          }),

        // Brevo: Add contact to list
        axios
          .post("/api/brevo/add-contact", { email: data.email })
          .then((res) => {
            if (!res.data.success) {
              throw new Error(res.data.error || "Failed to add email to list");
            }
            return res.data;
          }),
      ]);

      // Check Supabase result (critical)
      if (supabaseResult.status === "rejected") {
        console.error("Supabase error:", supabaseResult.reason);
        toast.error("Could not save cashback enrollment", {
          description:
            supabaseResult.reason instanceof Error
              ? supabaseResult.reason.message
              : "Please try again shortly",
        });
        setIsSubmitting(false);
        return;
      }

      // Check Brevo result (non-critical, log only)
      if (brevoResult.status === "rejected") {
        console.error("Brevo error:", brevoResult.reason);
        // Don't block user success, but log for monitoring
      }

      // Update in-memory state
      markClaimed();

      // Fire confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Close modal on success
      onClose();
      reset();
    } catch (error) {
      console.error("Failed to claim cashback:", error);
      toast.error("Something went wrong", {
        description: "Please try again",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isExpired = timeLeft === 0;

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      showGradientHeader={true}
      maxWidth="28rem"
      backgroundImagePath="/images/blockfest/blockfest-banner-bg.svg"
    >
      <div className="space-y-4">
        {/* BlockFest Logo */}
        <div className="flex justify-start">
          <div className="rounded-bl-sm rounded-br-xl rounded-tl-xl rounded-tr-xl bg-gray-50 px-1.5 py-1 dark:bg-white/10">
            <Image
              src="/images/blockfest/blockfest-logo.svg"
              alt="BlockFest Africa Logo"
              width={200}
              height={80}
              className="h-auto w-20"
              priority
            />
          </div>
        </div>

        {/* Title */}
        <div className="text-left">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            BlockFest Bonus Unlocked! 🔓
          </h2>
        </div>

        {/* Description with integrated countdown */}
        <div className="text-left">
          <p className="text-sm font-light text-text-secondary dark:text-white/70">
            As a BlockFest attendee, you get{" "}
            <span className="font-medium text-text-body dark:text-white">
              2%
            </span>{" "}
            on all your swaps made on{" "}
            <span className="font-medium text-text-body dark:text-white">
              Base Network
            </span>
            .
            <br />
            <br />
            Offer expires in{" "}
            <span className="font-medium text-lavender-500">
              {isExpired ? "00:00" : formatTime(timeLeft)}
            </span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-2">
            <input
              type="email"
              id="email"
              {...register("email", {
                required: {
                  value: true,
                  message: "Email address is required",
                },
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Please enter a valid email address",
                },
              })}
              className={classNames(
                "w-full rounded-xl border border-border-input bg-transparent px-4 py-2.5 text-sm font-light text-neutral-900 transition-all placeholder:text-gray-400 focus:outline-hidden focus:ring-2 focus:ring-lavender-500 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900",
                errors.email
                  ? "border-input-destructive focus:border-input-destructive dark:border-input-destructive"
                  : "",
              )}
              placeholder="Enter your email address"
              disabled={isExpired}
            />
            <AnimatePresence>
              {errors.email && <InputError message={errors.email.message} />}
            </AnimatePresence>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className={classNames(
              "flex min-h-11 min-w-fit items-center justify-center rounded-xl bg-lavender-500 px-4 py-2.5 text-sm font-medium leading-normal text-white transition-all hover:bg-lavender-600 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white dark:hover:bg-lavender-600 dark:focus-visible:ring-offset-neutral-900 dark:disabled:bg-white/10 dark:disabled:text-white/50",
              "w-full",
              isExpired
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-lavender-600 dark:hover:bg-lavender-600",
            )}
            disabled={!isValid || !isDirty || isSubmitting || isExpired}
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <ImSpinner className="size-4 animate-spin text-white" />
                <span>Processing...</span>
              </div>
            ) : isExpired ? (
              "Offer expired"
            ) : (
              "Claim my cashback"
            )}
          </button>
        </form>
      </div>
    </AnimatedModal>
  );
}
