"use client";
import Link from "next/link";
import Cookies from "js-cookie";
import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Checkbox,
  Label,
  Field,
} from "@headlessui/react";

const Button = ({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`cursor-pointer rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-all hover:scale-105 ${
      className || ""
    }`}
  >
    {children}
  </button>
);

const CookieConsent = () => {
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [consent, setConsent] = useState({
    marketing: false,
    analytics: false,
    essential: true,
  });

  const modalVariants = {
    hidden: { opacity: 0, y: 50, transition: { duration: 0.3 } },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  useEffect(() => {
    const cookieConsent = Cookies.get("cookieConsent");
    if (!cookieConsent) {
      setIsBannerVisible(true);
    }
  }, []);

  const handleCustomize = () => {
    setIsBannerVisible(false);
    setIsModalOpen(true);
  };

  const dispatchCookieConsent = () => {
    window.dispatchEvent(new Event("cookieConsent"));
  };

  const handleAcceptAll = () => {
    const consentData = { marketing: true, analytics: true, essential: true };
    setConsent(consentData);
    Cookies.set("cookieConsent", JSON.stringify(consentData), { expires: 365 });
    dispatchCookieConsent();
    setIsBannerVisible(false);
  };

  const handleRejectNonEssential = () => {
    const consentData = { marketing: false, analytics: false, essential: true };
    setConsent(consentData);
    Cookies.set("cookieConsent", JSON.stringify(consentData), { expires: 365 });
    dispatchCookieConsent();
    setIsBannerVisible(false);
    setIsModalOpen(false);
  };

  const handleAcceptSelected = () => {
    Cookies.set("cookieConsent", JSON.stringify(consent), { expires: 365 });
    dispatchCookieConsent();
    setIsModalOpen(false);
  };

  const handleCheckboxChange = (type: string, checked: boolean) => {
    setConsent({ ...consent, [type]: checked });
  };

  const CheckboxField = ({
    label,
    description,
    checked,
    onChange,
    disabled = false,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  }) => (
    <Field className="mt-2 flex">
      <Label
        className={`max-w-64 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        {label}
        <span className="text-text-secondary">: {description}</span>
      </Label>
      <Checkbox
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={`group ml-auto mt-1 block size-5 flex-shrink-0 rounded border-2 border-border-light bg-lavender-50 data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:bg-transparent dark:data-[checked]:border-lavender-500 dark:data-[checked]:bg-lavender-500 ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        <svg
          className="stroke-white opacity-0 group-data-[checked]:opacity-100"
          viewBox="0 0 14 14"
          fill="none"
        >
          <title>
            {checked ? "Checked" : "Unchecked"} {label}
          </title>
          <path
            d="M3 8L6 11L11 3.5"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Checkbox>
    </Field>
  );

  return (
    <>
      <AnimatePresence>
        {isBannerVisible && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { delay: 2, duration: 0.3 },
            }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed z-50 p-4 max-sm:bottom-0 max-sm:left-0 max-sm:right-0 sm:bottom-5 sm:right-5"
          >
            <div className="w-full space-y-4 rounded-[30px] border border-border-light bg-background-neutral px-5 py-6 shadow-lg transition-colors dark:border-white/5 dark:bg-surface-overlay sm:max-w-[25.75rem] sm:rounded-3xl">
              <div className="space-y-3 text-lavender-500">
                <h2 className="text-lg font-semibold">We use cookies</h2>
                <p className="text-foreground text-sm">
                  Our website utilizes cookies to enhance your experience.{" "}
                  <Link
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lavender-500 hover:underline"
                  >
                    Learn more
                  </Link>
                </p>
              </div>
              <div className="flex gap-4 max-xsm:flex-col">
                <Button
                  onClick={handleCustomize}
                  className="bg-lavender-50 text-lavender-500 hover:bg-lavender-100 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  Customize
                </Button>
                <Button
                  onClick={handleRejectNonEssential}
                  className="min-w-fit bg-lavender-50 text-lavender-500 hover:bg-lavender-100 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  Reject all
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  className="min-w-fit flex-1 bg-lavender-500 text-white hover:opacity-80"
                >
                  Accept all
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <Dialog
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            className="relative z-40"
          >
            <DialogBackdrop className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm backdrop-filter transition-opacity data-[closed]:opacity-0" />
            <DialogPanel className="fixed inset-0 flex items-end justify-center transition-transform data-[closed]:scale-95 data-[closed]:opacity-0 sm:items-center sm:p-4">
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={modalVariants}
                className="w-full space-y-4 rounded-t-[30px] bg-lavender-50 px-5 py-6 shadow-lg dark:border-white/10 dark:bg-surface-overlay dark:shadow-xl sm:max-w-[25.75rem] sm:rounded-[30px]"
              >
                <div className="space-y-3 text-lavender-500">
                  <DialogTitle className="text-lg font-semibold">
                    We use cookies
                  </DialogTitle>
                  <p className="text-foreground text-sm">
                    Our website utilizes cookies to enhance your experience.{" "}
                    <Link
                      href="/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lavender-500 hover:underline"
                    >
                      Learn more
                    </Link>
                  </p>
                </div>

                <div className="space-y-4 rounded-2xl border border-lavender-100 bg-lavender-50 p-4 text-sm dark:border-white/10 dark:bg-neutral-800 dark:text-white/80">
                  <h3>Select preferred cookies</h3>
                  <CheckboxField
                    label="Marketing Cookies"
                    description="To deliver relevant ads and track engagement across platforms."
                    checked={consent.marketing}
                    onChange={(checked: boolean) =>
                      handleCheckboxChange("marketing", checked)
                    }
                  />
                  <CheckboxField
                    label="Analytics Cookies"
                    description="To understand how users interact with our website (e.g., Google Analytics)."
                    checked={consent.analytics}
                    onChange={(checked: boolean) =>
                      handleCheckboxChange("analytics", checked)
                    }
                  />
                  <CheckboxField
                    label="Essential Cookies"
                    description="To monitor and optimize site functionality (required)"
                    checked
                    disabled
                  />
                </div>

                <div className="flex space-x-2 max-sm:pb-4">
                  <Button
                    onClick={handleRejectNonEssential}
                    className="flex-1 bg-lavender-50 text-lavender-500 hover:bg-lavender-100 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  >
                    Reject all
                  </Button>
                  <Button
                    onClick={handleAcceptSelected}
                    className="flex-1 bg-lavender-500 text-white"
                  >
                    Accept
                  </Button>
                </div>
              </motion.div>
            </DialogPanel>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};

export default CookieConsent;
