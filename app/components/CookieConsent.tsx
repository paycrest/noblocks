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
  className: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`py-2.5 px-4 text-sm text-center rounded-xl font-medium transition-all ${className}`}
  >
    {children}
  </button>
);

export const CookieConsent = () => {
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
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <Field className="flex mt-2">
      <Label className="max-w-64 cursor-pointer">
        {label}
        <span className="text-text-secondary dark:text-white/50">
          : {description}
        </span>
      </Label>
      <Checkbox
        checked={checked}
        onChange={onChange}
        className="group ml-auto mt-1 block size-5 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-gray-100 data-[checked]:border-lavender-blue-500 data-[checked]:bg-lavender-blue-500 dark:border-white/30 dark:bg-transparent dark:data-[checked]:border-lavender-blue-500 dark:data-[checked]:bg-lavender-blue-500"
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
            className="fixed bottom-5 right-5 bg-white p-5 rounded-3xl shadow-lg z-[52] border border-gray-200 space-y-4 max-w-[25.75rem] w-full dark:border-white/5 dark:bg-surface-overlay transition-colors"
          >
            <div className="space-y-3 text-text-primary dark:text-white">
              <h2 className="text-lg font-semibold">We use cookies</h2>
              <p className="text-sm dark:text-white/80">
                Our website utilizes cookies to enhance your experience.{" "}
                <Link
                  href="/privacy-policy"
                  className="text-text-link no-underline hover:underline"
                >
                  Learn more
                </Link>
              </p>
            </div>

            <div className="flex space-x-4">
              <Button
                onClick={handleCustomize}
                className="bg-gray-100 text-text-primary hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white"
              >
                Customize
              </Button>
              <Button
                onClick={handleRejectNonEssential}
                className="bg-gray-100 text-text-primary hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white"
              >
                Reject all
              </Button>
              <Button
                onClick={handleAcceptAll}
                className="flex-1 bg-lavender-blue-500 text-white hover:bg-mid-royal"
              >
                Accept all
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <Dialog
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            className="z-[52] relative"
          >
            <DialogBackdrop className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm backdrop-filter transition-opacity data-[closed]:opacity-0" />
            <DialogPanel className="fixed inset-0 flex items-center justify-center p-4 transition-transform data-[closed]:scale-95 data-[closed]:opacity-0">
              <motion.div
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={modalVariants}
                className="bg-white p-5 rounded-3xl shadow-lg max-w-[25.75rem] w-full space-y-4 dark:bg-surface-overlay dark:border-white/5 dark:shadow-xl"
              >
                <div className="space-y-3 text-text-primary dark:text-white">
                  <DialogTitle className="text-lg font-semibold">
                    We use cookies
                  </DialogTitle>
                  <p className="text-sm dark:text-white/80">
                    Our website utilizes cookies to enhance your experience.{" "}
                    <Link
                      href="/privacy-policy"
                      className="text-text-link no-underline hover:underline"
                    >
                      Learn more
                    </Link>
                  </p>
                </div>

                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-sm space-y-4 text-text-primary dark:text-white/80 dark:bg-white/5 dark:border-white/5">
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
                    description="To monitor and optimize site functionality"
                    checked={consent.essential}
                    onChange={() => {}}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleRejectNonEssential}
                    className="flex-1 bg-gray-100 text-text-primary hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white"
                  >
                    Reject all
                  </Button>
                  <Button
                    onClick={handleAcceptSelected}
                    className="flex-1 bg-lavender-blue-500 text-white hover:bg-lavender-blue-400"
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
