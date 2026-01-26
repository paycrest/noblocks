"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallets } from "@privy-io/react-auth";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  AiPhone01Icon,
  Message01Icon,
  ArrowDown01Icon,
  TelephoneIcon,
  InformationSquareIcon,
  ArrowLeft02Icon,
} from "hugeicons-react";
import { parsePhoneNumber } from "libphonenumber-js";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { fadeInOut, AnimatedComponent, slideInOut } from "./AnimatedComponents";
import { classNames } from "../utils";
import {
  fetchCountries,
  getPopularCountries,
  searchCountries,
  type Country,
} from "../lib/countries";

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
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

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
        .catch((error) => {
          console.error("Failed to load countries:", error);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsCountryDropdownOpen(false);
        setCountrySearch("");
      }
    };

    if (isCountryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isCountryDropdownOpen]);

  const handlePhoneSubmit = useCallback(async () => {
    if (!phoneNumber.trim() || !walletAddress) {
      toast.error("Please enter a valid phone number");
      return;
    }

    try {
      // Combine selected country code with phone number
      let fullPhoneNumber = phoneNumber.trim();
      if (!fullPhoneNumber.startsWith("+")) {
        // Remove any leading zeros and add selected country code
        fullPhoneNumber = fullPhoneNumber.replace(/^0+/, "");
        fullPhoneNumber = selectedCountry.code + fullPhoneNumber;
      }

      // Validate phone number format
      const parsed = parsePhoneNumber(fullPhoneNumber);
      if (!parsed || !parsed.isValid()) {
        toast.error("Please enter a valid phone number");
        return;
      }

      setIsLoading(true);

      const response = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: fullPhoneNumber,
          walletAddress: walletAddress,
          name: name,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFormattedPhone(data.phoneNumber);
        setProvider(data.provider);
        setStep(STEPS.ENTER_OTP);
        const providerName =
          data.provider === "kudisms"
            ? "KudiSMS"
            : data.provider === "termii"
              ? "Termii"
              : "Twilio";
        toast.success(`OTP sent via ${providerName}`);
      } else {
        toast.error(data.error || "Failed to send OTP");
      }
    } catch (error) {
      console.error("Phone submission error:", error);
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [phoneNumber, walletAddress, selectedCountry, name]);

  const handleOtpSubmit = useCallback(async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      toast.error("Please enter the 6-digit OTP code");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          otpCode: otpCode,
          walletAddress: walletAddress,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStep(STEPS.VERIFIED);
      } else {
        toast.error(data.error || "Invalid OTP code");
        if (data.attemptsRemaining !== undefined) {
          setAttemptsRemaining(data.attemptsRemaining);
        }
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      toast.error("Failed to verify OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [otpCode, formattedPhone, walletAddress]);

  const handleResendOtp = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: formattedPhone,
          walletAddress: walletAddress,
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
      toast.error("Failed to resend OTP");
    } finally {
      setIsLoading(false);
    }
  }, [formattedPhone, walletAddress]);

  const handleClose = () => {
    onClose();
    // Reset state when modal is closed
    setStep(STEPS.ENTER_PHONE);
    setPhoneNumber("");
    setFormattedPhone("");
    setOtpCode("");
    setAttemptsRemaining(3);
    setIsCountryDropdownOpen(false);
    setCountrySearch("");
  };

  const renderEnterPhone = () => (
    <motion.div key="enter-phone" {...fadeInOut} className="space-y-4">
      <div className="space-y-3 text-start">
        <InformationSquareIcon className="h-[22.17px] w-[22.17px] text-gray-400 dark:text-white/40" />
        <DialogTitle className="text-lg text-text-body dark:text-white">
          Verify your number to start swapping
        </DialogTitle>
        <p className="text-sm font-light text-text-secondary dark:text-white/50">
          Enter your fullname & phone number to unlock your first swaps on
          Noblocks. No extra documents required.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl p-4 dark:bg-surface-canvas">
        <div className="space-y-2">
          <label
            htmlFor="fullname"
            className="text-sm font-medium text-text-secondary dark:text-white/70"
          >
            Full name
          </label>
          <input
            type="text"
            id="fullname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your fullname"
            className="min-h-12 w-full rounded-xl border border-border-input bg-transparent px-4 py-3 text-sm text-neutral-900 transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-black2 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-within:border-white/40"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="phone"
            className="text-sm font-medium text-text-secondary dark:text-white/70"
          >
            Phone number
          </label>
          <div className="relative">
            <div
              ref={dropdownRef}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
            >
              <button
                type="button"
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors"
              >
                <img
                  src={selectedCountry.flag}
                  alt={`${selectedCountry.name} flag`}
                  className="object-fit h-[18px] w-[18px] rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span className="text-sm text-text-secondary dark:text-white/50">
                  {selectedCountry.code}
                </span>
                <ArrowDown01Icon
                  className={`h-3 w-3 text-text-secondary transition-transform dark:text-white/50 ${
                    isCountryDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isCountryDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-80 overflow-hidden rounded-xl border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-surface-canvas">
                  <div className="border-b border-border-input p-3 dark:border-white/10">
                    <input
                      type="text"
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full rounded-lg border border-border-input bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-text-placeholder focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/30 dark:focus:border-white/40"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto">
                    {isLoadingCountries ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="text-sm text-text-secondary dark:text-white/50">
                          Loading countries...
                        </div>
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
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${
                            selectedCountry.country === country.country
                              ? "bg-gray-50 dark:bg-white/5"
                              : ""
                          }`}
                        >
                          <img
                            src={country.flag}
                            alt={`${country.name} flag`}
                            className="object-fit h-[18px] w-[18px] rounded-full"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <span className="min-w-[3rem] text-sm text-text-secondary dark:text-white/50">
                            {country.code}
                          </span>
                          <span className="truncate text-sm text-neutral-900 dark:text-white/80">
                            {country.name}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="flex items-center justify-center py-4">
                        <div className="text-sm text-text-secondary dark:text-white/50">
                          No countries found
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <input
              type="tel"
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="enter your phone number"
              className="min-h-12 w-full rounded-xl border border-border-input bg-transparent py-3 pl-24 pr-4 text-sm text-neutral-900 transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-black2 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-within:border-white/40"
              style={{
                paddingLeft: `${selectedCountry.code.length * 8 + 60}px`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Info message */}
      <div className="flex items-start gap-2 rounded-xl bg-background-neutral p-3 dark:bg-white/5">
        <InformationSquareIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-white/40" />
        <p className="text-sm font-light leading-[20px] text-text-secondary dark:text-white/50">
          By clicking "Verify and start", you consent to recieving transactional
          text messages for notifications and alerts from Noblocks. Reply STOP
          to opt out. you agree to our{" "}
          <a
            href="https://paycrest.io/privacy-policy"
            className="text-lavender-600"
          >
            Privacy Policy and terms & conditions.
          </a>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={handlePhoneSubmit}
        disabled={isLoading || !phoneNumber.trim()}
        className={`${primaryBtnClasses} w-full`}
      >
        {isLoading ? "Sending..." : "Verify and start"}
      </button>
    </motion.div>
  );

  const renderEnterOtp = () => (
    <motion.div key="enter-otp" {...fadeInOut} className="space-y-4">
      <div className="space-y-3 text-start">
        <ArrowLeft02Icon
          className="h-[28px] w-[28px] cursor-pointer text-gray-400 dark:text-white/40"
          onClick={() => setStep(STEPS.ENTER_PHONE)}
        />
        <DialogTitle className="text-lg font-semibold text-text-body dark:text-white">
          Enter the code we texted you
        </DialogTitle>
        <p className="text-sm font-light text-text-secondary dark:text-white/50">
          We sent a 6-digit code to{" "}
          {formattedPhone.replace(/(\+\d+\s+\d{3})[\s\d]+(\d{2})/, "$1**$2")} to
          verify your number.
        </p>
      </div>

      {/* OTP Input */}
      <div className="w-full space-y-4 rounded-2xl p-4 dark:bg-surface-canvas">
        <label
          htmlFor="otp"
          className="text-sm font-medium text-text-secondary dark:text-white/70"
        >
          6-digit code
        </label>
        <div className="flex justify-center gap-2">
          {[...Array(6)].map((_, index) => (
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
                // Handle backspace to move to previous input
                if (e.key === "Backspace" && !otpCode[index] && index > 0) {
                  const prevInput = (e.target as HTMLInputElement).parentElement
                    ?.children[index - 1] as HTMLInputElement;
                  prevInput?.focus();
                }
              }}
              className="h-[48px] w-[44px] rounded-2xl bg-transparent text-center text-lg font-medium text-neutral-900 transition-all focus-within:border-lavender-600 focus:outline-none dark:bg-surface-overlay dark:text-lavender-600 dark:focus-within:border dark:focus-within:border-lavender-600"
            />
          ))}
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

        <div className="text-start text-sm text-text-secondary dark:text-white/50">
          Didn&apos;t receive a code?{" "}
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={isLoading}
            className="text-sm text-lavender-600 hover:text-lavender-700 disabled:opacity-50 dark:text-lavender-600 dark:hover:text-lavender-300"
          >
            Resend
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleClose()}
          className={`${secondaryBtnClasses} w-md`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleOtpSubmit}
          disabled={isLoading || otpCode.length !== 6}
          className={`${primaryBtnClasses} w-full`}
        >
          {isLoading ? "Verifying..." : "Continue"}
        </button>
      </div>
    </motion.div>
  );

  const renderVerified = () => (
    <motion.div key="verified" {...fadeInOut} className="space-y-3 text-center">
      <CheckmarkCircle01Icon className="mx-auto mt-4 h-[40px] w-[40px] text-green-600 dark:text-green-400" />

      <div className="space-y-3 px-6">
        <h2 className="max-w-md text-lg font-medium text-text-body dark:text-white">
          Phone number verification successful!
        </h2>
        <p className="text-sm font-light text-text-secondary dark:text-white/70">
          You can now start converting your crypto to fiats at zero fees on
          noblocks
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          onVerified(formattedPhone);
          onClose();
          // Reset state for next use
          setStep(STEPS.ENTER_PHONE);
          setPhoneNumber("");
          setFormattedPhone("");
          setOtpCode("");
          setAttemptsRemaining(3);
          setIsCountryDropdownOpen(false);
          setCountrySearch("");
        }}
        className={`${primaryBtnClasses} w-full`}
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto w-full max-w-[396px] rounded-3xl bg-white p-6 shadow-xl dark:border-[0.3px] dark:border-white/5 dark:bg-surface-overlay">
          <AnimatePresence mode="wait">
            {step === STEPS.ENTER_PHONE && renderEnterPhone()}
            {step === STEPS.ENTER_OTP && renderEnterOtp()}
            {step === STEPS.VERIFIED && renderVerified()}
          </AnimatePresence>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
