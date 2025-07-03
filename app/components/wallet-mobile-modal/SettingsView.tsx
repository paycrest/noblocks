import React from "react";
import {
  ArrowLeft02Icon,
  Mail01Icon,
  Logout03Icon,
  ColorsIcon,
  CustomerService01Icon,
  Key01Icon,
  ArrowRight01Icon,
} from "hugeicons-react";
import { ImSpinner } from "react-icons/im";
import { ThemeSwitch } from "../ThemeSwitch";
import config from "../../lib/config";

interface SettingsViewProps {
  isInjectedWallet: boolean;
  showMfaEnrollmentModal: () => void;
  user: any;
  updateEmail: () => void;
  linkEmail: () => void;
  handleLogout: () => void;
  isLoggingOut: boolean;
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  isInjectedWallet,
  showMfaEnrollmentModal,
  user,
  updateEmail,
  linkEmail,
  handleLogout,
  isLoggingOut,
  onBack,
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <button type="button" title="Back" onClick={onBack}>
        <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
      </button>
      <h2 className="text-lg font-semibold text-text-body dark:text-white">
        Settings
      </h2>
      <div className="w-10"></div>
    </div>
    <div className="space-y-2 *:min-h-11">
      {!isInjectedWallet && (
        <button
          type="button"
          onClick={showMfaEnrollmentModal}
          className="flex w-full items-center gap-2.5"
        >
          <Key01Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
          <p className="text-left text-text-body dark:text-white/80">
            {user?.mfaMethods?.length ? "Manage MFA" : "Enable MFA"}
          </p>
        </button>
      )}
      {!isInjectedWallet && user?.email ? (
        <button
          type="button"
          onClick={updateEmail}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
            <span className="text-text-body dark:text-white/80">
              Linked email
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="max-w-36 truncate text-text-disabled dark:text-white/30">
              {user.email.address}
            </span>
            <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
          </div>
        </button>
      ) : !isInjectedWallet ? (
        <button
          type="button"
          onClick={linkEmail}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
            <span className="text-text-body dark:text-white/80">
              Link email address
            </span>
          </div>
          <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
        </button>
      ) : null}
      <a
        href={config.contactSupportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <CustomerService01Icon className="size-5 text-outline-gray dark:text-white/50" />
          <span className="text-text-body dark:text-white/80">
            Contact support
          </span>
        </div>
        <ArrowLeft02Icon className="size-4 text-outline-gray dark:text-white/50" />
      </a>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <ColorsIcon className="size-5 text-outline-gray dark:text-white/50" />
          <span className="text-text-body dark:text-white/80">Theme</span>
        </div>
        <ThemeSwitch />
      </div>
      {!isInjectedWallet && (
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Logout03Icon className="size-5 text-outline-gray dark:text-white/50" />
            <span className="text-text-body dark:text-white/80">Sign out</span>
          </div>
          {isLoggingOut && (
            <ImSpinner className="size-4 animate-spin text-outline-gray" />
          )}
        </button>
      )}
    </div>
  </div>
);
