"use client";
import { useState, useCallback, useEffect, useRef, useMemo, useId } from "react";
import { toast } from "sonner";
import { DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import {
  CheckmarkCircle01Icon,
  ArrowUp01Icon,
  InformationSquareIcon,
  ArrowLeft02Icon,
  AlertSquareIcon,
  Search01Icon,
  SmileIcon,
  PassportIcon,
  MapPinpoint02Icon,
} from "hugeicons-react";
import { validatePhoneForSelectedCountry, sanitizePhoneNumberInputForCountry } from "../lib/phone-validation";
import { fadeInOut, AnimatedComponent, slideInOut, AnimatedModal } from "./AnimatedComponents";
import { drawerSuccessIconClasses } from "./drawer/drawerStyles";
import { formatNumberWithCommas } from "../utils";
import { getKycMonthlyLimitsRecord } from "@/app/lib/kyc-tier-limits";
import {
  fetchCountries,
  getPopularCountries,
  searchCountries,
  type Country,
} from "../lib/countries";
import { useKYC } from "../context/KYCContext";
import { useInjectedWallet } from "../context/InjectedWalletContext";
import { toastMappedError } from "../lib/toastMappedError";

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (phoneNumber: string) => void;
}

const STEPS = {
  ENTER_PHONE: "enter_phone",
  ENTER_OTP: "enter_otp",
  VERIFIED: "verified",
} as const;

type Step = (typeof STEPS)[keyof typeof STEPS];

export default function PhoneVerificationModal({
  isOpen,
  onClose,
  onVerified,
}: PhoneVerificationModalProps) {
  const tier1MonthlyLimitUsd = useMemo(
    () => getKycMonthlyLimitsRecord()[1],
    [],
  );
  const { tier, fullName, refreshStatus } = useKYC();

  const PHONE_MODAL_COPY = useMemo(
    () => ({
      onboarding: {
        heading: "Verify your number to start swapping",
        subheading:
          "Enter your details below to unlock your first swaps. No extra documents required.",
        infoCard: `With just the details above, you can swap up to $${formatNumberWithCommas(tier1MonthlyLimitUsd)}/month. Verify your ID later to unlock even higher limits.`,
        cta: "Verify and start",
      },
      existingTier: {
        heading: "Secure your account",
        subheading: "To comply with updated security standards and keep your Tier privileges active, please submit your phone number.",
        infoCard: "Your Tier status and limits will remain unaffected once confirmed.",
        cta: "Verify Number",
      },
    }),
    [tier1MonthlyLimitUsd],
  );

  const copyVariant = tier >= 2 ? "existingTier" : "onboarding";
  const copy = PHONE_MODAL_COPY[copyVariant];
  const titleId = useId();
  const { wallets } = useWallets();
  const { getAccessToken, ready, authenticated } = usePrivy();
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    getInjectedAuthHeaders,
  } = useInjectedWallet();

  const resolveAccessToken = useCallback(async (): Promise<string | null> => {
    if (!ready) {
      toast.error(
        "Authentication is still loading. Please wait a moment and try again.",
      );
      return null;
    }
    // Allow injected wallet mode to proceed without Privy authentication
    if (!authenticated && !isInjectedWallet) {
      toast.error("Please sign in again to verify your phone.");
      return null;
    }
    // For injected wallets, we don't need a Privy access token
    if (isInjectedWallet) {
      return null;
    }
    const token = await getAccessToken();
    if (typeof token !== "string" || !token.trim()) {
      toast.error("Could not get a valid session. Please sign in again.");
      return null;
    }
    return token.trim();
  }, [ready, authenticated, getAccessToken, isInjectedWallet]);

  // Auth headers for the phone endpoints. Injected wallets use the SIWE
  // session token (interactive — every caller here is a user action, so a
  // sign-in popup on an expired session is expected); Privy wallets use the
  // Bearer token. Null = not authenticated; failure toasts already shown.
  const resolveAuthHeaders = useCallback(async (): Promise<Record<
    string,
    string
  > | null> => {
    if (isInjectedWallet) {
      return getInjectedAuthHeaders({ interactive: true });
    }
    const token = await resolveAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, [isInjectedWallet, getInjectedAuthHeaders, resolveAccessToken]);

  // In injected/bridge mode, require a ready injected address; otherwise
  // fall back to the Privy embedded wallet.
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = isInjectedWallet
    ? (injectedReady ? injectedAddress : null)
    : embeddedWallet?.address;

  const [step, setStep] = useState<Step>(STEPS.ENTER_PHONE);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [formattedPhone, setFormattedPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<"kudisms" | "twilio">("kudisms");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [selectedCountry, setSelectedCountry] = useState({
    code: "+234",
    flag: "https://flagcdn.com/w40/ng.png",
    name: "Nigeria",
    country: "NG",
  });
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<Country[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load countries when modal opens
  useEffect(() => {
    if (isOpen && countries.length === 0) {
      setIsLoadingCountries(true);
      fetchCountries()
        .then((data) => {
          setCountries(data);
          setFilteredCountries(data);

          // Set Nigeria as default if available
          const nigeria = data.find((c) => c.country === "NG");
          if (nigeria) {
            setSelectedCountry(nigeria);
          }
        })
        .catch(() => {
          toast.error("Failed to load countries. Using defaults.");
        })
        .finally(() => {
          setIsLoadingCountries(false);
        });
    }
  }, [isOpen, countries.length]);

  // Filter countries based on search
  useEffect(() => {
    if (countrySearch.trim()) {
      setFilteredCountries(searchCountries(countries, countrySearch));
    } else {
      // Show popular countries first, then the rest
      const popularCountryCodes = getPopularCountries();
      const popular = countries.filter((c) =>
        popularCountryCodes.includes(c.country),
      );
      const others = countries.filter(
        (c) => !popularCountryCodes.includes(c.country),
      );
      setFilteredCountries([...popular, ...others]);
    }
  }, [countrySearch, countries]);

  // Close dropdown when clicking outside (`click`, not `mousedown` — see useOutsideClick)
  useEffect(() => {
    if (!isCountryDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsCountryDropdownOpen(false);
        setCountrySearch("");
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isCountryDropdownOpen]);

  useEffect(() => {
    setPhoneNumber((prev) =>
      sanitizePhoneNumberInputForCountry(prev, selectedCountry),
    );
  }, [selectedCountry]);

  const phoneValidation = useMemo(
    () => validatePhoneForSelectedCountry(phoneNumber, selectedCountry),
    [phoneNumber, selectedCountry],
  );

  const showFullNameField = !fullName?.trim();

  const handlePhoneSubmit = useCallback(async () => {
    if (showFullNameField && !name.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    // The CTA is already disabled while the phone is invalid; this is only a
    // race guard for a submit that slipped through mid-edit.
    if (!phoneValidation.ok) {
      return;
    }
    // Both wallet sources resolve asynchronously (Privy provisions the
    // embedded wallet after first login; injected/bridge wallets connect on
    // demand). A silent return here read as a dead button — say what's
    // missing instead.
    if (!walletAddress) {
      toast.error(
        isInjectedWallet
          ? "Connect your wallet to continue."
          : "Your wallet is still being set up. Give it a few seconds and try again.",
      );
      return;
    }

    try {
      const authHeaders = await resolveAuthHeaders();
      if (!authHeaders) {
        return;
      }

      setIsLoading(true);

      const response = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phoneNumber: phoneValidation.e164,
          name: showFullNameField ? name.trim() : (fullName ?? ""),
          countryIso: selectedCountry.country,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFormattedPhone(data.phoneNumber);
        setProvider(data.provider);
        setOtpCode("");
        setAttemptsRemaining(3);
        setStep(STEPS.ENTER_OTP);
      } else {
        toast.error(data.error || "Failed to send OTP");
      }
    } catch (error) {
      toastMappedError(error, {
        feature: "phone-send-otp",
        description: "Failed to send OTP. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, walletAddress, isInjectedWallet, selectedCountry, name, fullName, showFullNameField, resolveAuthHeaders, phoneValidation]);

  const handleOtpSubmit = useCallback(async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      toast.error("Please enter the 6-digit OTP code");
      return;
    }

    const authHeaders = await resolveAuthHeaders();
    if (!authHeaders) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          otpCode: otpCode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await refreshStatus(true);
        setStep(STEPS.VERIFIED);
      } else {
        toast.error(data.error || "Invalid OTP code");
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
      }
    } catch (error) {
      toastMappedError(error, {
        feature: "phone-verify-otp",
        description: "Failed to verify OTP. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [otpCode, formattedPhone, resolveAuthHeaders, refreshStatus]);

  const handleResendOtp = useCallback(async () => {
    const authHeaders = await resolveAuthHeaders();
    if (!authHeaders) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAttemptsRemaining(3);
        setOtpCode("");
        toast.success("New OTP sent successfully");
      } else {
        toast.error(data.error || "Failed to resend OTP");
      }
    } catch (error) {
      toastMappedError(error, {
        feature: "phone-resend-otp",
        description: "Failed to resend OTP",
      });
    } finally {
      setIsLoading(false);
    }
  }, [formattedPhone, resolveAuthHeaders]);

  const handleClose = async () => {
    if (step === STEPS.VERIFIED && formattedPhone) {
      await refreshStatus(true);
      onVerified(formattedPhone);
    }
    onClose();
    // Reset state when modal is closed
    setStep(STEPS.ENTER_PHONE);
    setName("");
    setPhoneNumber("");
    setFormattedPhone("");
    setOtpCode("");
    setAttemptsRemaining(3);
    setIsCountryDropdownOpen(false);
    setCountrySearch("");
  };

  const renderEnterPhone = () => {
    const showFullNameField = !fullName?.trim();
    return (
      <motion.div key="enter-phone" {...fadeInOut} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 text-start">
          <AlertSquareIcon className="h-7 w-7 text-text-disabled dark:text-white/40" />
          <DialogTitle
            id={titleId}
            className="text-lg font-semibold leading-6 text-text-body dark:text-white"
          >
            {copy.heading}
          </DialogTitle>
          <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-body dark:text-white/50">
            {copy.subheading}
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-white/5">
          {showFullNameField && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="fullname"
                className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80"
              >
                Full name
              </label>
              <input
                type="text"
                id="fullname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="h-10 w-full rounded-xl border border-border-input bg-transparent px-2 py-2.5 text-sm text-text-body transition-all placeholder:text-text-placeholder focus:border-[#0065f5] focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/30"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label
              htmlFor="phone"
              className="text-sm font-medium leading-6 text-text-body dark:text-white/80"
            >
              Phone number
            </label>
            <div className="relative">
              <div
                className="flex h-10 w-full items-center rounded-xl border border-border-input bg-transparent transition-all focus-within:border-[#0065f5] dark:border-white/20"
              >
                <div ref={dropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                    className="flex items-center gap-0.5 py-0.5 pl-2"
                  >
                    <img
                      src={selectedCountry.flag}
                      alt={`${selectedCountry.name} flag`}
                      className="h-[18px] w-[18px] rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <ArrowUp01Icon
                      className={`h-[18px] w-[18px] text-text-secondary transition-transform dark:text-white/50 ${
                        isCountryDropdownOpen ? "" : "rotate-180"
                      }`}
                    />
                  </button>

                  {isCountryDropdownOpen && (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-20 flex h-[244px] w-[340px] max-w-[calc(100vw-4.5rem)] flex-col gap-3 overflow-hidden rounded-2xl border-[0.3px] border-border-light bg-white py-2 pl-2 pr-4 shadow-[0px_4px_6px_-1px_rgba(18,18,23,0.08),0px_2px_4px_-1px_rgba(18,18,23,0.06)] dark:border-white/10 dark:bg-surface-overlay">
                      <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border-light px-3 dark:border-white/20">
                        <Search01Icon className="h-4 w-4 shrink-0 text-text-secondary dark:text-white/40" />
                        <input
                          type="text"
                          placeholder="Search country code"
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          className="h-full w-full bg-transparent text-sm text-text-body placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30"
                          autoFocus
                        />
                      </div>

                      <div className="overflow-y-auto">
                        {isLoadingCountries ? (
                          <div className="flex flex-col gap-1">
                            {[...Array(5)].map((_, index) => (
                              <div
                                key={index}
                                className="flex h-9 w-full items-center gap-2 p-1"
                              >
                                <div className="size-6 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-gray-200 dark:bg-white/10" />
                                <div className="h-4 w-24 animate-pulse motion-reduce:animate-none rounded bg-gray-200 dark:bg-white/10" />
                                <div className="h-4 w-10 animate-pulse motion-reduce:animate-none rounded bg-gray-200 dark:bg-white/10" />
                              </div>
                            ))}
                          </div>
                        ) : filteredCountries.length > 0 ? (
                          filteredCountries.map((country) => (
                            <button
                              key={country.country}
                              type="button"
                              onClick={() => {
                                setSelectedCountry(country);
                                setIsCountryDropdownOpen(false);
                                setCountrySearch("");
                              }}
                              className={`flex h-9 w-full items-center rounded-lg p-1 text-left transition-colors hover:bg-background-neutral dark:hover:bg-white/5 ${
                                selectedCountry.country === country.country
                                  ? "bg-background-neutral dark:bg-white/5"
                                  : ""
                              }`}
                            >
                              <span className="flex shrink-0 pl-1">
                                <img
                                  src={country.flag}
                                  alt={`${country.name} flag`}
                                  className="h-6 w-6 rounded-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              </span>
                              <span className="flex min-w-0 items-center gap-2 pl-2 pr-4">
                                <span className="truncate text-sm font-medium text-text-body dark:text-white/80">
                                  {country.name}
                                </span>
                                <span className="shrink-0 text-sm text-text-body dark:text-white/50">
                                  ({country.code})
                                </span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="flex items-center justify-center py-4 text-sm text-text-secondary dark:text-white/50">
                            No countries found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <span className="pl-2 text-sm text-text-placeholder dark:text-white/30">
                  {selectedCountry.code}
                </span>

                <input
                  type="tel"
                  id="phone"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phoneNumber}
                  onChange={(e) =>
                    setPhoneNumber(
                      sanitizePhoneNumberInputForCountry(
                        e.target.value,
                        selectedCountry,
                      ),
                    )
                  }
                  placeholder="Enter your phone number"
                  className="h-full w-full bg-transparent px-2 text-sm text-text-body placeholder:text-text-placeholder focus:outline-none disabled:cursor-not-allowed dark:text-white/80 dark:placeholder:text-white/30"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-[rgba(255,236,194,0.08)] p-2">
          <div className="py-[2px]">
            <InformationSquareIcon className="h-4 w-4 shrink-0 text-text-secondary dark:text-white/50" />
          </div>
          <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
            {copy.infoCard}
          </p>
        </div>

        <button
          type="button"
          onClick={handlePhoneSubmit}
          disabled={
            isLoading ||
            (showFullNameField && !name.trim()) ||
            !phoneNumber.trim() ||
            !phoneValidation.ok
          }
          className="h-10 w-full rounded-xl bg-lavender-500 px-3 py-2.5 text-sm font-medium tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 disabled:cursor-not-allowed disabled:bg-border-input dark:disabled:bg-[#2e2e2e]"
        >
          {isLoading ? "Sending..." : copy.cta}
        </button>
      </motion.div>
    );
  };

  const renderEnterOtp = () => (
    <motion.div key="enter-otp" {...fadeInOut} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 text-start">
        <ArrowLeft02Icon
          className="h-7 w-7 cursor-pointer text-text-disabled dark:text-white/40"
          onClick={() => setStep(STEPS.ENTER_PHONE)}
        />
        <DialogTitle
          id={titleId}
          className="text-lg font-semibold leading-6 text-text-body dark:text-white"
        >
          Enter the code we sent you
        </DialogTitle>
        <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-body dark:text-white/50">
          We sent a 6-digit code to{" "}
          {formattedPhone.replace(/(\+\d+\s+\d{3})[\s\d]+(\d{2})/, "$1**$2")} to
          verify your number.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <label className="text-base font-medium leading-6 text-text-body dark:text-white/80">
          6-digit code
        </label>
        <div className="flex justify-center gap-3">
          {[...Array(6)].map((_, index) => {
            const isFilled = Boolean(otpCode[index]);
            return (
              <input
                key={index}
                type="text"
                maxLength={1}
                value={otpCode[index] || ""}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  if (value.length <= 1) {
                    const newOtp = otpCode.split("");
                    newOtp[index] = value;
                    setOtpCode(newOtp.join(""));

                    if (value && index < 5) {
                      const nextInput = e.target.parentElement?.children[
                        index + 1
                      ] as HTMLInputElement;
                      nextInput?.focus();
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !otpCode[index] && index > 0) {
                    const prevInput = (e.target as HTMLInputElement).parentElement
                      ?.children[index - 1] as HTMLInputElement;
                    prevInput?.focus();
                  }
                }}
                className={`h-12 w-11 rounded-xl border bg-background-neutral px-2 py-3 text-center text-base font-medium text-text-body transition-all focus:outline-none dark:bg-white/5 dark:text-white ${
                  isFilled
                    ? "border-input-focus dark:border-white"
                    : "border-transparent focus:border-input-focus dark:focus:border-white"
                }`}
              />
            );
          })}
        </div>
        {attemptsRemaining < 3 && (
          <AnimatedComponent
            variant={slideInOut}
            className="text-start text-xs text-red-500"
          >
            {attemptsRemaining === 0
              ? "0 attempts remaining, please request a new OTP"
              : `${attemptsRemaining} attempts remaining`}
          </AnimatedComponent>
        )}

        <div className="text-start text-base font-medium leading-6">
          <span className="text-text-secondary dark:text-white/50">
            Didn&apos;t receive a code?{" "}
          </span>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={isLoading}
            className="text-lavender-500 hover:text-lavender-600 disabled:opacity-50"
          >
            Resend
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => handleClose()}
          className="h-10 shrink-0 rounded-xl bg-accent-gray px-3 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-gray-100 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        >
          <span className="px-1 tracking-[-0.14px]">Cancel</span>
        </button>
        <button
          type="button"
          onClick={handleOtpSubmit}
          disabled={isLoading || otpCode.length !== 6}
          className="h-10 flex-1 rounded-xl bg-lavender-500 px-3 py-2.5 text-sm font-medium tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 disabled:cursor-not-allowed disabled:bg-border-input dark:disabled:bg-[#2e2e2e]"
        >
          {isLoading ? "Verifying..." : "Continue"}
        </button>
      </div>
    </motion.div>
  );

  const renderVerified = () => (
    <motion.div key="verified" {...fadeInOut} className="flex flex-col gap-4">
      <div className="relative h-[186px] w-full overflow-hidden rounded-2xl">
        <div aria-hidden="true">
          <div className="absolute left-[273px] top-[103px] flex size-[12.029px] items-center justify-center">
            <div className="rotate-[18deg]">
              <div className="relative flex size-[9.546px] items-center justify-center rounded-[2.426px] bg-[#00acff] opacity-70 blur-[1px]">
                <SmileIcon className="size-[5.966px] text-white" />
              </div>
            </div>
          </div>
          <div className="absolute left-[61px] top-[131px] flex size-[22.036px] items-center justify-center">
            <div className="rotate-[-18deg]">
              <div className="relative flex size-[17.488px] items-center justify-center rounded-[4.445px] bg-[#ffb633] opacity-20 blur-[3.556px]">
                <PassportIcon className="size-[10.93px] text-white" />
              </div>
            </div>
          </div>
          <div className="absolute left-[184.04px] top-[73.04px] flex size-[21.912px] items-center justify-center">
            <div className="rotate-[14.4deg]">
              <div className="relative flex size-[18px] items-center justify-center rounded-[4.575px] bg-[#ff7d52] opacity-30 blur-[2px]">
                <MapPinpoint02Icon className="size-[11.25px] text-white" />
              </div>
            </div>
          </div>
          <CheckmarkCircle01Icon
            className={`absolute left-1/2 top-[17px] size-10 -translate-x-1/2 ${drawerSuccessIconClasses}`}
          />
        </div>

        <div className="absolute left-1/2 top-[79px] w-full max-w-[322px] -translate-x-1/2 space-y-3 text-center">
          <DialogTitle
            as="h2"
            id={titleId}
            className="text-lg font-semibold leading-6 text-text-body dark:text-white"
          >
            Phone number verification successful!
          </DialogTitle>
          <p className="text-sm font-normal leading-5 tracking-[-0.14px] text-text-body dark:text-white/70">
            You can now start converting your crypto to fiats at zero fees on
            noblocks
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => handleClose()}
        className="h-11 w-full rounded-xl bg-lavender-500 text-sm font-medium tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600"
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="412px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[20px] !border-[0.3px] !border-border-light !bg-white !p-5 dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName="fixed inset-0 bg-[rgba(0,0,0,0.3)] backdrop-blur-[2px]"
    >
      <AnimatePresence mode="wait">
        {step === STEPS.ENTER_PHONE && renderEnterPhone()}
        {step === STEPS.ENTER_OTP && renderEnterOtp()}
        {step === STEPS.VERIFIED && renderVerified()}
      </AnimatePresence>
    </AnimatedModal>
  );
}
