"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { AnimatedModal } from "./AnimatedComponents";
import { primaryBtnClasses, inputClasses } from "./Styles";
import { classNames } from "../utils";
import { InputError } from "./InputError";
import { ImSpinner } from "react-icons/im";
import confetti from "canvas-confetti";

interface BlockFestCashbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  email: string;
}

const COUNTDOWN_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export const BlockFestCashbackModal = ({
  isOpen,
  onClose,
}: BlockFestCashbackModalProps) => {
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_DURATION);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!isOpen) {
      setTimeLeft(COUNTDOWN_DURATION);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1000) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Format time remaining
  const formatTime = (milliseconds: number) => {
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // TODO: Implement cashback claim logic
      console.log("Claiming cashback for email:", data.email);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

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
                "w-full rounded-xl border border-border-input bg-transparent px-4 py-2.5 text-sm font-light text-neutral-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900",
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
              "flex min-h-11 min-w-fit items-center justify-center rounded-xl bg-lavender-500 px-4 py-2.5 text-sm font-medium leading-normal text-white transition-all hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white dark:hover:bg-lavender-600 dark:focus-visible:ring-offset-neutral-900 dark:disabled:bg-white/10 dark:disabled:text-white/50",
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
};
